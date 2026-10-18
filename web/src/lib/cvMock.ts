/** Mock gesture layer: real webcam video, synthetic hand. Mirrors the shapes in Josh's `src/cv/` so the swap is one file.
 * Demo keys: 0 = neutral, 1 water, 2 pain, 3 help, 4 bathroom, X = hide the hand, S = shake the hand.
 */
import type { Point } from "./steady";

export const LABELS = ["water", "pain", "help", "bathroom", "neutral"] as const;
export type Label = (typeof LABELS)[number];
export const REQUEST_LABELS = LABELS.filter((l): l is Exclude<Label, "neutral"> => l !== "neutral");
export type Sample = { label: Label; vector: number[] };
export type Prediction = { label: Label; confidence: number };
export type HandFrame = { timestamp: number; vector: number[] | null; landmarks: Point[] | null };
export type TriggerState = { label: Label | null; progress: number; cooldownMs: number; fired: { label: Label; confidence: number } | null };

const VECTOR_SIZE = 42;
const SAMPLES_PER_LABEL = 15;
const HOLD_MS = 3000;
const SLOT_MS = 200;
const MAX_FRAME_GAP_MS = 500;
const HOLD_FRAMES = 12;
const MIN_CONFIDENCE = 0.8;
const COOLDOWN_MS = 8000;

// A resting hand, roughly MediaPipe's 21 points, in normalised image coordinates.
const BASE_HAND: Point[] = [
  [0.72, 0.86], [0.66, 0.78], [0.61, 0.69], [0.57, 0.62], [0.54, 0.56],
  [0.68, 0.62], [0.66, 0.50], [0.65, 0.42], [0.64, 0.35],
  [0.73, 0.60], [0.73, 0.47], [0.73, 0.38], [0.72, 0.30],
  [0.78, 0.61], [0.79, 0.49], [0.80, 0.41], [0.81, 0.34],
  [0.83, 0.64], [0.86, 0.55], [0.88, 0.48], [0.89, 0.43],
].map(([x, y]) => ({ x: 0.3 + (x - 0.72) * 0.5, y: 0.5 + (y - 0.6) * 0.5 }));

let currentGesture: Label = "neutral";
let handHidden = false;
let shaking = false;
const gestureKeys: Record<string, Label> = { "0": "neutral", "1": "water", "2": "pain", "3": "help", "4": "bathroom" };
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key in gestureKeys) currentGesture = gestureKeys[e.key];
    if (e.key.toLowerCase() === "x") handHidden = !handHidden;
    if (e.key.toLowerCase() === "s") shaking = !shaking;
  });
}

function gestureVector(label: Label, noise: number): number[] {
  const seed = LABELS.indexOf(label) + 1;
  return Array.from({ length: VECTOR_SIZE }, (_, i) => Math.sin(i * seed * 0.7) + (Math.random() - 0.5) * noise);
}

function syntheticFrame(timestamp: number): HandFrame {
  if (handHidden) return { timestamp, vector: null, landmarks: null };
  const wobble = shaking ? 0.06 : 0.006;
  const curl = LABELS.indexOf(currentGesture) * 0.03;
  const landmarks = BASE_HAND.map((p, i) => ({
    x: p.x + (Math.random() - 0.5) * wobble + (i > 4 ? curl : 0),
    y: p.y + (Math.random() - 0.5) * wobble + (i % 4 === 0 ? curl : 0),
  }));
  return { timestamp, vector: gestureVector(currentGesture, 0.2), landmarks };
}

/** Opens the webcam into `video` and streams synthetic frames. If the camera is blocked the frames still flow, so the flow stays testable. Returns a stop function. */
export async function startHandTracker(video: HTMLVideoElement, onFrame: (frame: HandFrame) => void, onCameraError?: (err: unknown) => void): Promise<() => void> {
  let stream: MediaStream | null = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    // Only detach the video if it is still showing our stream. React StrictMode mounts twice, and the
    // first mount's cleanup must not blank the second mount's picture.
    if (video.srcObject === stream) video.srcObject = null;
  };
  let raf = 0;
  let last = 0;
  const loop = (now: number) => {
    if (stopped) return;
    if (now - last >= 1000 / 30) { last = now; onFrame(syntheticFrame(now)); }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); return stop; }
    video.srcObject = stream;
    await video.play().catch(() => undefined);
  } catch (err) {
    onCameraError?.(err);
  }
  return stop;
}

/** Same contract as Josh's training.ts: 15 real observations over a 3 s hold, fails if the hand drops. */
export function createSampleCapture(label: Label, startedAt: number) {
  currentGesture = label; // the synthetic hand performs whatever it is asked to train
  const samples: Sample[] = [];
  let lastSlot = -1;
  let lastFrame = startedAt;
  let failed = false;
  let done = false;
  return {
    update(vector: number[] | null, now: number) {
      if (done || failed) return { done, failed, samples: failed ? [] : samples.slice() };
      if (!vector || vector.length !== VECTOR_SIZE || now - lastFrame > MAX_FRAME_GAP_MS) {
        failed = true;
        return { done: false, failed, samples: [] };
      }
      lastFrame = now;
      const slot = Math.floor((now - startedAt) / SLOT_MS);
      if (slot < SAMPLES_PER_LABEL && slot > lastSlot) { samples.push({ label, vector: vector.slice() }); lastSlot = slot; }
      if (now - startedAt >= HOLD_MS) { done = samples.length === SAMPLES_PER_LABEL; failed = !done; if (done) currentGesture = "neutral"; }
      return { done, failed, samples: failed ? [] : samples.slice() };
    },
  };
}

/** Nearest-centroid stand-in for the personal kNN. Recognition needs all five labels trained. */
export function createPersonalClassifier() {
  let centroids: { label: Label; centre: number[] }[] = [];
  return {
    setSamples(samples: Sample[]) {
      centroids = LABELS.flatMap((label) => {
        const own = samples.filter((s) => s.label === label);
        if (own.length < SAMPLES_PER_LABEL) return [];
        const centre = Array.from({ length: VECTOR_SIZE }, (_, i) => own.reduce((acc, s) => acc + s.vector[i], 0) / own.length);
        return [{ label, centre }];
      });
    },
    isReady: () => centroids.length === LABELS.length,
    predict(vector: number[]): Prediction | null {
      if (centroids.length !== LABELS.length) return null;
      const dists = centroids.map((c) => ({ label: c.label, d: Math.hypot(...c.centre.map((v, i) => v - vector[i])) }));
      dists.sort((a, b) => a.d - b.d);
      // 0 when the two nearest centroids are equally close, near 1 when the best is far ahead.
      const confidence = dists[1].d > 0 ? 1 - dists[0].d / dists[1].d : 1;
      return { label: dists[0].label, confidence };
    },
  };
}

/** Same contract as Josh's trigger.ts: 12 matching frames at 0.8, then an 8 s cooldown. Never fires on neutral. */
export function createGestureTrigger() {
  let label: Label | null = null;
  let frames = 0;
  let cooldownUntil = 0;
  return {
    update(prediction: Prediction | null, now: number): TriggerState {
      const cooldownMs = Math.max(0, cooldownUntil - now);
      const usable = prediction && prediction.label !== "neutral" && prediction.confidence >= MIN_CONFIDENCE ? prediction : null;
      if (!usable || cooldownMs > 0) { label = null; frames = 0; return { label: null, progress: 0, cooldownMs, fired: null }; }
      frames = usable.label === label ? frames + 1 : 1;
      label = usable.label;
      if (frames >= HOLD_FRAMES) {
        cooldownUntil = now + COOLDOWN_MS;
        const fired = { label: usable.label, confidence: usable.confidence };
        label = null; frames = 0;
        return { label: fired.label, progress: 1, cooldownMs: COOLDOWN_MS, fired };
      }
      return { label, progress: frames / HOLD_FRAMES, cooldownMs: 0, fired: null };
    },
    reset() { label = null; frames = 0; },
  };
}
