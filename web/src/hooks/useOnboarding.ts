import { useCallback, useEffect, useRef, useState } from "react";
import { api, fixturePatient, type Patient } from "@/lib/api";
import { createGestureTrigger, createPersonalClassifier, createSampleCapture, startHandTracker, type HandFrame, type Label, type Sample, type TriggerState } from "@/lib/cv";
import { TRAINING_ORDER } from "@/lib/labels";
import { sounds } from "@/lib/sounds";
import { createSteadinessGate } from "@/lib/steady";
import { drawHand, type HandTone } from "@/lib/drawHand";

export type Phase = "loading" | "waiting" | "countdown" | "holding" | "done" | "listening";

const SAMPLES_PER_LABEL = 15;
const HOLD_MS = 3000;
const COUNTDOWN_FROM = 3;
const HOLD_CAP_MS = 10000;
const DONE_SHOW_MS = 1100;
const SENT_SHOW_MS = 3000;
const LISTEN_GRACE_MS = 3000; // after training the hand is still holding the last pose; do not fire on it

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
  lastSent: Label | null;
  accuracy: number | null;
  toast: { text: string; kind: "info" | "error" } | null;
};

const idleTrigger: TriggerState = { label: null, progress: 0, cooldownMs: 0, fired: null };

function completeLabels(samples: Sample[]): Set<Label> {
  const counts = new Map<Label, number>();
  for (const s of samples) counts.set(s.label, (counts.get(s.label) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= SAMPLES_PER_LABEL).map(([l]) => l));
}

export function useOnboarding(videoRef: React.RefObject<HTMLVideoElement | null>, canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [state, setState] = useState<OnboardingState>({
    phase: "loading", patient: fixturePatient, index: 0, countdown: 0, progress: 0, hint: "", lifting: null,
    handPresent: false, trigger: idleTrigger, lastSent: null, accuracy: null, toast: null,
  });

  // Mutable session state read by the camera loop.
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
    timers: [] as number[],
    listenGraceUntil: 0,
    handPresent: false,
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
    later(() => patch({ toast: null }), SENT_SHOW_MS);
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
    setPhase("countdown", { countdown: COUNTDOWN_FROM, hint: "Get ready." });
    sounds.tick();
    for (let n = COUNTDOWN_FROM - 1; n >= 1; n -= 1) {
      later(() => { patch({ countdown: n }); sounds.tick(); }, (COUNTDOWN_FROM - n) * 1000);
    }
    later(beginHold, COUNTDOWN_FROM * 1000);
  }, [setPhase, patch, later, beginHold]);

  const finishLabel = useCallback((samples: Sample[]) => {
    const s = session.current;
    const label = TRAINING_ORDER[s.index];
    s.samples = [...s.samples, ...samples];
    s.capture = null;
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
      setPhase("waiting", { index: s.index, lifting: label, progress: 0, hint: "Any movement they can repeat works." });
    }, DONE_SHOW_MS);
  }, [setPhase, later, toast]);

  const onFrame = useCallback((frame: HandFrame) => {
    const s = session.current;
    const present = frame.vector !== null;
    const tone: HandTone = s.phase === "holding" || s.phase === "listening" ? "live" : "faint";
    if (canvasRef.current && videoRef.current) drawHand(canvasRef.current, videoRef.current, frame.landmarks, tone);
    if (present !== s.handPresent) { s.handPresent = present; patch({ handPresent: present }); }
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
      if (performance.now() < s.listenGraceUntil) { s.trigger.reset(); return; }
      const prediction = frame.vector ? s.classifier.predict(frame.vector) : null;
      const next = s.trigger.update(prediction, frame.timestamp);
      if (import.meta.env.DEV) (window as unknown as { __ccDebug?: unknown }).__ccDebug = { prediction, next, ready: s.classifier.isReady(), samples: s.samples.length };
      patch({ trigger: next });
      if (next.fired) {
        const fired = next.fired;
        void api.createRequest(fired.label, fired.confidence).then((r) => {
          if (!r.ok) { toast(`Could not send: ${r.error}`, "error"); return; }
          patch({ lastSent: fired.label });
          later(() => patch({ lastSent: null }), SENT_SHOW_MS);
        });
      }
      return;
    }
  }, [patch, toast, startCountdown, finishLabel, later, canvasRef, videoRef]);

  // Load patient and samples, then pick the starting point.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [patientRes, samplesRes] = await Promise.all([api.getPatient(), api.getSamples()]);
      if (cancelled) return;
      const s = session.current;
      if (patientRes.ok) patch({ patient: patientRes.data });
      if (samplesRes.ok) s.samples = samplesRes.data.map((x) => ({ label: x.label as Label, vector: x.vector }));
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

  const retrain = useCallback(async () => {
    const s = session.current;
    s.timers.forEach((id) => window.clearTimeout(id));
    s.samples = [];
    s.classifier.setSamples([]);
    s.index = 0;
    s.trigger.reset();
    setPhase("waiting", { index: 0, lifting: null, progress: 0, trigger: idleTrigger, lastSent: null, accuracy: null, hint: "Any movement they can repeat works." });
    const r = await api.deleteSamples();
    if (!r.ok) toast("Server unreachable, old training may come back on reload", "error");
  }, [setPhase, toast]);

  return { state, start: startCountdown, retrain };
}
