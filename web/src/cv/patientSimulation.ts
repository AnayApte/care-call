import { extractFeatures } from "./features";
import type { HandFrame } from "./patient";
import { LABELS, type HandPoint } from "./types";

// Synthetic shapes exercise the real classifier and trigger, not camera accuracy.
export function simulatedHand(index: number): HandPoint[] {
  return Array.from({ length: 21 }, (_, i) => ({
    x: .2 + .01 * i + (i % 4) * index * .03,
    y: .5 - .012 * i + (i % 3) * index * .02,
  }));
}

/** Explicit ?mock=1 test mode. Never opens the camera. Keys 0–4 select poses; X hides the hand. */
export async function startSimulatedTracker(
  _video: HTMLVideoElement,
  onFrame: (frame: HandFrame) => void,
  _onCameraError?: (error: unknown) => void,
  _onModelError?: (error: unknown) => void,
  signal?: AbortSignal,
): Promise<() => void> {
  let index = LABELS.indexOf("neutral");
  let hidden = false;
  let last = -Infinity;
  let raf = 0;
  let stopped = false;
  const key = (event: KeyboardEvent) => {
    const poses = { "0": 4, "1": 0, "2": 1, "3": 2, "4": 3, "5": 5 }; // 5 is a spare pose for an added word
    if (event.key in poses) index = poses[event.key as keyof typeof poses];
    if (event.key.toLowerCase() === "x") hidden = !hidden;
  };
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", key);
    signal?.removeEventListener("abort", stop);
  };
  const tick = (timestamp: number) => {
    if (stopped) return;
    if (timestamp - last >= 1000 / 12) {
      last = timestamp;
      const landmarks = hidden || document.hidden ? null : simulatedHand(index);
      onFrame({ timestamp, landmarks, vector: landmarks ? extractFeatures(landmarks) : null });
    }
    raf = requestAnimationFrame(tick);
  };
  if (signal?.aborted) return stop;
  signal?.addEventListener("abort", stop, { once: true });
  window.addEventListener("keydown", key);
  raf = requestAnimationFrame(tick);
  return stop;
}
