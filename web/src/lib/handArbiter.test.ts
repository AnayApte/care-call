import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandArbiter, type DetectedHand } from "./handArbiter.ts";
import type { Point } from "./steady.ts";

/** 21 landmarks all sitting at (x, y). Enough for displacement maths. */
function hand(handedness: "Left" | "Right", x: number, y = 0.5): DetectedHand {
  const landmarks: Point[] = Array.from({ length: 21 }, () => ({ x, y }));
  return { landmarks, handedness };
}

test("returns the only visible hand when nothing is locked", () => {
  const arbiter = createHandArbiter();
  const only = hand("Left", 0.3);
  assert.equal(arbiter.select([only], 0), only);
});

test("returns null when no hand is visible", () => {
  const arbiter = createHandArbiter();
  assert.equal(arbiter.select([], 0), null);
});

test("with a lock, returns only the matching hand", () => {
  const arbiter = createHandArbiter({ locked: "Right" });
  const left = hand("Left", 0.2);
  const right = hand("Right", 0.7);
  assert.equal(arbiter.select([left, right], 0), right);
});

test("with a lock, ignores the other hand even when it is the only one visible", () => {
  const arbiter = createHandArbiter({ locked: "Right" });
  assert.equal(arbiter.select([hand("Left", 0.2)], 0), null);
});

test("unlocked with two hands, picks the one that has been moving", () => {
  const arbiter = createHandArbiter({ stickyMs: 0 });
  // Right hand rests, left hand sweeps across the frame over a few frames.
  let picked: DetectedHand | null = null;
  for (let i = 0; i < 5; i += 1) {
    picked = arbiter.select([hand("Right", 0.7), hand("Left", 0.1 + i * 0.05)], i * 33);
  }
  assert.equal(picked?.handedness, "Left");
});

test("unlocked, keeps the current hand when the other one twitches within the sticky window", () => {
  const arbiter = createHandArbiter({ stickyMs: 1000 });
  // Left moves first and gets selected.
  for (let i = 0; i < 5; i += 1) arbiter.select([hand("Right", 0.7), hand("Left", 0.1 + i * 0.05)], i * 33);
  // Then left holds still while right jumps once, 100 ms later.
  const picked = arbiter.select([hand("Right", 0.9), hand("Left", 0.3)], 5 * 33 + 100);
  assert.equal(picked?.handedness, "Left");
});

test("unlocked, switches to the other hand once the sticky window has passed", () => {
  const arbiter = createHandArbiter({ stickyMs: 1000 });
  for (let i = 0; i < 5; i += 1) arbiter.select([hand("Right", 0.7), hand("Left", 0.1 + i * 0.05)], i * 33);
  // Left settles and right moves for a while, well past the window.
  let picked: DetectedHand | null = null;
  for (let i = 0; i < 20; i += 1) picked = arbiter.select([hand("Right", 0.7 + i * 0.01), hand("Left", 0.3)], 2000 + i * 33);
  assert.equal(picked?.handedness, "Right");
});

test("a single vote sets the lock", () => {
  const arbiter = createHandArbiter();
  assert.equal(arbiter.lock(), null);
  arbiter.vote("Left");
  assert.equal(arbiter.lock(), "Left");
});

test("the lock follows the majority of votes", () => {
  const arbiter = createHandArbiter();
  arbiter.vote("Left");
  arbiter.vote("Right");
  arbiter.vote("Right");
  assert.equal(arbiter.lock(), "Right");
});

test("reset clears the lock and the votes", () => {
  const arbiter = createHandArbiter({ locked: "Left" });
  arbiter.vote("Left");
  arbiter.reset();
  assert.equal(arbiter.lock(), null);
  assert.equal(arbiter.select([hand("Right", 0.5)], 0)?.handedness, "Right");
});

test("unlocked, a hand that went still hands over to the moving one within the sticky window plus a few frames", () => {
  const arbiter = createHandArbiter({ stickyMs: 1000 });
  let t = 0;
  const step = () => { t += 33; return t; };
  // Left moves for half a second and wins.
  for (let i = 0; i < 15; i += 1) arbiter.select([hand("Right", 0.7), hand("Left", 0.1 + i * 0.02)], step());
  // Both still for two seconds. Left must not keep re-earning sticky time from its fading average.
  for (let i = 0; i < 60; i += 1) arbiter.select([hand("Right", 0.7), hand("Left", 0.4)], step());
  // Right starts moving slowly: it should be picked up within 15 frames, not a full sticky window later.
  let picked: DetectedHand | null = null;
  for (let i = 0; i < 15; i += 1) picked = arbiter.select([hand("Right", 0.7 + i * 0.01), hand("Left", 0.4)], step());
  assert.equal(picked?.handedness, "Right");
});
