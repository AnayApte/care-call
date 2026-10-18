import { sanitizeAdaptConfig, thresholdsFor } from "./adapt";
import { isLabel, type Prediction, type RequestLabel } from "./types";

export type TriggerState = {
  label: RequestLabel | null;
  progress: number;
  cooldownMs: number;
  fired: { label: RequestLabel; confidence: number } | null;
};
export type GestureAttempt = {
  label: RequestLabel; confidence: number; minConfidence: number; holdFrames: number; fired: boolean;
};
/** One instance per patient. Clock values are monotonic milliseconds. */
export function createGestureTrigger(approvedConfig?: unknown, onAttempt?: (attempt: GestureAttempt) => void) {
  let config = sanitizeAdaptConfig(approvedConfig);
  let label: RequestLabel | null = null;
  let frames = 0;
  let lastTime = -Infinity;
  let cooldownUntil = -Infinity;
  let confidenceSum = 0;
  let minimumConfidence = 1;
  const resetHold = (fired = false) => {
    if (label && frames) onAttempt?.({ label, confidence: Math.min(1, Math.max(minimumConfidence, confidenceSum / frames)),
      minConfidence: minimumConfidence, holdFrames: frames, fired });
    label = null; frames = 0; confidenceSum = 0; minimumConfidence = 1;
  };
  const state = (now: number): TriggerState => ({
    label, progress: label ? frames / thresholdsFor(config, label).hold_frames : 0,
    cooldownMs: Math.max(0, cooldownUntil - now), fired: null,
  });
  return {
    setConfig(input: unknown) { resetHold(); config = sanitizeAdaptConfig(input); },
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
        // Include a confidence drop that ended this same-label attempt in its report.
        if (prediction?.label === label && Number.isFinite(prediction.confidence) &&
            prediction.confidence >= 0 && prediction.confidence <= 1) {
          frames++; confidenceSum += prediction.confidence;
          minimumConfidence = Math.min(minimumConfidence, prediction.confidence);
        }
        resetHold(); return state(now);
      }
      if (label !== prediction.label) { resetHold(); label = prediction.label; }
      frames++;
      confidenceSum += prediction.confidence;
      minimumConfidence = Math.min(minimumConfidence, prediction.confidence);
      if (frames < thresholdsFor(config, label).hold_frames) return state(now);
      const fired = { label, confidence: prediction.confidence };
      cooldownUntil = now + 8000;
      resetHold(true);
      return { label: fired.label, progress: 1, cooldownMs: 8000, fired };
    },
  };
}
