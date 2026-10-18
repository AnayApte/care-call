/** Loose steadiness gate for the training hold. Rejects big repositioning, lets tremor through. */
export type Point = { x: number; y: number };

/** Mean landmark displacement between two frames, in normalised image units (0 to 1). */
export function meanDisplacement(a: Point[], b: Point[]): number {
  if (a.length === 0 || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return total / a.length;
}

/** Mean movement above this per frame counts as "moved a lot". About 4% of the frame width. */
export const STEADY_THRESHOLD = 0.04;

export function createSteadinessGate(threshold = STEADY_THRESHOLD) {
  let previous: Point[] | null = null;
  return {
    /** Returns true when the hand is steady enough compared to the previous frame. */
    update(landmarks: Point[] | null): boolean {
      if (!landmarks) { previous = null; return false; }
      const steady = previous ? meanDisplacement(previous, landmarks) <= threshold : true;
      previous = landmarks;
      return steady;
    },
    reset() { previous = null; },
  };
}
