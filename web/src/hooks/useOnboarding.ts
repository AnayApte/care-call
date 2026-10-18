import { useCallback, useEffect, useRef, useState } from "react";
import { api, API_BASE, PATIENT_ID, fixturePatient, type Patient } from "@/lib/api";
import { createHandArbiter, createPersonalClassifier, createSampleCapture, startHandTracker, type Handedness, type Label, type Sample, type TrackedFrame } from "@/lib/cv";
import { createGestureTrigger, type TriggerState } from "@/cv/trigger";
import { loadHandedness, saveHandedness } from "@/lib/handednessPref";
import { TRAINING_ORDER } from "@/lib/labels";
import { sounds } from "@/lib/sounds";
import { createSteadinessGate } from "@/lib/steady";
import { trimSamples } from "@/lib/samples";
import { drawHand, type HandTone } from "@/lib/drawHand";
import { loadApprovedConfig, sanitizeAdaptConfig, type AdaptConfig } from "@/cv/adapt";
import { browserStore, createSessionReporter, startSessionReporting } from "@/cv/sessionReporter";
import { createRetrainingPlan, replaceLabelSamples } from "@/cv/retraining";
import { createRequestFlow, type DeliveryState } from "@/cv/requestFlow";
import { createSampleQueue } from "@/cv/sampleQueue";
import { createRequestsClient } from "@/lib/requests";
import { createPatientSpeech, type VoiceState } from "@/lib/patientSpeech";

export type Phase = "loading" | "waiting" | "countdown" | "holding" | "done" | "listening";

const HOLD_MS = 3000;
const COUNTDOWN_MS = 1700; // from hand detected to recording start
const HOLD_CAP_MS = 10000;
const DONE_SHOW_MS = 1100;
const AUTO_START_AFTER_MS = 0; // the countdown begins as soon as a hand is detected
const TOAST_MS = 3000;
const LISTEN_GRACE_MS = 3000; // after training the hand is still holding the last pose; do not fire on it

export type OnboardingState = {
  phase: Phase;
  patient: Patient;
  index: number;
  order: Label[];
  countdown: number;
  progress: number;
  hint: string;
  lifting: Label | null;
  handPresent: boolean;
  trigger: TriggerState;
  /** The current request stays visible until acknowledgement and a fresh release. */
  result: Label | null;
  flow: DeliveryState;
  voice: VoiceState;
  cameraError: string;
  savingTraining: boolean;
  feedback: "asking" | "correcting" | "done" | null;
  /** Leave-one-out accuracy of the personal model, once all five labels are trained. */
  accuracy: number | null;
  toast: { text: string; kind: "info" | "error" } | null;
};

const idleTrigger: TriggerState = { label: null, progress: 0, cooldownMs: 0, fired: null };

export function useOnboarding(videoRef: React.RefObject<HTMLVideoElement | null>, canvasRef: React.RefObject<HTMLCanvasElement | null>, cameraId?: string) {
  const [state, setState] = useState<OnboardingState>({
    phase: "loading", patient: fixturePatient, index: 0, order: TRAINING_ORDER, countdown: 0, progress: 0, hint: "", lifting: null,
    handPresent: false, trigger: idleTrigger, result: null, feedback: null, accuracy: null, toast: null,
    flow: { phase: "waiting_release", request: null, input: null, error: "", online: true }, voice: "off", cameraError: "", savingTraining: false,
  });

  const reportsRef = useRef<ReturnType<typeof createSessionReporter> | null>(null);
  if (!reportsRef.current) reportsRef.current = createSessionReporter(API_BASE, PATIENT_ID, { storage: browserStore() });
  const reports = reportsRef.current;

  // Mutable session state read by the camera loop.
  const session = useRef({
    phase: "loading" as Phase,
    index: 0,
    order: TRAINING_ORDER.slice(),
    samples: [] as Sample[],
    capture: null as ReturnType<typeof createSampleCapture> | null,
    holdStartedAt: 0,
    captureStartedAt: 0,
    gate: createSteadinessGate(),
    classifier: createPersonalClassifier(),
    trigger: createGestureTrigger(undefined, attempt => reports.recordAttempt(attempt)),
    triggerState: idleTrigger,
    config: sanitizeAdaptConfig(null),
    pendingConfig: null as AdaptConfig | null,
    retraining: createRetrainingPlan(API_BASE, PATIENT_ID, browserStore()),
    arbiter: createHandArbiter({ locked: loadHandedness() }),
    holdHandedness: null as Handedness | null,
    timers: [] as number[],
    listenGraceUntil: 0,
    handPresent: false,
    result: null as Label | null,
    resultRequestId: null as string | null,
    feedbackAnswered: false,
    handSeenSince: null as number | null,
    countdownStartedAt: 0,
    lastPredictionAt: -Infinity,
    lastFrameAt: -Infinity,
    cameraStalled: false,
  });

  const patch = useCallback((p: Partial<OnboardingState>) => setState((s) => ({ ...s, ...p })), []);
  const setPhase = useCallback((phase: Phase, extra: Partial<OnboardingState> = {}) => {
    session.current.phase = phase;
    patch({ phase, ...extra });
  }, [patch]);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    session.current.timers.push(id);
  }, []);
  const toast = useCallback((text: string, kind: "info" | "error" = "info") => {
    patch({ toast: { text, kind } });
    later(() => patch({ toast: null }), TOAST_MS);
  }, [patch, later]);

  const speechRef = useRef<ReturnType<typeof createPatientSpeech> | null>(null);
  if (!speechRef.current) speechRef.current = createPatientSpeech(API_BASE, voice => patch({ voice }));
  const speech = speechRef.current;
  const flowRef = useRef<ReturnType<typeof createRequestFlow> | null>(null);
  if (!flowRef.current) flowRef.current = createRequestFlow(createRequestsClient(API_BASE, PATIENT_ID),
    `carecall:active-request:${API_BASE}:${PATIENT_ID}`, { storage: browserStore(), speak: text => speech.say(text) });
  const flow = flowRef.current;
  const sampleQueueRef = useRef<ReturnType<typeof createSampleQueue> | null>(null);
  if (!sampleQueueRef.current) sampleQueueRef.current = createSampleQueue(API_BASE, PATIENT_ID, browserStore(),
    (label, key) => session.current.retraining.complete(label, true, key));
  const sampleQueue = sampleQueueRef.current;
  const saveTraining = useCallback(async () => {
    patch({ savingTraining: true });
    try { await sampleQueue.flush(); }
    catch { toast("Training save failed. The recording is kept here; retry saving.", "error"); }
    finally { patch({ savingTraining: sampleQueue.pendingCount() > 0 }); }
  }, [sampleQueue, patch, toast]);

  useEffect(() => flow.subscribe(next => {
    const s = session.current;
    s.result = next.input?.label as Label ?? null;
    s.resultRequestId = next.request?.id ?? null;
    patch({ flow: next, result: s.result, ...(!next.input ? { feedback: null } : {}) });
  }), [flow, patch]);
  useEffect(() => {
    const poll = () => { void flow.poll(); };
    poll();
    const timer = window.setInterval(poll, 1000);
    window.addEventListener("online", poll);
    return () => { window.clearInterval(timer); window.removeEventListener("online", poll); };
  }, [flow]);
  useEffect(() => {
    const retry = () => { void saveTraining(); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [saveTraining]);

  const applyConfig = useCallback((config: AdaptConfig) => {
    const s = session.current;
    // Close the old hold before rotating reports to the new settings version.
    s.trigger.reset();
    reports.setConfigVersion(config.version);
    s.trigger.setConfig(config);
    s.triggerState = idleTrigger;
    s.lastPredictionAt = -Infinity;
    s.config = config;
    s.pendingConfig = null;
    s.retraining.setConfig(config);
  }, [reports]);

  const beginHold = useCallback(() => {
    const s = session.current;
    s.capture = null;
    s.gate.reset();
    s.holdStartedAt = performance.now();
    setPhase("holding", { progress: 0, hint: "Hold until the ring is full." });
  }, [setPhase]);

  const startCountdown = useCallback(() => {
    sounds.unlock();
    session.current.countdownStartedAt = performance.now();
    setPhase("countdown", { countdown: Math.ceil(COUNTDOWN_MS / 1000), progress: 0, hint: "Get ready." });
    sounds.tick();
    later(() => { sounds.tick(); beginHold(); }, COUNTDOWN_MS);
  }, [setPhase, later, beginHold]);

  /** A completed hold with a known hand is a vote for that hand. The majority becomes the lock and is remembered. */
  const voteHand = useCallback(() => {
    const s = session.current;
    if (!s.holdHandedness) return;
    s.arbiter.vote(s.holdHandedness);
    saveHandedness(s.arbiter.lock());
  }, []);

  const finishLabel = useCallback((samples: Sample[]) => {
    const s = session.current;
    const label = s.order[s.index];
    s.samples = replaceLabelSamples(s.samples, label, samples);
    s.retraining.complete(label);
    s.capture = null;
    voteHand();
    sounds.check();
    setPhase("done", { progress: 1, lifting: null, hint: s.index + 1 < s.order.length ? `Next: ${s.order[s.index + 1]}.` : "Movements ready." });
    sampleQueue.enqueue(label, samples.map(sample => sample.vector), s.retraining.key());
    if (!sampleQueue.storageOk()) toast("Browser storage is unavailable. Keep this page open until training is saved.", "error");
    void saveTraining();
    later(() => {
      if (s.index + 1 >= s.order.length) {
        s.classifier.setSamples(s.samples);
        s.trigger.reset();
        flow.interrupt();
        s.listenGraceUntil = performance.now() + LISTEN_GRACE_MS;
        setPhase("listening", { lifting: label, progress: 0, trigger: idleTrigger, accuracy: s.classifier.leaveOneOutAccuracy() });
        return;
      }
      s.index += 1;
      s.handSeenSince = null;
      setPhase("waiting", { index: s.index, lifting: label, progress: 0, hint: "Any movement they can repeat works." });
    }, DONE_SHOW_MS);
  }, [setPhase, later, voteHand, sampleQueue, saveTraining, toast, flow]);

  const onFrame = useCallback((frame: TrackedFrame) => {
    const s = session.current;
    s.lastFrameAt = performance.now();
    if (s.cameraStalled) { s.cameraStalled = false; patch({ cameraError: "" }); }
    if (document.hidden) { s.capture = null; s.trigger.reset(); flow.interrupt(); return; }
    const present = frame.vector !== null;
    if (present) s.holdHandedness = frame.handedness;
    const tone: HandTone = s.phase === "holding" || s.phase === "listening" ? "live" : "faint";
    if (canvasRef.current && videoRef.current) drawHand(canvasRef.current, videoRef.current, frame.landmarks, tone);
    if (present !== s.handPresent) { s.handPresent = present; patch({ handPresent: present }); }
    if (s.phase === "countdown") {
      // Smooth ring during the countdown: progress follows elapsed time.
      const elapsed = performance.now() - s.countdownStartedAt;
      patch({ progress: Math.min(1, elapsed / COUNTDOWN_MS), countdown: Math.max(1, Math.ceil((COUNTDOWN_MS - elapsed) / 1000)) });
      return;
    }
    if (s.phase === "waiting") {
      if (!present) { s.handSeenSince = null; return; }
      s.handSeenSince ??= frame.timestamp;
      if (frame.timestamp - s.handSeenSince >= AUTO_START_AFTER_MS) { s.handSeenSince = null; startCountdown(); }
      return;
    }
    if (s.phase === "holding") {
      const steady = s.gate.update(frame.landmarks);
      if (performance.now() - s.holdStartedAt > HOLD_CAP_MS) {
        toast("Let's try that one again");
        startCountdown();
        return;
      }
      if (!present || !steady) {
        s.capture = null;
        patch({ progress: 0, hint: present ? "Hold still." : "Lost the hand, bring it back into the picture." });
        return;
      }
      if (!s.capture) {
        s.captureStartedAt = frame.timestamp;
        s.capture = createSampleCapture(s.order[s.index], frame.timestamp);
      }
      const result = s.capture.update(frame.vector, frame.timestamp);
      if (result.failed) { s.capture = null; patch({ progress: 0, hint: "Hold still." }); return; }
      if (result.done) { finishLabel(result.samples); return; }
      patch({ progress: Math.min(1, (frame.timestamp - s.captureStartedAt) / HOLD_MS), hint: "Hold until the ring is full." });
      return;
    }
    if (s.phase === "listening") {
      if (frame.vector && frame.timestamp - s.lastPredictionAt < 1000 / 12) return;
      s.lastPredictionAt = frame.timestamp;
      const prediction = frame.vector ? s.classifier.predict(frame.vector) : null;
      flow.observe(prediction, frame.timestamp);
      if (flow.snapshot().phase !== "ready") {
        s.trigger.reset(); s.triggerState = idleTrigger;
        patch({ trigger: idleTrigger });
        return;
      }
      // Approved updates wait for the current hold to finish; the engine keeps its cooldown.
      if (s.pendingConfig && s.triggerState.progress === 0) {
        applyConfig(s.pendingConfig);
        const order = s.retraining.order(s.samples, TRAINING_ORDER);
        if (order.length) {
          s.order = order; s.index = 0;
          s.handSeenSince = null;
          setPhase("waiting", { order, index: 0, progress: 0, lifting: null, trigger: idleTrigger, result: null,
            hint: "Your caregiver asked you to record these movements again." });
          return;
        }
        toast("Approved movement settings loaded");
      }
      if (performance.now() < s.listenGraceUntil) { s.trigger.reset(); return; }
      // Keep the contract's 12 observations about one second while the overlay stays smooth.
      const next = s.trigger.update(prediction, frame.timestamp);
      s.triggerState = next;
      if (import.meta.env.DEV) (window as unknown as { __ccDebug?: unknown }).__ccDebug = { prediction, next, ready: s.classifier.isReady(), samples: s.samples.length };
      patch({ trigger: next });
      if (next.fired) {
        const fired = next.fired;
        s.feedbackAnswered = false;
        sounds.check();
        patch({ feedback: "asking" });
        void flow.fire(fired.label, fired.confidence);
      }
      return;
    }
  }, [patch, toast, startCountdown, finishLabel, canvasRef, videoRef, applyConfig, setPhase, flow]);

  // Load patient and samples, then pick the starting point.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [patientRes, samplesRes, approved] = await Promise.all([
        api.getPatient(), api.getSamples(), loadApprovedConfig(API_BASE, PATIENT_ID).catch(() => null),
      ]);
      if (cancelled) return;
      const s = session.current;
      if (patientRes.ok) patch({ patient: patientRes.data });
      s.samples = trimSamples(sampleQueue.load(samplesRes.ok ? samplesRes.data.map(x => ({ label: x.label as Label, vector: x.vector })) : undefined));
      if (!samplesRes.ok) toast("Server unreachable. Using recordings saved on this computer.", "error");
      applyConfig(approved ?? s.config);
      for (const batch of sampleQueue.pendingLabels()) s.retraining.complete(batch.label, false, batch.trainingKey);
      if (!approved) toast("Could not load movement settings. Keeping the current settings.", "error");
      try {
        s.classifier.setSamples(s.samples);
      } catch {
        s.samples = [];
        s.classifier.setSamples([]);
        toast("Saved training could not load. Please retrain movements.", "error");
      }
      const order = s.retraining.order(s.samples, TRAINING_ORDER);
      void saveTraining();
      if (order.length === 0) {
        setPhase("listening", { accuracy: s.classifier.leaveOneOutAccuracy() });
      } else {
        s.order = order; s.index = 0;
        setPhase("waiting", { index: 0, order, hint: approved?.retrain_labels.length
          ? "Your caregiver asked you to record these movements again." : "Any movement they can repeat works." });
      }
    })();
    return () => { cancelled = true; };
  }, [patch, setPhase, toast, applyConfig, sampleQueue, saveTraining]);

  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      void loadApprovedConfig(API_BASE, PATIENT_ID).then(config => {
        const s = session.current;
        if (!stopped && config.version >= (s.pendingConfig?.version ?? s.config.version) && JSON.stringify(config) !== JSON.stringify(s.config)) {
          s.pendingConfig = config;
        }
      }).catch(() => { /* Keep working with the last approved settings while offline. */ });
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("online", refresh);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("online", refresh); };
  }, []);

  useEffect(() => {
    const trigger = session.current.trigger;
    return startSessionReporting(reports, () => trigger.reset(),
      () => toast("Usage report not sent. It is kept for retry.", "error"));
  }, [reports, toast]);

  // Camera and frame loop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    const controller = new AbortController();
    const { trigger, arbiter } = session.current;
    patch({ cameraError: "" });
    flow.interrupt();
    startHandTracker(video, onFrame, (err) => {
      const name = err instanceof Error ? err.name : "";
      patch({ cameraError: name === "NotAllowedError" ? "Camera blocked. Allow access, then reload the camera." : "No camera found or it is being used by another app." });
      flow.interrupt();
    }, () => patch({ cameraError: "Hand model could not load. Check the connection, then reload the camera." }), controller.signal, cameraId, arbiter)
      .then((fn) => { if (cancelled) fn(); else stop = fn; })
      .catch(() => toast("Could not start hand tracking.", "error"));
    return () => { cancelled = true; controller.abort(); stop?.(); trigger.reset(); };
  }, [videoRef, onFrame, toast, cameraId, patch, flow]);

  useEffect(() => () => { session.current.timers.forEach((id) => window.clearTimeout(id)); }, []);

  useEffect(() => {
    const pause = () => {
      const s = session.current;
      s.trigger.reset(); s.triggerState = idleTrigger; s.capture = null; s.gate.reset();
      flow.interrupt();
      patch({ trigger: idleTrigger });
      if (s.phase === "countdown" || s.phase === "holding") {
        s.timers.forEach(id => window.clearTimeout(id));
        setPhase("waiting", { progress: 0, hint: "Bring your hand back to record again." });
      }
    };
    const visibility = () => { if (document.hidden) pause(); };
    const watchdog = window.setInterval(() => {
      const s = session.current;
      if (performance.now() - s.lastFrameAt > 700) {
        pause();
        if (Number.isFinite(s.lastFrameAt) && !s.cameraStalled && !document.hidden) {
          s.cameraStalled = true;
          patch({ cameraError: "The camera has paused. Check the camera or reload it." });
        }
      }
    }, 500);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.clearInterval(watchdog); document.removeEventListener("visibilitychange", visibility); };
  }, [flow, patch, setPhase]);
  useEffect(() => () => speech.stop(), [speech]);
  const dismiss = useCallback(() => flow.recoverFailed(), [flow]);

  /** Save an explicit correctness vote. Guided recording changes personal samples. */
  const learnFrom = useCallback((label: Label | null, wasCorrect: boolean) => {
    const s = session.current;
    if (!s.result || !s.resultRequestId || s.feedbackAnswered) return;
    s.feedbackAnswered = true;
    const predicted = s.result;
    const requestId = s.resultRequestId;
    if (requestId) void api.postFeedback(requestId, wasCorrect, label ?? "neutral").then(r => {
      if (s.resultRequestId !== requestId) return;
      if (!r.ok) { s.feedbackAnswered = false; patch({ feedback: "asking" }); toast("Feedback was not saved. Please retry.", "error"); }
      else reports.recordFeedback(label ?? "neutral", predicted);
    });
    if (wasCorrect && !s.arbiter.lock()) voteHand();
    patch({ feedback: "done" });
  }, [patch, reports, toast, voteHand]);
  const feedbackYes = useCallback(() => { const r = session.current.result; if (r) learnFrom(r, true); }, [learnFrom]);
  const feedbackNo = useCallback(() => patch({ feedback: "correcting" }), [patch]);
  /** `label` is what they actually meant. "Nothing" (null) only records the miss; it does not teach the model. */
  const feedbackCorrect = useCallback((label: Label | null) => learnFrom(label, false), [learnFrom]);

  const retrain = useCallback(async () => {
    const s = session.current;
    s.timers.forEach((id) => window.clearTimeout(id));
    if (flow.snapshot().input) { toast("Wait for the current request to finish before retraining."); return; }
    s.index = 0;
    s.order = TRAINING_ORDER.slice();
    s.retraining.reset();
    s.trigger.reset();
    s.result = null;
    s.resultRequestId = null;
    s.handSeenSince = null;
    s.arbiter.reset();
    s.holdHandedness = null;
    saveHandedness(null);
    s.lastPredictionAt = -Infinity;
    s.triggerState = idleTrigger;
    setPhase("waiting", { index: 0, order: s.order, lifting: null, progress: 0, trigger: idleTrigger, result: null, feedback: null, accuracy: null, hint: "Any movement they can repeat works." });
    flow.interrupt();
  }, [setPhase, toast, flow]);

  return { state, start: startCountdown, retrain, dismiss, feedbackYes, feedbackNo, feedbackCorrect,
    feedbackSkip: () => patch({ feedback: "done" }), retryRequest: flow.retry, checkRequest: flow.poll,
    enableSound: async () => {
      await speech.enable();
      const current = flow.snapshot();
      if (current.request) speech.say(current.request.status === "acked" ? "Help is coming." : current.request.speech);
    }, saveTraining };
}
