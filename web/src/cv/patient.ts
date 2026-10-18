import { loadBundledBaseline } from "./baseline";
import { createPersonalClassifier as createClassifier } from "./personal";
import { LABELS, type HandPoint } from "./types";

export { LABELS } from "./types";
export type { Label, Prediction, Sample } from "./types";
export { createSampleCapture } from "./training";
export { createGestureTrigger } from "./trigger";
export type { TriggerState } from "./trigger";
export const REQUEST_LABELS = LABELS.filter(label => label !== "neutral");
export type HandFrame = { timestamp: number; vector: number[] | null; landmarks: HandPoint[] | null };

// Share the frozen baseline; each page still gets its own personal samples.
let baseline: ReturnType<typeof loadBundledBaseline> | undefined;
export function createPersonalClassifier() {
  baseline ??= loadBundledBaseline();
  const classifier = createClassifier(baseline);
  return { ...classifier, isReady: classifier.ready };
}
