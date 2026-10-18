import { LABELS, type Label } from "./types";

export type Thresholds = { hold_frames: number; min_confidence: number };
export type AdaptConfig = Thresholds & {
  version: number;
  labels: Partial<Record<Label, Thresholds>>;
  retrain_labels: Label[];
};
const record = (x: unknown): Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
function clamp(x: unknown, fallback: number, min: number, max: number): number {
  return typeof x === "number" && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fallback;
}
function thresholds(x: Record<string, unknown>, fallback: Thresholds): Thresholds {
  return {
    hold_frames: Math.round(clamp(x.hold_frames, fallback.hold_frames, 6, 30)),
    min_confidence: clamp(x.min_confidence, fallback.min_confidence, 0.6, 0.95),
  };
}
/** Only pass approved server config here. This does not apply agent proposals. */
export function sanitizeAdaptConfig(input: unknown): AdaptConfig {
  const raw = record(input);
  const base = thresholds(raw, { hold_frames: 12, min_confidence: 0.8 });
  const labels: AdaptConfig["labels"] = {};
  const overrides = record(raw.labels);
  for (const label of LABELS) {
    if (overrides[label] !== undefined) labels[label] = thresholds(record(overrides[label]), base);
  }
  return {
    ...base,
    version: Math.round(clamp(raw.version, 1, 1, Number.MAX_SAFE_INTEGER)),
    labels,
    retrain_labels: LABELS.filter(label => Array.isArray(raw.retrain_labels) && raw.retrain_labels.includes(label)),
  };
}
export function thresholdsFor(config: AdaptConfig, label: Label): Thresholds {
  return config.labels[label] ?? config;
}
export async function loadApprovedConfig(apiBase: string, patientId: string): Promise<AdaptConfig> {
  const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/patients/${encodeURIComponent(patientId)}/adapt-config`);
  if (!response.ok) throw new Error(`Config load failed (${response.status})`);
  return sanitizeAdaptConfig(await response.json());
}
