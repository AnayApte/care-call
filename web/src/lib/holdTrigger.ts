import type { Label, Prediction } from "../cv/types";

export type TriggerState = { label: Label | null; progress: number; cooldownMs: number; fired: { label: Label; confidence: number } | null };

const COOLDOWN_MS = 0; // the result stays on screen until dismissed, which is the cooldown
/** Patient-screen trigger. Josh's `cv/trigger.ts` resets on any disagreeing frame and counts frames at the camera rate;
 * this one is time-based so the ring reads the same at any frame rate. It Fills while the same request label is seen with enough confidence, drains gently
 * when it is not, so a single odd frame does not wipe the ring. Fires after two seconds of fill.
 * Never fires on neutral. */
const TRIGGER_HOLD_MS = 2000;
const TRIGGER_GRACE_MS = 400; // a lost hand or a neutral frame is ignored this long, progress holds
const TRIGGER_CONFLICT_GRACE_MS = 150; // a confident different word gets much less benefit of the doubt
const TRIGGER_DRAIN_MS = 1500; // after the grace, progress drains at this rate
const TRIGGER_MIN_CONFIDENCE = 0.7;
export function createGestureTrigger() {
  let label: Label | null = null;
  let progress = 0;
  let mismatchMs = 0;
  let lastTs: number | null = null;
  let cooldownUntil = 0;
  return {
    update(prediction: Prediction | null, now: number): TriggerState {
      const dt = lastTs === null ? 0 : Math.max(0, Math.min(100, now - lastTs));
      lastTs = now;
      const cooldownMs = Math.max(0, cooldownUntil - now);
      const usable = prediction && prediction.label !== "neutral" && prediction.confidence >= TRIGGER_MIN_CONFIDENCE ? prediction : null;
      if (cooldownMs > 0) { label = null; progress = 0; mismatchMs = 0; return { label: null, progress: 0, cooldownMs, fired: null }; }
      if (usable && (label === null || usable.label === label)) {
        label = usable.label;
        mismatchMs = 0;
        progress = Math.min(1, progress + dt / TRIGGER_HOLD_MS);
      } else {
        mismatchMs += dt;
        const grace = usable ? TRIGGER_CONFLICT_GRACE_MS : TRIGGER_GRACE_MS;
        if (mismatchMs > grace) progress = Math.max(0, progress - dt / TRIGGER_DRAIN_MS);
        if (progress === 0) { label = usable ? usable.label : null; mismatchMs = 0; if (label) progress = dt / TRIGGER_HOLD_MS; }
      }
      if (progress >= 1 && label) {
        cooldownUntil = now + COOLDOWN_MS;
        const fired = { label, confidence: usable?.confidence ?? TRIGGER_MIN_CONFIDENCE };
        label = null; progress = 0; mismatchMs = 0;
        return { label: fired.label, progress: 1, cooldownMs: COOLDOWN_MS, fired };
      }
      return { label: progress > 0 ? label : null, progress, cooldownMs: 0, fired: null };
    },
    reset() { label = null; progress = 0; mismatchMs = 0; lastTs = null; },
  };
}
