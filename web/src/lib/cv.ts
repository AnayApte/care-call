/**
 * Adapter between the pages and the gesture layer.
 *
 * Josh owns the real implementation in `src/cv/` (camera, features, personal classifier, trigger).
 * Until that merges, this file is backed by `cvMock.ts`, which uses the real webcam picture but a
 * synthetic hand. Swapping to Josh's code means re-exporting from `../cv/*` here and nowhere else.
 */
export type { HandFrame, Label, Prediction, Sample, TriggerState } from "./cvMock";
export { LABELS, REQUEST_LABELS, createPersonalClassifier, createSampleCapture, createGestureTrigger, startHandTracker } from "./cvMock";
