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
  try {
    const raw = JSON.parse(storage?.getItem(key) ?? "null");
    cached = Array.isArray(raw?.cached) ? raw.cached.filter((s: Sample) => isLabel(s?.label) && validVector(s.vector)) : [];
    pending = Array.isArray(raw?.pending) ? raw.pending.filter((b: Batch) => isLabel(b?.label) &&
      Array.isArray(b.vectors) && b.vectors.length === 15 && b.vectors.every(validVector) && typeof b.trainingKey === "string") : [];
  } catch { /* No valid cache yet. */ }
  const persist = () => {
    try { storage?.setItem(key, JSON.stringify({ cached, pending })); }
    catch { storageFailed = true; }
  };
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
          const response = await fetch(`${base.replace(/\/$/, "")}/api/patients/${encodeURIComponent(patientId)}/samples/${batch.label}`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vectors: batch.vectors }),
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw new Error(`Training save failed (${response.status}). Your recording is kept for retry.`);
          pending = pending.filter(b => b !== batch); persist();
          onSaved?.(batch.label, batch.trainingKey);
        }
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
