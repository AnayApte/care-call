import { useCallback, useEffect, useRef, useState } from "react";
import { api, API_BASE, PATIENT_ID, fixturePatient, type Patient } from "@/lib/api";
import { createPersonalClassifier, createSampleCapture, startHandTracker, type HandFrame, type Label, type Sample } from "@/lib/cv";
import { createGestureTrigger, type TriggerState } from "@/cv/trigger";
import { TRAINING_ORDER } from "@/lib/labels";
import { sounds } from "@/lib/sounds";
import { createSteadinessGate } from "@/lib/steady";
import { spreadFrames, trimSamples } from "@/lib/samples";
import { drawHand, type HandTone } from "@/lib/drawHand";
import { loadApprovedConfig, sanitizeAdaptConfig, type AdaptConfig } from "@/cv/adapt";
import { browserStore, createSessionReporter, startSessionReporting } from "@/cv/sessionReporter";
import { createRetrainingPlan, replaceLabelSamples } from "@/cv/retraining";

export type Phase = "loading" | "waiting" | "countdown" | "holding" | "done" | "listening";

const HOLD_MS = 3000;
const COUNTDOWN_MS = 1700; // from hand detected to recording start
const HOLD_CAP_MS = 10000;
const DONE_SHOW_MS = 1100;
const AUTO_START_AFTER_MS = 0; // the countdown begins as soon as a hand is detected
const TOAST_MS = 3000;
const LISTEN_GRACE_MS = 3000; // after training the hand is still holding the last pose; do not fire on it
const MAX_HOLD_VECTORS = 30; // frames remembered from a recognition hold
const FEEDBACK_SAMPLES = 5; // examples spread across a confirmed or corrected hold

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
  /** Recognised word, shown until the caregiver dismisses it with a tap or the spacebar. */
  result: Label | null;
  delivery: "sending" | "sent" | "failed" | null;
  feedback: "asking" | "correcting" | "done" | null;
  /** Leave-one-out accuracy of the personal model, once all five labels are trained. */
  accuracy: number | null;
  toast: { text: string; kind: "info" | "error" } | null;
};

const idleTrigger: TriggerState = { label: null, progress: 0, cooldownMs: 0, fired: null };

export function useOnboarding(videoRef: React.RefObject<HTMLVideoElement | null>, canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [state, setState] = useState<OnboardingState>({
    phase: "loading", patient: fixturePatient, index: 0, order: TRAINING_ORDER, countdown: 0, progress: 0, hint: "", lifting: null,
    handPresent: false, trigger: idleTrigger, result: null, delivery: null, feedback: null, accuracy: null, toast: null,
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
    timers: [] as number[],
    listenGraceUntil: 0,
    handPresent: false,
    result: null as Label | null,
    requestSerial: 0,
    resultRequestId: null as string | null,
    pendingFeedback: null as boolean | null,
    feedbackAnswered: false,
    holdVectors: [] as number[][],
    firedVectors: [] as number[][],
    handSeenSince: null as number | null,
    countdownStartedAt: 0,
    lastPredictionAt: -Infinity,
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

  const applyConfig = useCallback((config: AdaptConfig) => {
    const s = session.current;
    // Close the old hold before rotating reports to the new settings version.
    s.trigger.reset();
    reports.setConfigVersion(config.version);
    s.trigger.setConfig(config);
    s.triggerState = idleTrigger;
    s.holdVectors = [];
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

  const finishLabel = useCallback((samples: Sample[]) => {
    const s = session.current;
    const label = s.order[s.index];
    s.samples = replaceLabelSamples(s.samples, label, samples);
    s.retraining.complete(label);
    s.capture = null;
    sounds.check();
    setPhase("done", { progress: 1, lifting: null, hint: s.index + 1 < s.order.length ? `Next: ${s.order[s.index + 1]}.` : "Movements ready." });
    const trainingPlan = s.retraining;
    const trainingKey = trainingPlan.key();
    void Promise.all(samples.map((smp) => api.postSample(smp.label, smp.vector))).then((results) => {
      if (results.some((r) => !r.ok)) toast("Server unreachable, training kept on this device", "error");
      else trainingPlan.complete(label, true, trainingKey);
    });
    later(() => {
      if (s.index + 1 >= s.order.length) {
        s.classifier.setSamples(s.samples);
        s.trigger.reset();
        s.listenGraceUntil = performance.now() + LISTEN_GRACE_MS;
        setPhase("listening", { lifting: label, progress: 0, trigger: idleTrigger, accuracy: s.classifier.leaveOneOutAccuracy() });
        return;
      }
      s.index += 1;
      s.handSeenSince = null;
      setPhase("waiting", { index: s.index, lifting: label, progress: 0, hint: "Any movement they can repeat works." });
    }, DONE_SHOW_MS);
  }, [setPhase, later, toast]);

  const onFrame = useCallback((frame: HandFrame) => {
    const s = session.current;
    const present = frame.vector !== null;
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
      if (s.result) { s.trigger.reset(); return; }
      // Approved updates wait for the current hold to finish; the engine keeps its cooldown.
      if (s.pendingConfig && s.triggerState.progress === 0) {
        applyConfig(s.pendingConfig);
        const order = s.retraining.order(s.samples, TRAINING_ORDER);
        if (order.length) {
          s.order = order; s.index = 0;
          s.handSeenSince = null;
          setPhase("waiting", { order, index: 0, progress: 0, lifting: null, trigger: idleTrigger, result: null, delivery: null,
            hint: "Your caregiver asked you to record these movements again." });
          return;
        }
        toast("Approved movement settings loaded");
      }
      if (performance.now() < s.listenGraceUntil) { s.trigger.reset(); return; }
      // Keep the contract's 12 observations about one second while the overlay stays smooth.
      if (frame.vector && frame.timestamp - s.lastPredictionAt < 1000 / 12) return;
      s.lastPredictionAt = frame.timestamp;
      const prediction = frame.vector ? s.classifier.predict(frame.vector) : null;
      const previous = s.triggerState;
      const next = s.trigger.update(prediction, frame.timestamp);
      if (next.label !== previous.label || (!next.fired && next.progress <= previous.progress)) s.holdVectors = [];
      if ((next.progress > 0 || next.fired) && frame.vector && prediction && prediction.label === next.label) {
        s.holdVectors = [...s.holdVectors.slice(-(MAX_HOLD_VECTORS - 1)), frame.vector.slice()];
      } else if (next.progress === 0 && !next.fired) s.holdVectors = [];
      s.triggerState = next;
      if (import.meta.env.DEV) (window as unknown as { __ccDebug?: unknown }).__ccDebug = { prediction, next, ready: s.classifier.isReady(), samples: s.samples.length };
      patch({ trigger: next });
      if (next.fired) {
        const fired = next.fired;
        s.result = fired.label;
        s.resultRequestId = null;
        s.pendingFeedback = null;
        s.feedbackAnswered = false;
        s.firedVectors = s.holdVectors;
        s.holdVectors = [];
        const serial = ++s.requestSerial;
        sounds.check();
        patch({ result: fired.label, delivery: "sending", feedback: "asking" });
        void api.createRequest(fired.label, fired.confidence).then((r) => {
          if (serial !== s.requestSerial) return;
          patch({ delivery: r.ok ? "sent" : "failed" });
          if (!r.ok) toast(`Could not send: ${r.error}`, "error");
          else {
            s.resultRequestId = r.data.id;
            if (s.pendingFeedback !== null) {
              void api.postFeedback(r.data.id, s.pendingFeedback);
              s.pendingFeedback = null;
            }
          }
        });
      }
      return;
    }
  }, [patch, toast, startCountdown, finishLabel, canvasRef, videoRef, applyConfig, setPhase]);

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
      if (samplesRes.ok) s.samples = trimSamples(samplesRes.data.map((x) => ({ label: x.label as Label, vector: x.vector })));
      else toast("Server unreachable, training will stay on this device", "error");
      applyConfig(approved ?? s.config);
      if (!approved) toast("Could not load movement settings. Keeping the current settings.", "error");
      try {
        s.classifier.setSamples(s.samples);
      } catch {
        s.samples = [];
        s.classifier.setSamples([]);
        toast("Saved training could not load. Please retrain movements.", "error");
      }
      const order = s.retraining.order(s.samples, TRAINING_ORDER);
      if (order.length === 0) {
        setPhase("listening", { accuracy: s.classifier.leaveOneOutAccuracy() });
      } else {
        s.order = order; s.index = 0;
        setPhase("waiting", { index: 0, order, hint: approved?.retrain_labels.length
          ? "Your caregiver asked you to record these movements again." : "Any movement they can repeat works." });
      }
    })();
    return () => { cancelled = true; };
  }, [patch, setPhase, toast, applyConfig]);

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
    const trigger = session.current.trigger;
    startHandTracker(video, onFrame, (err) => {
      const name = err instanceof Error ? err.name : "";
      toast(name === "NotAllowedError" ? "Camera blocked. Allow camera access in the address bar and reload." : "No camera found or it is in use by another app.", "error");
    }, () => toast("Hand model failed to load. Check the network and reload.", "error"), controller.signal)
      .then((fn) => { if (cancelled) fn(); else stop = fn; })
      .catch(() => toast("Could not start hand tracking.", "error"));
    return () => { cancelled = true; controller.abort(); stop?.(); trigger.reset(); };
  }, [videoRef, onFrame, toast]);

  useEffect(() => () => { session.current.timers.forEach((id) => window.clearTimeout(id)); }, []);

  /** Clears the shown result and goes back to watching. Bound to a tap on the screen and the spacebar. */
  const dismiss = useCallback(() => {
    const s = session.current;
    if (!s.result) return;
    s.result = null;
    s.requestSerial++;
    s.resultRequestId = null;
    s.pendingFeedback = null;
    s.firedVectors = [];
    s.holdVectors = [];
    s.trigger.reset();
    s.triggerState = idleTrigger;
    s.lastPredictionAt = -Infinity;
    patch({ result: null, delivery: null, feedback: null, trigger: idleTrigger });
  }, [patch]);

  /** Keep Rey's feedback learning. "Nothing" is reported as a false trigger without teaching neutral. */
  const learnFrom = useCallback((label: Label | null, wasCorrect: boolean) => {
    const s = session.current;
    if (!s.result || s.feedbackAnswered) return;
    s.feedbackAnswered = true;
    reports.recordFeedback(label ?? "neutral", s.result);
    const vectors = spreadFrames(s.firedVectors, FEEDBACK_SAMPLES);
    s.firedVectors = [];
    if (s.resultRequestId) void api.postFeedback(s.resultRequestId, wasCorrect);
    else s.pendingFeedback = wasCorrect;
    if (!label || vectors.length === 0) { patch({ feedback: "done" }); return; }
    const fresh: Sample[] = vectors.map(vector => ({ label, vector }));
    try {
      const nextSamples = trimSamples([...s.samples, ...fresh]);
      s.classifier.setSamples(nextSamples);
      s.samples = nextSamples;
    } catch {
      toast("Could not update the model from that feedback", "error");
      patch({ feedback: "done" });
      return;
    }
    void Promise.all(fresh.map(smp => api.postSample(smp.label, smp.vector))).then(results => {
      if (results.some(r => !r.ok)) toast("Server unreachable, the correction is kept on this device", "error");
    });
    patch({ feedback: "done", accuracy: s.classifier.leaveOneOutAccuracy() });
  }, [patch, reports, toast]);
  const feedbackYes = useCallback(() => { const r = session.current.result; if (r) learnFrom(r, true); }, [learnFrom]);
  const feedbackNo = useCallback(() => patch({ feedback: "correcting" }), [patch]);
  /** `label` is what they actually meant. "Nothing" (null) only records the miss; it does not teach the model. */
  const feedbackCorrect = useCallback((label: Label | null) => learnFrom(label, false), [learnFrom]);

  const retrain = useCallback(async () => {
    const s = session.current;
    s.timers.forEach((id) => window.clearTimeout(id));
    s.samples = [];
    s.classifier.setSamples([]);
    s.index = 0;
    s.order = TRAINING_ORDER.slice();
    s.retraining.reset();
    s.trigger.reset();
    s.result = null;
    s.requestSerial++;
    s.resultRequestId = null;
    s.pendingFeedback = null;
    s.firedVectors = [];
    s.holdVectors = [];
    s.handSeenSince = null;
    s.lastPredictionAt = -Infinity;
    s.triggerState = idleTrigger;
    setPhase("waiting", { index: 0, order: s.order, lifting: null, progress: 0, trigger: idleTrigger, result: null, delivery: null, feedback: null, accuracy: null, hint: "Any movement they can repeat works." });
    const r = await api.deleteSamples();
    if (!r.ok) toast("Server unreachable, old training may come back on reload", "error");
  }, [setPhase, toast]);

  return { state, start: startCountdown, retrain, dismiss, feedbackYes, feedbackNo, feedbackCorrect };
}
