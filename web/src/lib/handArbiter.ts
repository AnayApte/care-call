/** Decides which of up to two detected hands the patient screen listens to.
 *
 * Locked: only the hand the patient trained with counts. If it is out of frame, nothing counts, even when the
 * other hand is visible. False help requests are worse than a missed frame.
 * Unlocked (before training): with two hands visible, follow the one that has been moving, and stay on it for
 * `stickyMs` so a twitch from the other hand does not steal the hold mid-way.
 *
 * Handedness is MediaPipe's label for an unmirrored image, so on a selfie camera it is often the opposite of what
 * the person would say. It is consistent between sessions, which is all the lock needs. Never show it as a side.
 */
import { meanDisplacement, type Point } from "./steady.ts";

export type Handedness = "Left" | "Right";
export type DetectedHand = { landmarks: Point[]; handedness: Handedness | null };

/** How long the current hand keeps priority after it was chosen. */
const DEFAULT_STICKY_MS = 1000;
/** Exponential average weight for per-frame movement. Higher follows new movement faster. */
const MOTION_ALPHA = 0.3;
/** A pause in frames longer than this (hidden tab, camera stall) means old movement tells us nothing. */
const GAP_RESET_MS = 500;
/** Average movement per frame below this is jitter or a fading trail, not a hand doing something. */
const MIN_MOTION = 0.002;

type Track = { landmarks: Point[]; motion: number };

export function createHandArbiter(options: { locked?: Handedness | null; stickyMs?: number } = {}) {
  const stickyMs = options.stickyMs ?? DEFAULT_STICKY_MS;
  let votes: Record<Handedness, number> = { Left: 0, Right: 0 };
  let locked: Handedness | null = options.locked ?? null;
  let tracks = new Map<Handedness | null, Track>();
  let current: Handedness | null = null;
  let lastFrameAt = Number.NEGATIVE_INFINITY;
  /** When the current hand last won on movement. The sticky window counts from here. */
  let wonAt = Number.NEGATIVE_INFINITY;

  const lock = (): Handedness | null => locked;

  function updateTracks(hands: DetectedHand[], timestamp: number): Map<Handedness | null, Track> {
    const stale = timestamp - lastFrameAt > GAP_RESET_MS;
    lastFrameAt = timestamp;
    const next = new Map<Handedness | null, Track>();
    for (const h of hands) {
      const prev = stale ? undefined : tracks.get(h.handedness);
      const step = prev ? meanDisplacement(prev.landmarks, h.landmarks) : 0;
      const motion = prev ? prev.motion + (step - prev.motion) * MOTION_ALPHA : 0;
      next.set(h.handedness, { landmarks: h.landmarks, motion });
    }
    return next;
  }

  function pickUnlocked(hands: DetectedHand[], timestamp: number): DetectedHand {
    const motionOf = (h: DetectedHand) => tracks.get(h.handedness)?.motion ?? 0;
    const busiest = hands.reduce((best, h) => (motionOf(h) > motionOf(best) ? h : best), hands[0]);
    const kept = hands.find((h) => h.handedness === current);
    const sticky = kept && timestamp - wonAt < stickyMs;
    const chosen = sticky ? kept : busiest;
    current = chosen.handedness;
    // A win without real movement (first frame, both hands still, jitter) earns no sticky time.
    if (chosen === busiest && motionOf(busiest) > MIN_MOTION) wonAt = timestamp;
    return chosen;
  }

  return {
    /** The hand that counts this frame, or null when none does. */
    select(hands: DetectedHand[], timestamp: number): DetectedHand | null {
      tracks = updateTracks(hands, timestamp);
      if (locked) return hands.find((h) => h.handedness === locked) ?? null;
      if (hands.length === 0) { current = null; return null; }
      return pickUnlocked(hands, timestamp);
    },
    /** Records that a training hold was completed with this hand. The majority becomes the lock. */
    vote(handedness: Handedness): void {
      votes = { ...votes, [handedness]: votes[handedness] + 1 };
      locked = votes.Left === votes.Right ? handedness : votes.Left > votes.Right ? "Left" : "Right";
    },
    lock,
    /** Forgets the lock and all votes, for retraining. */
    reset(): void {
      votes = { Left: 0, Right: 0 };
      locked = null;
      tracks = new Map();
      current = null;
      lastFrameAt = Number.NEGATIVE_INFINITY;
      wonAt = Number.NEGATIVE_INFINITY;
    },
  };
}
