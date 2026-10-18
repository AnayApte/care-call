/** Real hand tracking with MediaPipe, used until Josh's `src/cv/camera.ts` merges. Same model, WASM version and
 * feature convention as his code (contract section 8), so stored samples stay compatible.
 */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { HandFrame } from "./cvMock";
import type { Point } from "./steady";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
/** Exponential smoothing on landmark positions. 1 = raw, lower = smoother but laggier. */
const SMOOTHING = 0.6;

/** Contract section 8: subtract the wrist, divide by the max distance from the wrist, flatten x and y. */
export function extractFeatures(points: readonly Point[]): number[] | null {
  if (points.length !== 21 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const centered = points.map((p) => ({ x: p.x - points[0].x, y: p.y - points[0].y }));
  const scale = Math.max(...centered.map((p) => Math.hypot(p.x, p.y)));
  if (!Number.isFinite(scale) || scale <= 1e-12) return null;
  return centered.flatMap((p) => [p.x / scale, p.y / scale]);
}

export async function startRealHandTracker(
  video: HTMLVideoElement,
  onFrame: (frame: HandFrame) => void,
  onCameraError?: (err: unknown) => void,
  onModelError?: (err: unknown) => void,
): Promise<() => void> {
  let stream: MediaStream | null = null;
  let detector: HandLandmarker | null = null;
  let stopped = false;
  let raf = 0;
  let lastVideoTime = -1;
  let smoothed: Point[] | null = null;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    detector?.close();
    detector = null;
    if (video.srcObject === stream) video.srcObject = null;
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); return stop; }
    video.srcObject = stream;
    await video.play().catch(() => undefined);
  } catch (err) {
    onCameraError?.(err);
  }

  try {
    const files = await FilesetResolver.forVisionTasks(WASM);
    if (stopped) return stop;
    detector = await HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1,
    });
  } catch (err) {
    onModelError?.(err);
    stop();
    return stop;
  }

  const tick = (now: number) => {
    if (stopped) return;
    if (document.hidden) {
      smoothed = null;
      onFrame({ timestamp: now, vector: null, landmarks: null });
    } else if (detector && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const raw = (detector.detectForVideo(video, now).landmarks[0] ?? null) as Point[] | null;
      if (!raw) smoothed = null;
      else if (!smoothed) smoothed = raw.map((p) => ({ x: p.x, y: p.y }));
      else smoothed = smoothed.map((q, i) => ({ x: q.x + (raw[i].x - q.x) * SMOOTHING, y: q.y + (raw[i].y - q.y) * SMOOTHING }));
      onFrame({ timestamp: now, vector: smoothed ? extractFeatures(smoothed) : null, landmarks: smoothed });
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return stop;
}
