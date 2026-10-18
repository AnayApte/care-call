/** Hand tracking with MediaPipe for the patient screen. Same model and WASM version as Josh's `cv/camera.ts`, and his
 * `extractFeatures`, so stored samples are identical. Differences: detects on every camera frame instead of 12 per
 * second, smooths landmarks because the patient screen draws the skeleton live, and asks for two hands so the
 * arbiter can keep the patient's weak hand from being mistaken for the one that signals.
 */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { extractFeatures as contractFeatures } from "../cv/features";
import type { HandFrame } from "../cv/patient";
import { createHandArbiter, type DetectedHand, type Handedness } from "./handArbiter";
import { createMonotonicClock, fetchCached, loadOnce } from "./modelLoader";
import type { Point } from "./steady";

/** A contract `HandFrame` plus which hand it came from, for the handedness vote. */
export type TrackedFrame = HandFrame & { handedness: Handedness | null };
export type HandArbiter = ReturnType<typeof createHandArbiter>;

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
/** Exponential smoothing on landmark positions. 1 = raw, lower = smoother but laggier. */
const SMOOTHING = 0.6;
const MODEL_CACHE = "carecall-models-v1";
const WARMUP_SIZE = 64;

/**
 * One detector per page, shared by every camera start, so changing or reloading the camera never waits for the
 * ~17 MB of WASM and model again. The first GPU inference compiles shaders, so it runs once here on a blank canvas
 * instead of stalling the first camera frame.
 */
const detectAt = createMonotonicClock();
export const loadHandModel = loadOnce(async () => {
  const [files, model] = await Promise.all([FilesetResolver.forVisionTasks(WASM), fetchCached(MODEL, MODEL_CACHE)]);
  const detector = await HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetBuffer: model, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  });
  const blank = document.createElement("canvas");
  blank.width = blank.height = WARMUP_SIZE;
  detector.detectForVideo(blank, detectAt(performance.now()));
  return detector;
});

function extractFeatures(points: readonly Point[]): number[] | null {
  try { return contractFeatures(points); } catch { return null; }
}

function toHandedness(label: string | undefined): Handedness | null {
  return label === "Left" || label === "Right" ? label : null;
}

export async function startRealHandTracker(
  video: HTMLVideoElement,
  onFrame: (frame: TrackedFrame) => void,
  onCameraError?: (err: unknown) => void,
  onModelError?: (err: unknown) => void,
  signal?: AbortSignal,
  deviceId?: string,
  arbiter: HandArbiter = createHandArbiter(),
): Promise<() => void> {
  let stream: MediaStream | null = null;
  let piImage: HTMLImageElement | null = null;
  let detector: HandLandmarker | null = null;
  let stopped = false;
  let raf = 0;
  let lastVideoTime = -1;
  let smoothed: Point[] | null = null;
  let smoothedHand: Handedness | null = null;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    piImage = null;
    detector = null; // shared; kept loaded for the next camera start
    if (video.srcObject === stream) video.srcObject = null;
  };
  if (signal?.aborted) return stop;
  signal?.addEventListener("abort", stop, { once: true });

  // Download the model while the camera starts (and while the permission prompt is open).
  const model = loadHandModel();
  model.catch(() => undefined); // reported below, after the camera
  try {
    if (deviceId === "pi-usb") {
      piImage = video.parentElement?.querySelector("img.pi-cam-preview") ?? null;
      if (!piImage) throw new Error("Pi camera preview element is missing");
      await new Promise<void>((resolve, reject) => {
        if (piImage!.complete && piImage!.naturalWidth > 0) { resolve(); return; }
        piImage!.addEventListener("load", () => resolve(), { once: true });
        piImage!.addEventListener("error", () => reject(new Error("Pi USB camera stream unavailable")), { once: true });
      });
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ video: { ...(deviceId && deviceId !== "local-webcam" ? { deviceId } : { facingMode: "user" }), width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return stop; }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
    }
  } catch (err) {
    onCameraError?.(err);
    stop();
    return stop;
  }

  try {
    const loaded = await model;
    if (stopped) return stop;
    detector = loaded;
  } catch (err) {
    onModelError?.(err);
    stop();
    return stop;
  }

  const tick = (now: number) => {
    if (stopped) return;
    if (document.hidden) {
      smoothed = null;
      onFrame({ timestamp: now, vector: null, landmarks: null, handedness: null });
    } else if (detector && (piImage ? piImage.complete && piImage.naturalWidth > 0 : video.readyState >= 2 && video.currentTime !== lastVideoTime)) {
      if (piImage) {
        if (now - lastVideoTime < 50) { raf = requestAnimationFrame(tick); return; }
        lastVideoTime = now;
      } else {
        lastVideoTime = video.currentTime;
      }
      const result = detector.detectForVideo(piImage ?? video, detectAt(now));
      const hands: DetectedHand[] = result.landmarks.map((landmarks, i) => ({
        landmarks: landmarks as Point[],
        handedness: toHandedness(result.handedness[i]?.[0]?.categoryName),
      }));
      const chosen = arbiter.select(hands, now);
      const raw = chosen?.landmarks ?? null;
      // Restart smoothing when the hand changes, so the skeleton does not glide across the screen.
      if (chosen && chosen.handedness !== smoothedHand) { smoothed = null; smoothedHand = chosen.handedness; }
      if (!raw) smoothed = null;
      else if (!smoothed) smoothed = raw.map((p) => ({ x: p.x, y: p.y }));
      else smoothed = smoothed.map((q, i) => ({ x: q.x + (raw[i].x - q.x) * SMOOTHING, y: q.y + (raw[i].y - q.y) * SMOOTHING }));
      onFrame({ timestamp: now, vector: smoothed ? extractFeatures(smoothed) : null, landmarks: smoothed, handedness: chosen?.handedness ?? null });
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return stop;
}
