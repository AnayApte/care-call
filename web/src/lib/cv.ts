/**
 * Adapter between the pages and the gesture layer.
 *
 * Josh owns the real implementation in `src/cv/` (camera, features, personal classifier, trigger).
 * Until that merges: hand landmarks come from MediaPipe via `handTracker.ts` (same model and feature
 * convention as Josh's code), and the classifier, capture and trigger are the simple versions in `cvMock.ts`.
 * Add `?mock=1` to the URL to use the synthetic hand instead of the camera model (demo keys 0 to 4, X, S).
 * Swapping to Josh's code means changing the re-exports here and nowhere else.
 */
import { startHandTracker as startMockTracker, type HandFrame } from "./cvMock";
import { startRealHandTracker } from "./handTracker";

export type { HandFrame, Label, Prediction, Sample, TriggerState } from "./cvMock";
export { LABELS, REQUEST_LABELS, createPersonalClassifier, createSampleCapture, createGestureTrigger } from "./cvMock";

export const USE_MOCK_HAND = new URLSearchParams(window.location.search).get("mock") === "1";

export function startHandTracker(
  video: HTMLVideoElement,
  onFrame: (frame: HandFrame) => void,
  onCameraError?: (err: unknown) => void,
  onModelError?: (err: unknown) => void,
): Promise<() => void> {
  if (USE_MOCK_HAND) return startMockTracker(video, onFrame, onCameraError);
  return startRealHandTracker(video, onFrame, onCameraError, onModelError);
}
