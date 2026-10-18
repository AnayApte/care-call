/**
 * Adapter between the pages and the gesture layer.
 *
 * Camera and landmarks: `handTracker.ts` (MediaPipe at the camera's full frame rate with landmark smoothing).
 * Classifier and sample capture: Josh's `src/cv/` (frozen baseline embedding plus personal kNN).
 * Trigger: `holdTrigger.ts`, time-based fill and drain, because the hold should feel the same at any frame rate.
 * Which hand: `handArbiter.ts`, locked to the hand the patient trained with once training has started.
 * Add `?mock=1` to the URL for Josh's synthetic hand instead of the camera (keys 0 to 4, X).
 */
import { startSimulatedTracker } from "../cv/patientSimulation";
import { startRealHandTracker, type HandArbiter, type TrackedFrame } from "./handTracker";

export type { HandFrame, Label, Prediction, Sample } from "../cv/patient";
export { LABELS, REQUEST_LABELS, createPersonalClassifier, createSampleCapture } from "../cv/patient";
export { createGestureTrigger, type TriggerState } from "./holdTrigger";
export { createHandArbiter, type Handedness } from "./handArbiter";
export type { HandArbiter, TrackedFrame } from "./handTracker";

export const USE_MOCK_HAND = import.meta.env.DEV && new URLSearchParams(window.location.search).get("mock") === "1";

export function startHandTracker(
  video: HTMLVideoElement,
  onFrame: (frame: TrackedFrame) => void,
  onCameraError?: (err: unknown) => void,
  onModelError?: (err: unknown) => void,
  signal?: AbortSignal,
  deviceId?: string,
  arbiter?: HandArbiter,
): Promise<() => void> {
  if (USE_MOCK_HAND) return startSimulatedTracker(video, (f) => onFrame({ ...f, handedness: null }), onCameraError, onModelError, signal);
  return startRealHandTracker(video, onFrame, onCameraError, onModelError, signal, deviceId, arbiter);
}
