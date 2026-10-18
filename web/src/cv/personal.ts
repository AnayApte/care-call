import { toModelFeatures } from "./features";
import type { Baseline } from "./model";
import { LABELS, isLabel, type Label, type Prediction, type Sample } from "./types";

type EmbeddedSample = { label: Label; vector: number[] };
const distanceSquared = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + (x - b[i]) ** 2, 0);

function nearest(samples: EmbeddedSample[], query: number[], excluded = -1): Prediction | null {
  const neighbors = samples.map((sample, index) => ({ ...sample, index }))
    .filter(sample => sample.index !== excluded)
    .map(sample => ({ label: sample.label, distance: distanceSquared(sample.vector, query) }))
    .sort((a, b) => a.distance - b.distance).slice(0, 5);
  if (neighbors.length < 5) return null;
  const votes = LABELS.map(label => ({ label, count: neighbors.filter(n => n.label === label).length }))
    .sort((a, b) => b.count - a.count);
  if (votes[0].count === votes[1].count) return null;
  return { label: votes[0].label, confidence: votes[0].count / neighbors.length };
}

/** A person's request meanings are learned here, never hard-coded from pose names.
 * Samples stay 42D on the wire; kNN uses Rey's 32D embedding internally.
 */
export function createPersonalClassifier(baseline: Baseline) {
  let samples: Sample[] = [];
  let embedded: EmbeddedSample[] = [];
  const counts = () => Object.fromEntries(LABELS.map(label => [label, samples.filter(s => s.label === label).length])) as Record<Label, number>;
  const ready = () => LABELS.every(label => counts()[label] >= 15);
  return {
    setSamples(input: readonly Sample[]) {
      // Prepare everything first so a malformed import cannot destroy a good model.
      const next = input.map(sample => {
        if (!isLabel(sample.label)) throw new Error("Unknown training label");
        return { label: sample.label, vector: baseline.embed(toModelFeatures(sample.vector)) };
      });
      samples = input.map(sample => ({ label: sample.label, vector: sample.vector.slice() }));
      embedded = next;
    },
    counts, ready,
    predict(vector: number[]): Prediction | null {
      if (!ready()) return null;
      try { return nearest(embedded, baseline.embed(toModelFeatures(vector))); }
      catch { return null; }
    },
    leaveOneOutAccuracy(): number | null {
      if (!ready()) return null;
      let correct = 0;
      embedded.forEach((sample, index) => {
        if (nearest(embedded, sample.vector, index)?.label === sample.label) correct++;
      });
      return correct / embedded.length;
    },
  };
}
