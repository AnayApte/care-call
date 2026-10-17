import type { HandPoint } from "./types";

/** MediaPipe image landmarks in original index order, before display mirroring.
 * s = max_i hypot(x_i - x_0, y_i - y_0).
 * Output = [(x_0-x_0)/s, (y_0-y_0)/s, ..., (x_20-x_0)/s, (y_20-y_0)/s].
 * Uses 2D normalized image coordinates only; no z, rotation, or handedness flip.
 * Alex's Python edge extractor must use this exact convention.
 */
export function extractFeatures(points: readonly HandPoint[]): number[] {
  if (points.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error("Expected 21 finite hand landmarks");
  }
  const centered = points.map(p => ({ x: p.x - points[0].x, y: p.y - points[0].y }));
  const scale = Math.max(...centered.map(p => Math.hypot(p.x, p.y)));
  if (!Number.isFinite(scale) || scale <= 1e-12) throw new Error("Degenerate hand landmarks");
  return centered.flatMap(p => [p.x / scale, p.y / scale]);
}
