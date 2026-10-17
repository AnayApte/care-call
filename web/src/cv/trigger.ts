import { sanitizeAdaptConfig, thresholdsFor } from "./adapt";
import { isLabel, type Prediction, type RequestLabel } from "./types";

export type TriggerState = {
  label: RequestLabel | null;
  progress: number;
  cooldownMs: number;
  fired: { label: RequestLabel; confidence: number } | null;
};
/** One instance per patient. Clock values are monotonic milliseconds. */
export function createGestureTrigger(approvedConfig?: unknown) {
  let config = sanitizeAdaptConfig(approvedConfig);
  let label: RequestLabel | null = null;
  let frames = 0;
  let lastTime = -Infinity;
  let cooldownUntil = -Infinity;
  const resetHold = () => { label = null; frames = 0; };
  const state = (now: number): TriggerState => ({
    label, progress: label ? frames / thresholdsFor(config, label).hold_frames : 0,
    cooldownMs: Math.max(0, cooldownUntil - now), fired: null,
  });
  return {
    setConfig(input: unknown) { config = sanitizeAdaptConfig(input); resetHold(); },
    // Call on camera stop, tab hiding, retraining, or classifier replacement.
    reset() { resetHold(); },
    update(prediction: Prediction | null, now: number): TriggerState {
      if (!Number.isFinite(now) || now <= lastTime) return state(lastTime);
      // Never join a hold across a stalled camera or backgrounded tab.
      if (now - lastTime > 500) resetHold();
      lastTime = now;
      if (now < cooldownUntil) { resetHold(); return state(now); }
      if (!prediction || !isLabel(prediction.label) || prediction.label === "neutral" ||
          !Number.isFinite(prediction.confidence) || prediction.confidence > 1 ||
          prediction.confidence < thresholdsFor(config, prediction.label).min_confidence) {
        resetHold(); return state(now);
      }
      if (label !== prediction.label) { label = prediction.label; frames = 0; }
      frames++;
      if (frames < thresholdsFor(config, label).hold_frames) return state(now);
      const fired = { label, confidence: prediction.confidence };
      cooldownUntil = now + 8000;
      resetHold();
      return { label: fired.label, progress: 1, cooldownMs: 8000, fired };
    },
  };
}
