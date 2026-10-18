/**
 * Adapter between the pages and the gesture layer.
 *
 * Camera and landmarks: `handTracker.ts` (MediaPipe at the camera's full frame rate with landmark smoothing).
 * Classifier and sample capture: Josh's `src/cv/` (frozen baseline embedding plus personal kNN).
 * Trigger: `holdTrigger.ts`, time-based fill and drain, because the hold should feel the same at any frame rate.
 * Add `?mock=1` to the URL for Josh's synthetic hand instead of the camera (keys 0 to 4, X).
 */
import { startSimulatedTracker } from "../cv/patientSimulation";
import type { HandFrame } from "../cv/patient";
import { startRealHandTracker } from "./handTracker";

export type { HandFrame, Label, Prediction, Sample } from "../cv/patient";
export { LABELS, REQUEST_LABELS, createPersonalClassifier, createSampleCapture } from "../cv/patient";
export { createGestureTrigger, type TriggerState } from "./holdTrigger";

export const USE_MOCK_HAND = import.meta.env.DEV && new URLSearchParams(window.location.search).get("mock") === "1";

export function startHandTracker(
  video: HTMLVideoElement,
  onFrame: (frame: HandFrame) => void,
  onCameraError?: (err: unknown) => void,
  onModelError?: (err: unknown) => void,
  signal?: AbortSignal,
): Promise<() => void> {
  if (USE_MOCK_HAND) return startSimulatedTracker(video, onFrame, onCameraError, onModelError, signal);
  return startRealHandTracker(video, onFrame, onCameraError, onModelError, signal);
}
