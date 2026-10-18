export type PosePoint = { x: number; y: number; visibility?: number };
export type ArmPhase = "idle" | "setup" | "holding" | "flagged" | "inconclusive" | "finished";
export type ArmState = {
  phase: ArmPhase; message: string; progress: number;
  side: "left" | "right" | "both" | null;
  trackingQuality: number | null;
};
// Demo parameters only. These values have NOT been clinically validated.
export const ARM_DEMO = Object.freeze({ setupMs: 8000, baselineMs: 1200, holdMs: 10000,
  dropShoulderWidths: 0.45, sustainedDropMs: 800, minVisibility: 0.75, maxGapMs: 500 });

function measure(points: readonly PosePoint[], aspect: number) {
  const indices = [11, 12, 13, 14, 15, 16]; // left/right shoulder, elbow, wrist
  if (points.length !== 33 || !Number.isFinite(aspect) || aspect <= 0) return null;
  if (indices.some(i => !Number.isFinite(points[i].x) || !Number.isFinite(points[i].y) ||
      points[i].x < .01 || points[i].x > .99 || points[i].y < .01 || points[i].y > .99 ||
      !Number.isFinite(points[i].visibility) || points[i].visibility! < ARM_DEMO.minVisibility || points[i].visibility! > 1)) return null;
  const left = points[11], right = points[12];
  const dx = (right.x - left.x) * aspect, dy = right.y - left.y;
  const width = Math.hypot(dx, dy);
  if (width < .08 * aspect || Math.abs(dy / width) > .35) return null;
  // Project onto the shoulder line's downward normal, correcting image aspect.
  let downX = -dy / width, downY = dx / width;
  if (downY < 0) { downX = -downX; downY = -downY; }
  const height = (joint: number, shoulder: PosePoint) =>
    ((points[joint].x - shoulder.x) * aspect * downX + (points[joint].y - shoulder.y) * downY) / width;
  return { left: height(15, left), right: height(16, right),
    leftElbow: height(13, left), rightElbow: height(14, right), width,
    quality: Math.min(...indices.map(i => points[i].visibility!)) };
}

/** Observes lowering of the wrists during a guided demo. Never diagnoses stroke.
 * Returns inconclusive when tracking is lost, setup fails, or scale changes.
 */
export function createArmCheck() {
  let state: ArmState = { phase: "idle", message: "Start the camera, then start the demo.", progress: 0, side: null, trackingQuality: null };
  let started = 0, baselineStarted = 0, holdingStarted = 0, lastFrame = -Infinity;
  let baseline: { left: number; right: number; width: number }[] = [];
  let origin = { left: 0, right: 0, width: 1 };
  let candidate: ArmState["side"] = null, candidateSince = 0, candidateFrames = 0;
  const snapshot = () => ({ ...state });
  const unclear = (message: string) => { state = { ...state, phase: "inconclusive", message, progress: 0, side: null }; return snapshot(); };
  return {
    start(now: number) {
      if (!Number.isFinite(now)) throw new Error("Invalid start time");
      started = now; lastFrame = -Infinity; baseline = []; candidate = null; candidateFrames = 0;
      state = { phase: "setup", message: "Raise both arms comfortably in front. Keep shoulders, elbows and wrists visible.", progress: 0, side: null, trackingQuality: null };
      return snapshot();
    },
    snapshot,
    interrupt(message = "Camera stopped. Check incomplete.") {
      if (state.phase === "setup" || state.phase === "holding") return unclear(message);
      return snapshot();
    },
    update(points: readonly PosePoint[], now: number, aspect = 4 / 3): ArmState {
      if (state.phase !== "setup" && state.phase !== "holding") return snapshot();
      if (!Number.isFinite(now) || now < started) return unclear("Timing error. Check incomplete.");
      if (now <= lastFrame) return snapshot();
      if (now - lastFrame > ARM_DEMO.maxGapMs && Number.isFinite(lastFrame)) {
        if (state.phase === "holding") return unclear("Camera paused. Check incomplete.");
        baseline = [];
      }
      lastFrame = now;
      const metrics = measure(points, aspect);
      state.trackingQuality = metrics?.quality ?? null;
      if (state.phase === "setup") {
        if (now - started >= ARM_DEMO.setupMs) return unclear("Could not record a starting position. Check incomplete. If an arm cannot be raised, seek help; do not keep retrying.");
        if (!metrics || metrics.left > .35 || metrics.right > .35 || metrics.left < -.5 || metrics.right < -.5 ||
            metrics.leftElbow > .5 || metrics.rightElbow > .5) {
          baseline = [];
          state.message = "Keep one person and both raised arms in view. Use the help button if unable to raise an arm.";
          state.progress = 0;
          return snapshot();
        }
        if (baseline.length === 0) baselineStarted = now;
        // A moving starting pose is not a valid baseline.
        if (baseline.some(b => Math.abs(b.left - metrics.left) > .15 || Math.abs(b.right - metrics.right) > .15)) {
          baseline = []; baselineStarted = now;
        }
        baseline.push(metrics);
        state.progress = Math.min(1, (now - baselineStarted) / ARM_DEMO.baselineMs);
        state.message = "Recording the starting arm position. Hold still briefly.";
        if (now - baselineStarted >= ARM_DEMO.baselineMs && baseline.length >= 8) {
          const mean = (key: "left" | "right" | "width") => baseline.reduce((sum, value) => sum + value[key], 0) / baseline.length;
          origin = { left: mean("left"), right: mean("right"), width: mean("width") };
          holdingStarted = now;
          state = { ...state, phase: "holding", message: "Demo recording. Keep both arms in view.", progress: 0 };
        }
        return snapshot();
      }
      if (!metrics) return unclear("Arm tracking lost. Check incomplete.");
      if (metrics.width / origin.width < .75 || metrics.width / origin.width > 1.25) return unclear("Camera distance changed. Check incomplete.");
      const leftDrop = metrics.left - origin.left >= ARM_DEMO.dropShoulderWidths;
      const rightDrop = metrics.right - origin.right >= ARM_DEMO.dropShoulderWidths;
      const side = leftDrop && rightDrop ? "both" : leftDrop ? "left" : rightDrop ? "right" : null;
      if (side !== candidate) { candidate = side; candidateSince = now; candidateFrames = 0; }
      candidateFrames = side ? candidateFrames + 1 : 0;
      state.progress = Math.min(1, (now - holdingStarted) / ARM_DEMO.holdMs);
      if (side && now - candidateSince >= ARM_DEMO.sustainedDropMs && candidateFrames >= 6) {
        state = { ...state, phase: "flagged", side, message: `${side === "both" ? "Both wrists lowered" : `${side === "left" ? "Left" : "Right"} wrist lowered`} during the demo. A person should review this observation.`, progress: 1 };
      } else if (now - holdingStarted >= ARM_DEMO.holdMs) {
        // A pending drop must not disappear into a reassuring completion message.
        if (side) return unclear("Movement changed near the end. Check incomplete.");
        state = { ...state, phase: "finished", message: "Demo ended without crossing its movement threshold. This does not rule out a stroke.", progress: 1 };
      }
      return snapshot();
    },
  };
}
