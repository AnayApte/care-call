import { useCallback, useEffect, useRef, useState } from "react";
import { api, API_BASE, PATIENT_ID, fixturePatient, type Patient } from "@/lib/api";
import { createHandArbiter, createPersonalClassifier, createSampleCapture, startHandTracker, type Handedness, type Label, type Sample, type TrackedFrame } from "@/lib/cv";
import { createGestureTrigger, type TriggerState } from "@/cv/trigger";
import { loadHandedness, saveHandedness } from "@/lib/handednessPref";
import { TRAINING_ORDER, displayWord, toLabel, trainingOrder } from "@/lib/labels";
import { createSteadinessGate } from "@/lib/steady";
import { trimSamples } from "@/lib/samples";
import { drawHand, type HandTone } from "@/lib/drawHand";
import { loadApprovedConfig, sanitizeAdaptConfig, type AdaptConfig } from "@/cv/adapt";
import { browserStore, createSessionReporter, startSessionReporting } from "@/cv/sessionReporter";
import { createRetrainingPlan, replaceLabelSamples } from "@/cv/retraining";
import { createRequestFlow, type DeliveryState } from "@/cv/requestFlow";
import { createSampleQueue } from "@/cv/sampleQueue";
import { createRequestsClient } from "@/lib/requests";

export type Phase = "loading" | "waiting" | "countdown" | "holding" | "done" | "listening";

const HOLD_MS = 3000;
const COUNTDOWN_MS = 1700; // from hand detected to recording start
const HOLD_CAP_MS = 10000;
const DONE_SHOW_MS = 1100;
const AUTO_START_AFTER_MS = 0; // the countdown begins as soon as a hand is detected
const TOAST_MS = 3000;
const LISTEN_GRACE_MS = 3000; // after training the hand is still holding the last pose; do not fire on it
const RELEASE_STUCK_MS = 6000; // if Rest is not recognised by then, offer to re-record it

export type OnboardingState = {
  phase: Phase;
  patient: Patient;
  index: number;
  order: Label[];
  /** Only added words are left to train, so the caregiver may skip them for now. */
  canSkip: boolean;
  countdown: number;
  progress: number;
  hint: string;
  lifting: Label | null;
  handPresent: boolean;
  trigger: TriggerState;
  /** The current request stays visible until acknowledgement and a fresh release. */
  result: Label | null;
  flow: DeliveryState;
  cameraError: string;
  savingTraining: boolean;
  trainingPending: number;
  trainingSaveError: string;
  feedback: "asking" | "correcting" | "done" | null;
  /** Before listening can fire: "grace" while the last training pose is ignored, "release" until Rest is recognised. */
  warmup: "grace" | "release" | null;
  /** Grace progress, 0 to 1. */
  warmupProgress: number;
  /** Rest has not been recognised for a while; offer to re-record it. */
  releaseStuck: boolean;
  /** Leave-one-out accuracy of the personal model, once all five labels are trained. */
  accuracy: number | null;
  toast: { text: string; kind: "info" | "error" } | null;
};

const idleTrigger: TriggerState = { label: null, progress: 0, cooldownMs: 0, fired: null };

export function useOnboarding(videoRef: React.RefObject<HTMLVideoElement | null>, canvasRef: React.RefObject<HTMLCanvasElement | null>, cameraId?: string) {
  const [state, setState] = useState<OnboardingState>({
    phase: "loading", patient: fixturePatient, index: 0, order: TRAINING_ORDER, canSkip: false, countdown: 0, progress: 0, hint: "", lifting: null,
    handPresent: false, trigger: idleTrigger, result: null, feedback: null, accuracy: null, toast: null,
    warmup: null, warmupProgress: 0, releaseStuck: false,
    flow: { phase: "waiting_release", request: null, input: null, error: "", online: true }, cameraError: "", savingTraining: false, trainingPending: 0, trainingSaveError: "",
  });

  const reportsRef = useRef<ReturnType<typeof createSessionReporter> | null>(null);
  if (!reportsRef.current) reportsRef.current = createSessionReporter(API_BASE, PATIENT_ID, { storage: browserStore() });
  const reports = reportsRef.current;

  // Mutable session state read by the camera loop.
  const session = useRef({
    phase: "loading" as Phase,
    index: 0,
    order: TRAINING_ORDER.slice(),
    vocabulary: fixturePatient.vocabulary,
    /** True while the add-word form is open, so typing near the camera cannot send a request. */
    paused: false,
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
    warmup: null as OnboardingState["warmup"],
    releaseWaitSince: null as number | null,
    releaseStuck: false,
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

  const flowRef = useRef<ReturnType<typeof createRequestFlow> | null>(null);
  // The external speaker handles audio; browser delivery and acknowledgement stay visual.
  if (!flowRef.current) flowRef.current = createRequestFlow(createRequestsClient(API_BASE, PATIENT_ID),
    `carecall:active-request:${API_BASE}:${PATIENT_ID}`, { storage: browserStore() });
  const flow = flowRef.current;
  const sampleQueueRef = useRef<ReturnType<typeof createSampleQueue> | null>(null);
  if (!sampleQueueRef.current) sampleQueueRef.current = createSampleQueue(API_BASE, PATIENT_ID, browserStore(),
    (label, key) => session.current.retraining.complete(label, true, key));
  const sampleQueue = sampleQueueRef.current;
  const saveTraining = useCallback(async () => {
    const pending = sampleQueue.pendingCount();
    if (!pending) { patch({ savingTraining: false, trainingPending: 0, trainingSaveError: "" }); return; }
    patch({ savingTraining: true, trainingPending: pending, trainingSaveError: "" });
    try { await sampleQueue.flush(); }
    catch (error) { patch({ trainingSaveError: error instanceof Error ? error.message : "Training could not be saved to the server." }); }
    finally { patch({ savingTraining: false, trainingPending: sampleQueue.pendingCount() }); }
  }, [sampleQueue, patch]);

  useEffect(() => flow.subscribe(next => {
    const s = session.current;
    s.result = next.input?.label as Label ?? null;
    s.resultRequestId = next.request?.id ?? null;
    patch({ flow: next, result: s.result, ...(!next.input ? { feedback: null } : {}) });
  }), [flow, patch]);
  useEffect(() => {
    // An unconfirmed send (including one restored after a reload) retries itself; the server dedupes by client_request_id.
    const poll = () => { if (flow.snapshot().phase === "delivery_unknown") void flow.retry(); else void flow.poll(); };
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
    session.current.countdownStartedAt = performance.now();
    setPhase("countdown", { countdown: Math.ceil(COUNTDOWN_MS / 1000), progress: 0, hint: "Get ready." });
    later(beginHold, COUNTDOWN_MS);
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
    setPhase("done", { progress: 1, lifting: null, hint: s.index + 1 < s.order.length ? `Next: ${displayWord(s.order[s.index + 1], s.vocabulary)}.` : "Movements ready." });
    sampleQueue.enqueue(label, samples.map(sample => sample.vector), s.retraining.key());
    if (!sampleQueue.storageOk()) toast("Browser storage is unavailable. Keep this page open until training is saved.", "error");
    void saveTraining();
    later(() => {
      if (s.index + 1 >= s.order.length) {
        s.classifier.setSamples(s.samples);
        s.trigger.reset();
        flow.interrupt();
        s.listenGraceUntil = performance.now() + LISTEN_GRACE_MS;
        setPhase("listening", { lifting: label, progress: 0, trigger: idleTrigger, canSkip: false, accuracy: s.classifier.leaveOneOutAccuracy() });
        return;
      }
      s.index += 1;
      s.handSeenSince = null;
      setPhase("waiting", { index: s.index, lifting: label, progress: 0, hint: "Any movement they can repeat works." });
    }, DONE_SHOW_MS);
  }, [setPhase, later, voteHand, sampleQueue, saveTraining, toast, flow]);

  /** Tells the screen why it is not listening yet, so it never shows "Ready" while it cannot fire. */
  const updateWarmup = useCallback(() => {
    const s = session.current;
    const now = performance.now();
    const snap = flow.snapshot();
    const warmup = now < s.listenGraceUntil ? "grace" : snap.phase === "waiting_release" && !snap.input ? "release" : null;
    if (warmup === "release") s.releaseWaitSince ??= now; else s.releaseWaitSince = null;
    const stuck = s.releaseWaitSince !== null && now - s.releaseWaitSince > RELEASE_STUCK_MS;
    const progress = warmup === "grace" ? Math.min(1, 1 - (s.listenGraceUntil - now) / LISTEN_GRACE_MS) : 0;
    if (warmup === "grace" || warmup !== s.warmup || stuck !== s.releaseStuck) {
      s.warmup = warmup; s.releaseStuck = stuck;
      patch({ warmup, warmupProgress: progress, releaseStuck: stuck });
    }
  }, [flow, patch]);

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
      if (s.paused) { s.trigger.reset(); s.triggerState = idleTrigger; return; }
      if (frame.vector && frame.timestamp - s.lastPredictionAt < 1000 / 12) return;
      s.lastPredictionAt = frame.timestamp;
      const prediction = frame.vector ? s.classifier.predict(frame.vector) : null;
      flow.observe(prediction, frame.timestamp);
      updateWarmup();
      if (import.meta.env.DEV) (window as unknown as { __ccDebug?: unknown }).__ccDebug = { prediction, flow: flow.snapshot().phase, ready: s.classifier.isReady(), samples: s.samples.length };
      if (flow.snapshot().phase !== "ready") {
        s.trigger.reset(); s.triggerState = idleTrigger;
        patch({ trigger: idleTrigger });
        return;
      }
      // Approved updates wait for the current hold to finish; the engine keeps its cooldown.
      if (s.pendingConfig && s.triggerState.progress === 0) {
        applyConfig(s.pendingConfig);
        const order = s.retraining.order(s.samples, trainingOrder(s.vocabulary));
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
      patch({ trigger: next });
      if (next.fired) {
        const fired = next.fired;
        s.feedbackAnswered = false;
        patch({ feedback: "asking" });
        void flow.fire(fired.label, fired.confidence);
      }
      return;
    }
  }, [patch, toast, startCountdown, finishLabel, canvasRef, videoRef, applyConfig, setPhase, flow, updateWarmup]);

  // Load patient and samples, then pick the starting point.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [patientRes, samplesRes, approved] = await Promise.all([
        api.getPatient(), api.getSamples(), loadApprovedConfig(API_BASE, PATIENT_ID).catch(() => null),
      ]);
      if (cancelled) return;
      const s = session.current;
      if (patientRes.ok) {
        s.vocabulary = patientRes.data.vocabulary;
        patch({ patient: patientRes.data });
      }
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
      const order = s.retraining.order(s.samples, trainingOrder(s.vocabulary));
      void saveTraining();
      if (order.length === 0) {
        setPhase("listening", { accuracy: s.classifier.leaveOneOutAccuracy() });
      } else {
        s.order = order; s.index = 0;
        setPhase("waiting", { index: 0, order, canSkip: order.every(l => !TRAINING_ORDER.includes(l)), hint: approved?.retrain_labels.length
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

  // Bumping this restarts the camera only; the hand model stays loaded.
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const reloadCamera = useCallback(() => setCameraAttempt((n) => n + 1), []);

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
  }, [videoRef, onFrame, toast, cameraId, cameraAttempt, patch, flow]);

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
  const dismiss = useCallback(() => flow.recoverFailed(), [flow]);
  /** Demo tap or Space: marks the request handled and goes straight back to Ready. */
  const continueDemo = useCallback(async () => {
    const { skipped, ackError } = await flow.skip();
    if (!skipped) return;
    const s = session.current;
    s.trigger.reset();
    s.triggerState = idleTrigger;
    patch({ trigger: idleTrigger, feedback: null });
    if (ackError) toast(`Back to Ready, but the caregiver unit may still show it: ${ackError}`, "error");
  }, [flow, patch, toast]);

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
    // Retrain starts over with the default words: added words and their recordings are removed.
    s.vocabulary = s.vocabulary.filter(w => TRAINING_ORDER.includes(w.label));
    s.samples = s.samples.filter(smp => TRAINING_ORDER.includes(smp.label));
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
    setPhase("waiting", { index: 0, order: s.order, canSkip: false, lifting: null, progress: 0, trigger: idleTrigger, result: null, feedback: null, accuracy: null, hint: "Any movement they can repeat works." });
    setState(st => ({ ...st, patient: { ...st.patient, vocabulary: s.vocabulary } }));
    flow.interrupt();
    const r = await api.clearVocabulary();
    if (!r.ok) toast("Server unreachable, added words may come back on reload", "error");
  }, [setPhase, toast, flow]);

  /** Stops the trigger while the add-word form is open. */
  const setPaused = useCallback((paused: boolean) => {
    const s = session.current;
    s.paused = paused;
    s.trigger.reset();
    s.triggerState = idleTrigger;
    patch({ trigger: idleTrigger });
  }, [patch]);

  /** Saves a new word on the server, then trains just that word. Returns an error message, or null on success. */
  const addWord = useCallback(async (display: string, speech: string): Promise<string | null> => {
    const s = session.current;
    const label = toLabel(display);
    if (!label || label === "neutral") return "Use a word that starts with a letter.";
    if (s.vocabulary.some(w => w.label === label)) return "That word is already on the list.";
    if (flow.snapshot().input) return "Wait for the current request to finish first.";
    const r = await api.addWord({ label, display: display.trim(), speech: speech.trim() });
    if (!r.ok) return `Could not add the word: ${r.error}`;
    s.vocabulary = r.data.vocabulary;
    s.order = [label];
    s.index = 0;
    s.paused = false;
    s.trigger.reset();
    s.triggerState = idleTrigger;
    s.handSeenSince = null;
    flow.interrupt();
    patch({ patient: r.data });
    setPhase("waiting", { index: 0, order: s.order, canSkip: true, lifting: null, progress: 0, trigger: idleTrigger, hint: "Any movement they can repeat works." });
    return null;
  }, [patch, setPhase, flow]);

  /** Re-records only Rest, for when listening cannot start because Rest is not recognised. */
  const rerecordRest = useCallback(() => {
    const s = session.current;
    if (flow.snapshot().input) return;
    s.timers.forEach((id) => window.clearTimeout(id));
    s.timers = [];
    s.order = ["neutral"];
    s.index = 0;
    s.capture = null;
    s.handSeenSince = null;
    s.trigger.reset();
    s.triggerState = idleTrigger;
    s.releaseWaitSince = null; s.releaseStuck = false; s.warmup = null;
    flow.interrupt();
    setPhase("waiting", { order: s.order, index: 0, canSkip: false, lifting: null, progress: 0, trigger: idleTrigger,
      warmup: null, releaseStuck: false, hint: "Rest the hand the way it normally sits." });
  }, [setPhase, flow]);

  /** Leaves an added word untrained and goes back to listening. It is offered again on the next load. */
  const skipWord = useCallback(() => {
    const s = session.current;
    s.timers.forEach((id) => window.clearTimeout(id));
    s.timers = [];
    s.capture = null;
    s.trigger.reset();
    s.triggerState = idleTrigger;
    flow.interrupt();
    s.listenGraceUntil = performance.now() + LISTEN_GRACE_MS;
    setPhase("listening", { canSkip: false, lifting: null, progress: 0, trigger: idleTrigger, toast: null });
  }, [setPhase, flow]);

  return { state, start: startCountdown, retrain, reloadCamera, dismiss, continueDemo, feedbackYes, feedbackNo, feedbackCorrect,
    feedbackSkip: () => patch({ feedback: "done" }), retryRequest: flow.retry, checkRequest: flow.poll,
    saveTraining, addWord, skipWord, setPaused, rerecordRest };
}
