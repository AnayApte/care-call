/** Default words. A patient can add more after onboarding, so a label is any string matching LABEL_PATTERN. */
export const LABELS = ["water", "pain", "help", "bathroom", "neutral"] as const;
export const LABEL_PATTERN = /^[a-z][a-z0-9_]{0,23}$/;
export type Label = string;
export type RequestLabel = Label;
export type HandPoint = { x: number; y: number; z?: number };
export type Sample = { label: Label; vector: number[] };
export type Prediction = { label: Label; confidence: number };
// Rey's classifier plugs in here. No camera, React, or server dependency required.
export type Predictor = (vector: number[]) => Prediction | null;
export function isLabel(value: unknown): value is Label {
  return typeof value === "string" && LABEL_PATTERN.test(value);
}
