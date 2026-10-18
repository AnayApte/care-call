import { isLabel, type Label, type Sample } from "./types";
import type { LocalStore } from "./sessionReporter";
import { replaceLabelSamples } from "./retraining";

type Batch = { label: Label; vectors: number[][]; trainingKey: string };
const validVector = (v: unknown): v is number[] => Array.isArray(v) && v.length === 42 && v.every(Number.isFinite);
/** A failed label replacement survives refresh and retries as one complete batch. */
export function createSampleQueue(base: string, patientId: string, storage?: LocalStore,
  onSaved?: (label: Label, trainingKey: string) => void) {
  const key = `carecall:samples-v2:${base}:${patientId}`;
  let cached: Sample[] = [];
  let pending: Batch[] = [];
  let inFlight: Promise<void> | null = null;
  let storageFailed = false;
  const migratedKeys: string[] = [];
  const readQueue = (storageKey: string): { cached: Sample[]; pending: Batch[] } => {
    try {
      const raw = JSON.parse(storage?.getItem(storageKey) ?? "null");
      return {
        cached: Array.isArray(raw?.cached) ? raw.cached.filter((s: Sample) => isLabel(s?.label) && validVector(s.vector)) : [],
        pending: Array.isArray(raw?.pending) ? raw.pending.filter((b: Batch) => isLabel(b?.label) &&
          Array.isArray(b.vectors) && b.vectors.length === 15 && b.vectors.every(validVector) && typeof b.trainingKey === "string") : [],
      };
    } catch { return { cached: [] as Sample[], pending: [] as Batch[] }; }
  };
  try {
    const current = readQueue(key);
    cached = current.cached;
    pending = current.pending;
    // Recover batches saved by builds that mistakenly used the Mac's localhost API.
    for (const oldBase of ["http://localhost:8000", "http://127.0.0.1:8000"]) {
      const oldKey = `carecall:samples-v2:${oldBase}:${patientId}`;
      if (oldKey === key || !storage?.getItem(oldKey)) continue;
      const old = readQueue(oldKey);
      if (!old.cached.length && !old.pending.length) continue;
      cached = [...old.cached, ...cached];
      pending = [...old.pending.filter(batch => !pending.some(currentBatch => currentBatch.label === batch.label)), ...pending];
      migratedKeys.push(oldKey);
    }
  } catch { /* No valid cache yet. */ }
  const persist = () => {
    try {
      if (!storage) return false;
      storage.setItem(key, JSON.stringify({ cached, pending }));
      storageFailed = false;
      return true;
    }
    catch { storageFailed = true; }
    return false;
  };
  if (migratedKeys.length && persist()) {
    for (const oldKey of migratedKeys) {
      try { storage?.removeItem(oldKey); } catch { /* Keep the migrated copy if cleanup fails. */ }
    }
  }
  return {
    load(serverSamples?: Sample[]) {
      let merged = serverSamples ?? cached;
      for (const batch of pending) merged = replaceLabelSamples(merged, batch.label, batch.vectors.map(vector => ({ label: batch.label, vector })));
      cached = merged; persist();
      return merged;
    },
    enqueue(label: Label, vectors: number[][], trainingKey: string) {
      if (vectors.length !== 15 || !vectors.every(validVector)) throw new Error("Record all 15 examples before saving.");
      const batch = { label, vectors: structuredClone(vectors), trainingKey };
      pending = [...pending.filter(b => b.label !== label), batch];
      cached = replaceLabelSamples(cached, label, vectors.map(vector => ({ label, vector })));
      persist();
    },
    pendingCount: () => pending.length,
    pendingLabels: () => pending.map(batch => ({ label: batch.label, trainingKey: batch.trainingKey })),
    storageOk: () => !storageFailed && !!storage,
    flush(): Promise<void> {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        while (pending.length) {
          const batch = pending[0];
          let response: Response;
          try {
            response = await fetch(`${base.replace(/\/$/, "")}/api/patients/${encodeURIComponent(patientId)}/samples/${batch.label}`, {
              method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vectors: batch.vectors }),
              signal: AbortSignal.timeout(8000),
            });
          } catch (error) {
            throw new Error(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
              ? "The server took too long to save training." : "Could not reach the server to save training.");
          }
          if (!response.ok) {
            let reason = "";
            try { const body = await response.json(); if (typeof body?.error === "string") reason = body.error.slice(0, 200); }
            catch { /* The status still explains a non-JSON error. */ }
            throw new Error(`Server could not save training (${response.status})${reason ? `: ${reason}` : "."}`);
          }
          pending = pending.filter(b => b !== batch); persist();
          onSaved?.(batch.label, batch.trainingKey);
        }
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
