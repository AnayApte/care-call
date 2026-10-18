import { startHandCamera } from "./camera";
import type { HandFrame } from "./patient";

export async function startHandTracker(
  video: HTMLVideoElement,
  onFrame: (frame: HandFrame) => void,
  onCameraError?: (error: unknown) => void,
  onModelError?: (error: unknown) => void,
  signal?: AbortSignal,
): Promise<() => void> {
  try {
    return await startHandCamera({
      video, signal,
      onFrame: ({ points, ...frame }) => onFrame({ ...frame, landmarks: points.length ? points : null }),
      onError: error => onModelError?.(error),
    });
  } catch (error) {
    if (signal?.aborted) return () => {};
    const name = error instanceof Error ? error.name : "";
    if (["NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError"].includes(name)) onCameraError?.(error);
    else onModelError?.(error);
    return () => {};
  }
}
