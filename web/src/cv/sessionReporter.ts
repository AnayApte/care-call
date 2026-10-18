import { createSession, postSession, type SessionSummary } from "./session";
import type { GestureAttempt } from "./trigger";
import type { Label } from "./types";

export type LocalStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function browserStore(): LocalStore | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

/** Closed reports remain in the queue until the server accepts them. */
export function createSessionReporter(apiBase: string, patientId: string, options: {
  storage?: LocalStore; now?: () => Date; onStorageError?: () => void;
} = {}) {
  const now = options.now ?? (() => new Date());
  const key = `carecall:sessions:${apiBase}:${patientId}`;
  let version = 1;
  let active = createSession(patientId, version, now());
  let pending: SessionSummary[] = [];
  let inFlight: Promise<void> | null = null;
  let liveFlight: Promise<void> | null = null;
  const published = new Map<string, string>();
  try {
    const saved: unknown = JSON.parse(options.storage?.getItem(key) ?? "[]");
    if (Array.isArray(saved)) pending = saved.filter((x): x is SessionSummary =>
      x && x.patient_id === patientId && typeof x.started_at === "string" && typeof x.ended_at === "string" &&
      x.labels && Array.isArray(x.confusions) && Number.isInteger(x.config_version));
    // Give pre-v2 queued reports one stable key before their first retry.
    pending.forEach(summary => { summary.session_id ??= crypto.randomUUID(); });
  } catch { options.onStorageError?.(); }
  const persist = () => {
    try {
      if (pending.length) options.storage?.setItem(key, JSON.stringify(pending));
      else options.storage?.removeItem(key);
    } catch { options.onStorageError?.(); }
  };
  const seal = () => {
    const end = now();
    if (active.hasData()) pending.push(active.snapshot(end));
    active = createSession(patientId, version, end);
    persist();
  };
  function drain(): Promise<void> {
    if (inFlight) return inFlight.then(() => pending.length ? drain() : undefined);
    inFlight = (async () => {
      while (pending.length) {
        await postSession(apiBase, pending[0]);
        pending.shift(); persist();
      }
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  return {
    recordAttempt(attempt: GestureAttempt) {
      active.recordAttempt(attempt.label, attempt.confidence, attempt.holdFrames, attempt.fired, attempt.minConfidence);
    },
    recordFeedback(intended: Label, predicted: Label) { active.recordFeedback(intended, predicted); },
    setConfigVersion(next: number) {
      if (next === version) return;
      seal(); version = next; active = createSession(patientId, version, now());
    },
    snapshot: () => active.snapshot(now()),
    pendingCount: () => pending.length,
    publishLive(): Promise<void> {
      if (liveFlight) return liveFlight;
      const snapshots = [...pending, ...(active.hasData() ? [active.snapshot(now())] : [])];
      liveFlight = (async () => {
        for (const summary of snapshots) {
          // A changing end time alone is not new practice. Retry failed updates.
          const signature = JSON.stringify({ ...summary, ended_at: undefined });
          if (published.get(summary.session_id!) === signature) continue;
          const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/patients/${encodeURIComponent(patientId)}/live-session`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(summary), signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw new Error(`Live usage update failed (${response.status})`);
          published.set(summary.session_id!, signature);
        }
        const openIds = new Set([...pending.map(s => s.session_id), active.snapshot(now()).session_id]);
        for (const id of published.keys()) if (!openIds.has(id)) published.delete(id);
      })().finally(() => { liveFlight = null; });
      return liveFlight;
    },
    flush(): Promise<void> {
      // Rotate before awaiting HTTP so new attempts cannot be erased by a slow upload.
      seal();
      return drain();
    },
  };
}

/** Live counts every two seconds; closed reports still cover ten-minute windows. */
export function startSessionReporting(reporter: ReturnType<typeof createSessionReporter>, resetHold: () => void,
  onError: () => void) {
  let stopped = false;
  const flush = () => { void reporter.flush().catch(() => { if (!stopped) onError(); }); };
  const leave = () => { resetHold(); flush(); };
  const hide = () => { if (document.hidden) leave(); };
  const timer = window.setInterval(flush, 10 * 60 * 1000);
  const liveTimer = window.setInterval(() => {
    if (!document.hidden) void reporter.publishLive().catch(() => { /* Final reports retain their own retry queue. */ });
  }, 2000);
  window.addEventListener("pagehide", leave);
  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", hide);
  // Retry reports retained from a previous visit, without creating an empty report.
  flush();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.clearInterval(liveTimer);
    window.removeEventListener("pagehide", leave);
    window.removeEventListener("online", flush);
    document.removeEventListener("visibilitychange", hide);
    leave();
  };
}
