import type { HandPoint } from "./types";

export type ThumbChoice = "yes" | "no";
export type ThumbFeedbackState = {
  ready: boolean;
  choice: ThumbChoice | null;
  progress: number;
  confirmed: ThumbChoice | null;
};
export const idleThumbFeedback: ThumbFeedbackState = { ready: false, choice: null, progress: 0, confirmed: null };

/** A straight, vertical thumb and four curled fingers. Image y increases downward.
 * This only answers the feedback prompt; it never assigns a care-request meaning.
 */
export function thumbChoice(points: readonly HandPoint[] | null, aspect = 1): ThumbChoice | null {
  if (!points || points.length !== 21 || !Number.isFinite(aspect) || aspect <= 0
    || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const p = points.map(p => ({ x: p.x * aspect, y: p.y }));
  const distance = (a: HandPoint, b: HandPoint) => Math.hypot(a.x - b.x, a.y - b.y);
  const palm = Math.max(distance(p[0], p[9]), distance(p[5], p[17]));
  if (palm < 0.015) return null;
  const aligned = (a: HandPoint, b: HandPoint, c: HandPoint) => {
    const ab = distance(a, b), bc = distance(b, c);
    return ab > palm * 0.04 && bc > palm * 0.04
      ? ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (ab * bc) : null;
  };
  const thumbAlignment = aligned(p[2], p[3], p[4]);
  const length = distance(p[2], p[4]);
  const dy = p[4].y - p[2].y;
  if (thumbAlignment === null || thumbAlignment < 0.82 || length < palm * 0.6 || Math.abs(dy) < length * 0.75) return null;
  for (const mcp of [5, 9, 13, 17]) {
    const bend = aligned(p[mcp], p[mcp + 1], p[mcp + 3]);
    if (bend === null || bend > 0.45 || distance(p[mcp + 3], p[0]) > distance(p[mcp + 1], p[0]) * 1.1) return null;
    // The thumb must stick out past the fist, rather than sit inside it.
    if (Math.sign(dy) * (p[4].y - p[mcp].y) < palm * 0.15) return null;
  }
  return dy < 0 ? "yes" : "no";
}

/** Relax for 300 ms, then hold one thumb direction for a second. One answer per prompt.
 * Missing/ambiguous frames clear the hold; a long camera gap requires relaxing again.
 */
export function createThumbFeedback() {
  let active = false, ready = false;
  let lastAt: number | null = null, relaxedAt: number | null = null, startedAt = 0, frames = 0;
  let candidate: ThumbChoice | null = null;
  const reset = () => { ready = false; lastAt = null; relaxedAt = null; startedAt = 0; frames = 0; candidate = null; };
  return {
    begin() { reset(); active = true; },
    cancel() { reset(); active = false; },
    isActive() { return active; },
    reset,
    update(points: readonly HandPoint[] | null, timestamp: number, aspect = 1): ThumbFeedbackState {
      if (!active) return { ...idleThumbFeedback };
      if (!Number.isFinite(timestamp)) { reset(); return { ...idleThumbFeedback }; }
      if (lastAt !== null && (timestamp <= lastAt || timestamp - lastAt > 250)) reset();
      lastAt = timestamp;
      const choice = thumbChoice(points, aspect);
      if (!choice) {
        candidate = null; frames = 0;
        relaxedAt ??= timestamp;
        if (timestamp - relaxedAt >= 300) ready = true;
        return { ...idleThumbFeedback, ready };
      }
      relaxedAt = null;
      if (!ready) return { ...idleThumbFeedback };
      if (candidate !== choice) { candidate = choice; startedAt = timestamp; frames = 0; }
      frames++;
      const progress = Math.min(1, (timestamp - startedAt) / 1000);
      const confirmed = progress === 1 && frames >= 6 ? choice : null;
      if (confirmed) active = false;
      return { ready, choice, progress, confirmed };
    },
  };
}
