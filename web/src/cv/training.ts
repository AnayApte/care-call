import { isLabel, type Label, type Sample } from "./types";

/** Capture actual new camera observations, never duplicate a frame to fill gaps.
 * Missing/invalid hand data cancels the hold; the UI should ask for a retry.
 * Completion requires all 15 samples AND a full 3000 ms hold.
 */
export function createSampleCapture(label: Label, startedAt: number) {
  if (!isLabel(label) || !Number.isFinite(startedAt)) throw new Error("Invalid capture start");
  const samples: Sample[] = [];
  let lastSlot = -1;
  let lastFrame = startedAt;
  let failed = false;
  let done = false;
  return {
    update(vector: number[] | null, now: number) {
      if (done || failed) return { done, failed, samples: failed ? [] : samples.slice() };
      if (!Number.isFinite(now) || now < lastFrame) throw new Error("Invalid capture timestamp");
      if (!vector || vector.length !== 42 || vector.some(x => !Number.isFinite(x)) || now - lastFrame > 500) {
        failed = true;
        return { done: false, failed, samples: [] };
      }
      lastFrame = now;
      // One actual observation per 200ms time slot; frame timing may jitter.
      const slot = Math.floor((now - startedAt) / 200);
      if (slot < 15 && slot > lastSlot) {
        samples.push({ label, vector: vector.slice() });
        lastSlot = slot;
      }
      if (now - startedAt >= 3000) {
        done = samples.length === 15;
        failed = !done;
      }
      return { done, failed, samples: failed ? [] : samples.slice() };
    },
  };
}
