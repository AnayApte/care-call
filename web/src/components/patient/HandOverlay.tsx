import type { Point } from "@/lib/steady";

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** Draws the 21 hand landmarks over the video. Coordinates are normalised, so the SVG viewBox is 0 to 1. */
export function HandOverlay({ landmarks, tone }: { landmarks: Point[] | null; tone: "faint" | "live" }) {
  if (!landmarks || landmarks.length < 21) return null;
  return (
    <svg className={`hand ${tone}`} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {EDGES.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={landmarks[a].x} y1={landmarks[a].y} x2={landmarks[b].x} y2={landmarks[b].y} vectorEffect="non-scaling-stroke" />
      ))}
      {landmarks.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="0.006" />
      ))}
    </svg>
  );
}
