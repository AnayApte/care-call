export const LABELS = ["water", "pain", "help", "bathroom", "neutral"] as const;
export type Label = (typeof LABELS)[number];
export type RequestLabel = Exclude<Label, "neutral">;
export type HandPoint = { x: number; y: number; z?: number };
export type Sample = { label: Label; vector: number[] };
export type Prediction = { label: Label; confidence: number };
// Rey's classifier plugs in here. No camera, React, or server dependency required.
export type Predictor = (vector: number[]) => Prediction | null;
export function isLabel(value: unknown): value is Label {
  return LABELS.some(label => label === value);
}
