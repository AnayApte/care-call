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
  try {
    const saved: unknown = JSON.parse(options.storage?.getItem(key) ?? "[]");
    if (Array.isArray(saved)) pending = saved.filter((x): x is SessionSummary =>
      x && x.patient_id === patientId && typeof x.started_at === "string" && typeof x.ended_at === "string" &&
      x.labels && Array.isArray(x.confusions) && Number.isInteger(x.config_version));
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
    flush(): Promise<void> {
      // Rotate before awaiting HTTP so new attempts cannot be erased by a slow upload.
      seal();
      return drain();
    },
  };
}

/** Ten-minute reports, plus a best-effort report before the page goes away. */
export function startSessionReporting(reporter: ReturnType<typeof createSessionReporter>, resetHold: () => void,
  onError: () => void) {
  let stopped = false;
  const flush = () => { void reporter.flush().catch(() => { if (!stopped) onError(); }); };
  const leave = () => { resetHold(); flush(); };
  const hide = () => { if (document.hidden) leave(); };
  const timer = window.setInterval(flush, 10 * 60 * 1000);
  window.addEventListener("pagehide", leave);
  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", hide);
  // Retry reports retained from a previous visit, without creating an empty report.
  flush();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener("pagehide", leave);
    window.removeEventListener("online", flush);
    document.removeEventListener("visibilitychange", hide);
    leave();
  };
}
