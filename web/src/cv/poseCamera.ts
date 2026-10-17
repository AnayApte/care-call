import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PosePoint } from "./armCheck";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
export type PoseFrame = { points: PosePoint[]; timestamp: number; aspect: number };

export async function startPoseCamera(options: {
  video: HTMLVideoElement; signal: AbortSignal;
  onFrame: (frame: PoseFrame) => void; onError: (error: Error) => void;
}): Promise<() => void> {
  const { video, signal } = options;
  let detector: PoseLandmarker | undefined, stream: MediaStream | undefined;
  let raf = 0, stopped = false, lastVideo = -1, lastDetection = -Infinity;
  const stop = () => {
    stopped = true; cancelAnimationFrame(raf);
    stream?.getTracks().forEach(track => track.stop()); detector?.close(); detector = undefined;
    if (video.srcObject === stream) video.srcObject = null;
    signal.removeEventListener("abort", stop);
  };
  const check = () => { if (stopped || signal.aborted) throw new DOMException("Camera cancelled", "AbortError"); };
  signal.addEventListener("abort", stop, { once: true });
  try {
    check();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera needs HTTPS or localhost");
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: 640, height: 480, facingMode: "user" } });
    check();
    const files = await FilesetResolver.forVisionTasks(WASM);
    check();
    detector = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
      runningMode: "VIDEO", numPoses: 2, outputSegmentationMasks: false });
    check(); video.srcObject = stream; video.muted = true; video.playsInline = true;
    await video.play(); check();
    const tick = (now: number) => {
      if (stopped) return;
      try {
        const aspect = video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
        if (document.hidden || now - lastDetection > 700 && video.currentTime === lastVideo) {
          options.onFrame({ points: [], timestamp: now, aspect });
        } else if (video.readyState >= 2 && video.currentTime !== lastVideo && now - lastDetection >= 1000 / 12) {
          lastVideo = video.currentTime; lastDetection = now;
          const result = detector!.detectForVideo(video, now);
          const points = result.landmarks.length === 1 ? result.landmarks[0] : [];
          options.onFrame({ points, timestamp: now, aspect });
          result.close();
        }
        raf = requestAnimationFrame(tick);
      } catch (error) { stop(); options.onError(error instanceof Error ? error : new Error(String(error))); }
    };
    raf = requestAnimationFrame(tick);
    return stop;
  } catch (error) { stop(); throw error; }
}
