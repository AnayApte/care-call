import { LABELS, type Label } from "../cv/types";
import { thresholdsFor } from "../cv/adapt";
import { reviewFrom, settingsFrom, type Job, type Review } from "./adaptation";

export type SavedReport = {
  id: string;
  job: Job | null;
  review: Review;
  outcome: "pending" | "applied" | "dismissed" | "readonly";
};
type ReportStorage = Pick<Storage, "getItem" | "setItem">;
export const reportPath = (id: string) => `/caregiver/reports/${encodeURIComponent(id)}`;
export const movementName = (label: Label) => label === "neutral" ? "Rest" : label[0].toUpperCase() + label.slice(1);

export function reportStore(apiBase: string, patientId: string, storage?: ReportStorage) {
  const prefix = `carecall:reports:${apiBase}:${patientId}`;
  const browserStorage = () => storage ?? localStorage;
  return {
    read(id?: string): SavedReport | null {
      try {
        const target = id ?? browserStorage().getItem(`${prefix}:latest`);
        if (!target) return null;
        const raw = JSON.parse(browserStorage().getItem(`${prefix}:${target}`) ?? "null");
        if (!raw || raw.id !== target || !["pending", "applied", "dismissed", "readonly"].includes(raw.outcome)) return null;
        const job = raw.job?.id === target ? { id: target, base: settingsFrom(raw.job.base) } : null;
        if (raw.outcome === "pending" && !job) return null;
        return { id: target, job, outcome: raw.outcome,
          review: reviewFrom({ status: "done", proposal: raw.review?.settings, explanation_md: raw.review?.explanation }, job?.base) };
      } catch { return null; }
    },
    save(report: SavedReport): boolean {
      try {
        browserStorage().setItem(`${prefix}:${report.id}`, JSON.stringify(report));
        browserStorage().setItem(`${prefix}:latest`, report.id);
        return true;
      } catch { return false; }
    },
  };
}

/** Summarize only the validated proposal, without generating new advice. */
export function reportSummary(report: SavedReport) {
  const next = report.review.settings;
  const base = report.job?.base;
  const changed = base && (base.hold_frames !== next.hold_frames || base.min_confidence !== next.min_confidence || LABELS.some(label => {
    const a = thresholdsFor(base, label), b = thresholdsFor(next, label);
    return a.hold_frames !== b.hold_frames || a.min_confidence !== b.min_confidence;
  }));
  const movements = next.retrain_labels.map(movementName).join(", ");
  const title = movements ? `Record ${movements} again` : changed || !base ? "Review the suggested settings" : "Keep the current setup";
  const detail = movements
    ? `CREAO suggests fresh examples for ${movements}. Your other saved movements stay available.${changed ? " It also suggests adjusting recognition settings." : ""}`
    : changed ? "CREAO suggests adjusting how steadily a movement must be held or how closely it must match."
    : base ? "CREAO suggests keeping the recognition settings as they are." : "Read CREAO’s explanation and proposed settings in the full report.";
  return { title, detail };
}
