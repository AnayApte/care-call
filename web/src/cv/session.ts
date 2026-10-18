import { isLabel, type Label, type RequestLabel } from "./types";

type Stats = {
  attempts: number; fired: number; abandoned: number; mean_conf: number;
  min_conf: number; mean_hold_frames_to_fire: number;
};
export type SessionSummary = {
  patient_id: string; started_at: string; ended_at: string; config_version: number;
  labels: Partial<Record<RequestLabel, Stats>>;
  confusions: { intended: Label; predicted: Label; count: number }[];
  false_triggers_neutral: number;
};
/** Explicit events: never infer the person's intended label from the prediction.
 * Caller records each attempt once, on fire or abandonment; confidence is that
 * attempt's mean confidence, holdFrames is its actual observed frame count.
 */
export function createSession(patientId: string, configVersion = 1, startedAt = new Date()) {
  const labels: SessionSummary["labels"] = {};
  const totals = new Map<RequestLabel, { confidence: number; frames: number }>();
  const confusions: SessionSummary["confusions"] = [];
  let falseNeutral = 0;
  return {
    hasData: () => Object.keys(labels).length > 0 || confusions.length > 0,
    recordAttempt(label: RequestLabel, confidence: number, holdFrames: number, fired: boolean, minConfidence = confidence) {
      if (!isLabel(label) || label === ("neutral" as Label) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 ||
          !Number.isInteger(holdFrames) || holdFrames < 1 || !Number.isFinite(minConfidence) ||
          minConfidence < 0 || minConfidence > confidence) throw new Error("Invalid attempt");
      const stats = labels[label] ?? { attempts: 0, fired: 0, abandoned: 0, mean_conf: 0, min_conf: 1, mean_hold_frames_to_fire: 0 };
      const total = totals.get(label) ?? { confidence: 0, frames: 0 };
      stats.attempts++;
      stats.fired += Number(fired);
      stats.abandoned += Number(!fired);
      total.confidence += confidence;
      total.frames += fired ? holdFrames : 0;
      stats.mean_conf = total.confidence / stats.attempts;
      stats.min_conf = Math.min(stats.min_conf, minConfidence);
      stats.mean_hold_frames_to_fire = stats.fired ? total.frames / stats.fired : 0;
      labels[label] = stats;
      totals.set(label, total);
    },
    recordFeedback(intended: Label, predicted: Label) {
      if (!isLabel(intended) || !isLabel(predicted)) throw new Error("Unknown feedback label");
      if (intended === predicted) return;
      const existing = confusions.find(c => c.intended === intended && c.predicted === predicted);
      if (existing) existing.count++;
      else confusions.push({ intended, predicted, count: 1 });
      if (intended === "neutral") falseNeutral++;
    },
    snapshot(endedAt = new Date()): SessionSummary {
      return structuredClone({ patient_id: patientId, started_at: startedAt.toISOString(), ended_at: endedAt.toISOString(),
        config_version: configVersion, labels, confusions, false_triggers_neutral: falseNeutral });
    },
  };
}

/** Caller flushes on a ten-minute interval and pagehide (keepalive helps on exit).
 * Retain this closed summary until the server accepts it; new events use a new window.
 */
export async function postSession(apiBase: string, summary: SessionSummary): Promise<void> {
  const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/cv/sessions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(summary), keepalive: true, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Session upload failed (${response.status})`);
}
