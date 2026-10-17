import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { extractFeatures } from "./features";
import type { HandPoint } from "./types";

// Keep WASM and npm versions aligned. Model is fetched at runtime, never committed.
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
export type HandFrame = { points: HandPoint[]; vector: number[] | null; timestamp: number };

export async function startHandCamera(options: {
  video: HTMLVideoElement;
  onFrame: (frame: HandFrame) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
  wasmRoot?: string;
  modelPath?: string;
}): Promise<() => void> {
  const { video, signal } = options;
  let detector: HandLandmarker | undefined;
  let stream: MediaStream | undefined;
  let raf = 0;
  let stopped = false;
  let lastVideoTime = -1;
  let lastDetection = -Infinity;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach(track => track.stop());
    detector?.close();
    detector = undefined;
    if (video.srcObject === stream) video.srcObject = null;
    signal?.removeEventListener("abort", stop);
  };
  const checkStopped = () => {
    if (stopped || signal?.aborted) throw new DOMException("Camera start cancelled", "AbortError");
  };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    checkStopped();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera needs HTTPS or localhost");
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: 640, height: 480 } });
    checkStopped();
    const files = await FilesetResolver.forVisionTasks(options.wasmRoot ?? WASM);
    checkStopped();
    detector = await HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: options.modelPath ?? MODEL, delegate: "CPU" },
      runningMode: "VIDEO", numHands: 1,
    });
    checkStopped();
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    checkStopped();
    const tick = (now: number) => {
      if (stopped) return;
      try {
        if (document.hidden) {
          options.onFrame({ points: [], vector: null, timestamp: now });
        } else if (video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastDetection >= 1000 / 12) {
          lastVideoTime = video.currentTime;
          lastDetection = now;
          const points = detector!.detectForVideo(video, now).landmarks[0] ?? [];
          let vector: number[] | null = null;
          if (points.length) {
            try { vector = extractFeatures(points); } catch { /* Invalid hand is treated as absent. */ }
          }
          options.onFrame({ points, vector, timestamp: now });
        }
        raf = requestAnimationFrame(tick);
      } catch (error) {
        stop();
        options.onError(error instanceof Error ? error : new Error(String(error)));
      }
    };
    raf = requestAnimationFrame(tick);
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}
