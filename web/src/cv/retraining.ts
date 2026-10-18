import type { AdaptConfig } from "./adapt";
import type { LocalStore } from "./sessionReporter";
import { LABELS, isLabel, type Label, type Sample } from "./types";

/** Server samples arrive oldest first. Use the latest complete-sized set per label. */
export function latestSamples(samples: readonly Sample[], perLabel = 15): Sample[] {
  return LABELS.flatMap(label => samples.filter(sample => sample.label === label).slice(-perLabel));
}

export function createRetrainingPlan(apiBase: string, patientId: string, storage?: LocalStore) {
  const key = `carecall:retraining:${apiBase}:${patientId}`;
  let fingerprint = "";
  let requested: Label[] = [];
  let completed = new Set<Label>();
  let saved = new Set<Label>();
  const persist = () => {
    try { storage?.setItem(key, JSON.stringify({ fingerprint, completed: [...saved] })); }
    catch { /* In-memory completion still works when browser storage is unavailable. */ }
  };
  return {
    setConfig(config: AdaptConfig) {
      const next = JSON.stringify(config);
      if (next === fingerprint) return;
      fingerprint = next; requested = config.retrain_labels;
      completed = new Set(); saved = new Set();
      try {
        const stored = JSON.parse(storage?.getItem(key) ?? "null");
        if (stored?.fingerprint === fingerprint && Array.isArray(stored.completed)) {
          saved = new Set(stored.completed.filter(isLabel)); completed = new Set(saved);
        }
      } catch { /* Missing or invalid completion data means re-record the requested movements. */ }
    },
    order(samples: readonly Sample[], order: readonly Label[]): Label[] {
      return order.filter(label => samples.filter(s => s.label === label).length < 15 ||
        (requested.includes(label) && !completed.has(label)));
    },
    key: () => fingerprint,
    complete(label: Label, uploaded = false, expected = fingerprint) {
      if (expected !== fingerprint) return;
      completed.add(label);
      // Failed uploads are not marked complete across reloads.
      if (uploaded) { saved.add(label); persist(); }
    },
    reset() { completed.clear(); saved.clear(); persist(); },
  };
}
