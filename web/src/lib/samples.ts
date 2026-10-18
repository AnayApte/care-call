/** Sample bookkeeping for the personal model. Pure functions, no React. */
import type { Label, Sample } from "../cv/types";

export const MAX_SAMPLES_PER_LABEL = 60; // over this, the most duplicated samples are pruned first, so rarely used styles survive

export function squaredDistance(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i += 1) { const diff = a[i] - b[i]; d += diff * diff; }
  return d;
}

/** Keep each label under its cap by removing the most duplicated sample first (the one whose nearest same-label
 * neighbour is closest), older first on ties. Age alone would delete a whole style that has not been used lately;
 * kNN handles several styles per word as long as each keeps a few representatives. */
export function trimSamples(samples: Sample[]): Sample[] {
  const byLabel = new Map<Label, Sample[]>();
  for (const smp of samples) byLabel.set(smp.label, [...(byLabel.get(smp.label) ?? []), smp]);
  const kept = new Set<Sample>();
  for (const group of byLabel.values()) {
    let pool = group.slice();
    while (pool.length > MAX_SAMPLES_PER_LABEL) {
      let victim = 0;
      let victimGap = Number.POSITIVE_INFINITY;
      for (let i = 0; i < pool.length; i += 1) {
        let gap = Number.POSITIVE_INFINITY;
        for (let j = 0; j < pool.length; j += 1) if (j !== i) gap = Math.min(gap, squaredDistance(pool[i].vector, pool[j].vector));
        // Relative tolerance so float noise cannot decide ties; equal gaps fall to the older sample.
        if (gap < victimGap * (1 - 1e-6)) { victimGap = gap; victim = i; }
      }
      pool = pool.filter((_, i) => i !== victim);
    }
    pool.forEach((smp) => kept.add(smp));
  }
  return samples.filter((smp) => kept.has(smp));
}

/** A few frames spread evenly across the hold, rather than every near-identical frame. */
export function spreadFrames(vectors: number[][], count: number): number[][] {
  if (vectors.length <= count) return vectors;
  return Array.from({ length: count }, (_, i) => vectors[Math.floor((i + 0.5) * vectors.length / count)]);
}

