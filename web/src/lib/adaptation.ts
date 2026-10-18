import { sanitizeAdaptConfig, type AdaptConfig } from "../cv/adapt";
import { isLabel, type Label } from "../cv/types";
import type { SessionSummary } from "../cv/session";

export type Settings = AdaptConfig & { suggest_replace: { label: Label; reason: string }[] };
export type Job = { id: string; base: Settings };
export type Run = { status: "pending" | "done" | "failed"; proposal?: unknown; explanation_md?: unknown };
export type Review = { settings: Settings; explanation: string };

export function settingsFrom(value: unknown): Settings {
  if (!value || typeof value !== "object") throw new Error("Missing settings");
  const raw = value as Record<string, unknown>;
  if (![raw.version, raw.hold_frames, raw.min_confidence].every(x => typeof x === "number" && Number.isFinite(x)) ||
      !Number.isSafeInteger(raw.version) || (raw.version as number) < 1) throw new Error("Invalid settings");
  const suggest_replace: Settings["suggest_replace"] = [];
  for (const item of Array.isArray(raw.suggest_replace) ? raw.suggest_replace : []) {
    if (item && isLabel(item.label) && typeof item.reason === "string") {
      suggest_replace.push({ label: item.label, reason: item.reason.slice(0, 2000) });
    }
  }
  return { ...sanitizeAdaptConfig(raw), suggest_replace };
}

export function reviewFrom(run: Run, base: Settings): Review {
  if (run.status !== "done" || typeof run.explanation_md !== "string" || !run.explanation_md.trim()) {
    throw new Error("CREAO did not return a usable suggestion. Your settings have not changed.");
  }
  const settings = settingsFrom(run.proposal);
  return { settings: { ...settings, version: base.version + 1 }, explanation: run.explanation_md.slice(0, 12000) };
}

export function createAdaptationClient(apiBase: string, patientId: string) {
  const patient = `/api/patients/${encodeURIComponent(patientId)}`;
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}${path}`, {
      ...init, headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      if (res.status === 409) throw new Error("Settings changed. Refresh and request a new suggestion.");
      const body = await res.json().catch(() => null);
      throw new Error(typeof body?.error === "string" ? body.error : `Server request failed (${res.status}). Try again.`);
    }
    return res.json() as Promise<T>;
  }
  return {
    setup: () => request<{ ready: boolean }>("/api/adapt/setup"),
    reports: () => request<SessionSummary[]>(`${patient}/sessions`),
    current: async () => settingsFrom(await request(`${patient}/adapt-config`)),
    start: async (): Promise<Job> => {
      const result = await request<{ job_id: string; base_config: unknown }>("/api/adapt/run", {
        method: "POST", body: JSON.stringify({ patient_id: patientId }),
      });
      if (typeof result.job_id !== "string" || !result.job_id) throw new Error("Missing CREAO run");
      return { id: result.job_id, base: settingsFrom(result.base_config) };
    },
    poll: (job: Job) => request<Run>(`/api/adapt/${encodeURIComponent(job.id)}`),
    // This is the only settings write. The page calls it after an explicit Apply tap.
    apply: async (job: Job, review: Review): Promise<Settings> => settingsFrom(await request(
      `${patient}/adapt-config?expected_version=${job.base.version}`, {
        method: "PUT", body: JSON.stringify({ ...settingsFrom(review.settings), version: job.base.version + 1 }),
      })),
  };
}
