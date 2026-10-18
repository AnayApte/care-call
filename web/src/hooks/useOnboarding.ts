import { useCallback, useEffect, useRef, useState } from "react";
import { api, fixturePatient, type Patient } from "@/lib/api";
import { createGestureTrigger, createHandArbiter, createPersonalClassifier, createSampleCapture, startHandTracker, type Handedness, type Label, type Sample, type TrackedFrame, type TriggerState } from "@/lib/cv";
import { loadHandedness, saveHandedness } from "@/lib/handednessPref";
import { TRAINING_ORDER } from "@/lib/labels";
import { sounds } from "@/lib/sounds";
import { createSteadinessGate } from "@/lib/steady";
import { spreadFrames, trimSamples } from "@/lib/samples";
import { drawHand, type HandTone } from "@/lib/drawHand";

export type Phase = "loading" | "waiting" | "countdown" | "holding" | "done" | "listening";

const SAMPLES_PER_LABEL = 15;
const HOLD_MS = 3000;
const COUNTDOWN_MS = 1700; // from hand detected to recording start
const HOLD_CAP_MS = 10000;
const DONE_SHOW_MS = 1100;
const AUTO_START_AFTER_MS = 0; // the countdown begins as soon as a hand is detected
const TOAST_MS = 3000;
const LISTEN_GRACE_MS = 3000;
const MAX_HOLD_VECTORS = 30; // frames remembered from a recognition hold
const FEEDBACK_SAMPLES = 5; // frames spread across the hold that become samples after Yes or a corrected word // after training the hand is still holding the last pose; do not fire on it

export type OnboardingState = {
  phase: Phase;
  patient: Patient;
  index: number;
  countdown: number;
  progress: number;
  hint: string;
  lifting: Label | null;
  handPresent: boolean;
  trigger: TriggerState;
  /** Recognised word, shown until the caregiver dismisses it with a tap or the spacebar. */
  result: Label | null;
  /** Leave-one-out accuracy of the personal model, once all five labels are trained. */
  accuracy: number | null;
  /** Feedback card after a result: asking "was that right", then "what did they mean", then done. */
  feedback: "asking" | "correcting" | "done" | null;
  toast: { text: string; kind: "info" | "error" } | null;
};

const idleTrigger: TriggerState = { label: null, progress: 0, cooldownMs: 0, fired: null };

function completeLabels(samples: Sample[]): Set<Label> {
  const counts = new Map<Label, number>();
  for (const s of samples) counts.set(s.label, (counts.get(s.label) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= SAMPLES_PER_LABEL).map(([l]) => l));
}

export function useOnboarding(videoRef: React.RefObject<HTMLVideoElement | null>, canvasRef: React.RefObject<HTMLCanvasElement | null>, cameraId?: string) {
  const [state, setState] = useState<OnboardingState>({
    phase: "loading", patient: fixturePatient, index: 0, countdown: 0, progress: 0, hint: "", lifting: null,
    handPresent: false, trigger: idleTrigger, result: null, accuracy: null, feedback: null, toast: null,
  });

  // Mutable session state read by the 30 fps frame loop. Kept out of React state to avoid stale closures.
  const session = useRef({
    phase: "loading" as Phase,
    index: 0,
    samples: [] as Sample[],
    capture: null as ReturnType<typeof createSampleCapture> | null,
    holdStartedAt: 0,
    captureStartedAt: 0,
    gate: createSteadinessGate(),
    classifier: createPersonalClassifier(),
    trigger: createGestureTrigger(),
    /** Which hand counts. Learns from training holds, then locks to the hand the patient trained with. */
    arbiter: createHandArbiter({ locked: loadHandedness() }),
    /** Hand seen in the most recent hold frame, cast as a vote when the hold completes. */
    holdHandedness: null as Handedness | null,
    timers: [] as number[],
    listenGraceUntil: 0,
    handPresent: false,
    result: null as Label | null,
    resultRequestId: null as string | null,
    holdVectors: [] as number[][],
    firedVectors: [] as number[][],
    handSeenSince: null as number | null,
    countdownStartedAt: 0,
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
    const label = TRAINING_ORDER[s.index];
    s.samples = [...s.samples, ...samples];
    s.capture = null;
    voteHand();
    sounds.check();
    setPhase("done", { progress: 1, lifting: null, hint: s.index + 1 < TRAINING_ORDER.length ? `Next: ${TRAINING_ORDER[s.index + 1]}.` : "That is all five." });
    void Promise.all(samples.map((smp) => api.postSample(smp.label, smp.vector))).then((results) => {
      if (results.some((r) => !r.ok)) toast("Server unreachable, training kept on this device", "error");
    });
    later(() => {
      if (s.index + 1 >= TRAINING_ORDER.length) {
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
  }, [setPhase, later, toast, voteHand]);

  const onFrame = useCallback((frame: TrackedFrame) => {
    const s = session.current;
    const present = frame.vector !== null;
    if (present) s.holdHandedness = frame.handedness;
    const tone: HandTone = s.phase === "holding" || s.phase === "listening" ? "live" : "faint";
    if (canvasRef.current && videoRef.current) drawHand(canvasRef.current, videoRef.current, frame.landmarks, tone);
    if (present !== s.handPresent) { s.handPresent = present; patch({ handPresent: present }); }
    if (s.phase === "countdown") {
      // Smooth ring during the countdown: progress follows elapsed time, the digit follows whole seconds.
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
        s.capture = createSampleCapture(TRAINING_ORDER[s.index], frame.timestamp);
      }
      const result = s.capture.update(frame.vector, frame.timestamp);
      if (result.failed) { s.capture = null; patch({ progress: 0, hint: "Hold still." }); return; }
      if (result.done) { finishLabel(result.samples); return; }
      patch({ progress: Math.min(1, (frame.timestamp - s.captureStartedAt) / HOLD_MS), hint: "Hold until the ring is full." });
      return;
    }
    if (s.phase === "listening") {
      if (s.result || performance.now() < s.listenGraceUntil) { s.trigger.reset(); return; }
      const prediction = frame.vector ? s.classifier.predict(frame.vector) : null;
      const next = s.trigger.update(prediction, frame.timestamp);
      if (next.progress > 0 && frame.vector && prediction && prediction.label === next.label) {
        s.holdVectors = [...s.holdVectors.slice(-(MAX_HOLD_VECTORS - 1)), frame.vector.slice()];
      } else if (next.progress === 0 && !next.fired) {
        s.holdVectors = [];
      }
      if (import.meta.env.DEV) (window as unknown as { __ccDebug?: unknown }).__ccDebug = { prediction, next, ready: s.classifier.isReady(), samples: s.samples.length };
      patch({ trigger: next });
      if (next.fired) {
        const fired = next.fired;
        s.result = fired.label;
        s.resultRequestId = null;
        s.firedVectors = s.holdVectors;
        s.holdVectors = [];
        sounds.check();
        patch({ result: fired.label, feedback: "asking" });
        void api.createRequest(fired.label, fired.confidence).then((r) => {
          if (!r.ok) { toast(`Could not send: ${r.error}`, "error"); return; }
          s.resultRequestId = r.data.id;
        });
      }
      return;
    }
  }, [patch, toast, startCountdown, finishLabel, canvasRef, videoRef]);


  // Load patient and samples, then pick the starting point.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [patientRes, samplesRes] = await Promise.all([api.getPatient(), api.getSamples()]);
      if (cancelled) return;
      const s = session.current;
      if (patientRes.ok) patch({ patient: patientRes.data });
      if (samplesRes.ok) s.samples = trimSamples(samplesRes.data.map((x) => ({ label: x.label as Label, vector: x.vector })));
      else toast("Server unreachable, training will stay on this device", "error");
      try {
        s.classifier.setSamples(s.samples);
      } catch {
        s.samples = [];
        s.classifier.setSamples([]);
        toast("Saved training could not load. Please retrain movements.", "error");
      }
      const done = completeLabels(s.samples);
      const firstMissing = TRAINING_ORDER.findIndex((l) => !done.has(l));
      if (firstMissing === -1) {
        setPhase("listening", { index: TRAINING_ORDER.length - 1, accuracy: s.classifier.leaveOneOutAccuracy() });
      } else {
        s.index = firstMissing;
        setPhase("waiting", { index: firstMissing, hint: "Any movement they can repeat works." });
      }
    })();
    return () => { cancelled = true; };
  }, [patch, setPhase, toast]);

  // Camera and frame loop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    const controller = new AbortController();
    const { trigger, arbiter } = session.current;
    startHandTracker(video, onFrame, (err) => {
      const name = err instanceof Error ? err.name : "";
      toast(name === "NotAllowedError" ? "Camera blocked. Allow camera access in the address bar and reload." : "No camera found or it is in use by another app.", "error");
    }, () => toast("Hand model failed to load. Check the network and reload.", "error"), controller.signal, cameraId, arbiter)
      .then((fn) => { if (cancelled) fn(); else stop = fn; })
      .catch(() => toast("Could not start hand tracking.", "error"));
    return () => { cancelled = true; controller.abort(); stop?.(); trigger.reset(); };
  }, [videoRef, onFrame, toast, cameraId]);

  useEffect(() => () => { session.current.timers.forEach((id) => window.clearTimeout(id)); }, []);

  /** Clears the shown result and goes back to watching. Bound to a tap on the screen and the spacebar. */
  const dismiss = useCallback(() => {
    const s = session.current;
    if (!s.result) return;
    s.result = null;
    s.resultRequestId = null;
    s.firedVectors = [];
    s.trigger.reset();
    patch({ result: null, feedback: null, trigger: idleTrigger });
  }, [patch]);

  /** Tells the server how the request went and, when `label` is given, feeds a few hold frames back into the
   * personal model under that word. "Nothing" passes no label: the server hears it was wrong, the model is untouched. */
  const learnFrom = useCallback((label: Label | null, wasCorrect: boolean) => {
    const s = session.current;
    const vectors = spreadFrames(s.firedVectors, FEEDBACK_SAMPLES);
    s.firedVectors = [];
    if (s.resultRequestId) void api.postFeedback(s.resultRequestId, wasCorrect);
    if (wasCorrect && !s.arbiter.lock()) voteHand();
    if (!label || vectors.length === 0) { patch({ feedback: "done" }); return; }
    const fresh: Sample[] = vectors.map((vector) => ({ label, vector }));
    try {
      s.samples = trimSamples([...s.samples, ...fresh]);
      s.classifier.setSamples(s.samples);
    } catch {
      toast("Could not update the model from that feedback", "error");
      patch({ feedback: "done" });
      return;
    }
    void Promise.all(fresh.map((smp) => api.postSample(smp.label, smp.vector))).then((results) => {
      if (results.some((r) => !r.ok)) toast("Server unreachable, the correction is kept on this device", "error");
    });
    patch({ feedback: "done", accuracy: s.classifier.leaveOneOutAccuracy() });
  }, [patch, toast, voteHand]);

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
    s.trigger.reset();
    s.result = null;
    s.resultRequestId = null;
    s.firedVectors = [];
    s.holdVectors = [];
    s.handSeenSince = null;
    s.arbiter.reset();
    s.holdHandedness = null;
    saveHandedness(null);
    setPhase("waiting", { index: 0, lifting: null, progress: 0, trigger: idleTrigger, result: null, accuracy: null, feedback: null, hint: "Any movement they can repeat works." });
    const r = await api.deleteSamples();
    if (!r.ok) toast("Server unreachable, old training may come back on reload", "error");
  }, [setPhase, toast]);

  return { state, start: startCountdown, retrain, dismiss, feedbackYes, feedbackNo, feedbackCorrect };
}
