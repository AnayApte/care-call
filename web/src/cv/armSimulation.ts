import type { PosePoint } from "./armCheck";

/** Synthetic landmarks for testing the wiring only. Never patient data. */
export function simulatedArmPose(drop: "left" | "right" | "both" | "none" = "none"): PosePoint[] {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .3, visibility: .99 }));
  points[11] = { x: .4, y: .4, visibility: .99 };
  points[12] = { x: .6, y: .4, visibility: .99 };
  points[13] = { x: .3, y: .4, visibility: .99 };
  points[14] = { x: .7, y: .4, visibility: .99 };
  points[15] = { x: .2, y: drop === "left" || drop === "both" ? .57 : .4, visibility: .99 };
  points[16] = { x: .8, y: drop === "right" || drop === "both" ? .57 : .4, visibility: .99 };
  return points;
}
