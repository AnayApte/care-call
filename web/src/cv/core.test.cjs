// Run after compiling the CV TypeScript to CommonJS: node --test core.test.cjs
// CV_TEST_BUILD points to the compiled directory. No test framework dependency.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
if (!process.env.CV_TEST_BUILD) throw new Error('Set CV_TEST_BUILD to compiled CV output');
const load = name => require(path.join(process.env.CV_TEST_BUILD, name + '.js'));
const { extractFeatures } = load('features');
const { createGestureTrigger } = load('trigger');
const { sanitizeAdaptConfig } = load('adapt');
const { createSampleCapture } = load('training');
const { createSession, postSession } = load('session');
const hand = Array.from({ length: 21 }, (_, i) => ({ x: .2 + i * .01, y: .3 + (i % 5) * .02 }));
const water = { label: 'water', confidence: .8 };
const hold = (engine, prediction = water, start = 0, count = 12) => {
  let state;
  for (let i = 0; i < count; i++) state = engine.update(prediction, start + i * 100);
  return state;
};

test('42 features preserve index order and ignore translation/scale/z', () => {
  const vector = extractFeatures(hand);
  assert.equal(vector.length, 42);
  assert.deepEqual(vector.slice(0, 2), [0, 0]);
  const moved = extractFeatures(hand.map(p => ({ x: p.x * 2 + .1, y: p.y * 2 - .1, z: 99 })));
  vector.forEach((x, i) => assert.ok(Math.abs(x - moved[i]) < 1e-12));
  assert.ok(Math.abs(Math.max(...Array.from({ length: 21 }, (_, i) => Math.hypot(vector[2*i], vector[2*i+1]))) - 1) < 1e-12);
});
test('invalid features fail instead of producing NaN or a neutral gesture', () => {
  assert.throws(() => extractFeatures([]));
  assert.throws(() => extractFeatures(Array(21).fill({ x: 0, y: 0 })));
  assert.throws(() => extractFeatures(hand.map((p, i) => i ? p : { x: NaN, y: 0 })));
});
test('fires exactly on frame 12 at the confidence boundary, then cooldown', () => {
  const engine = createGestureTrigger();
  assert.equal(hold(engine, water, 0, 11).fired, null);
  assert.equal(engine.update(water, 1100).fired.label, 'water');
  assert.equal(hold(engine, water, 1200, 70).fired, null);
  assert.equal(hold(engine, water, 9100).fired.label, 'water');
});
test('neutral, missing hand, low confidence, invalid confidence reset the hold', () => {
  for (const interruption of [null, { label: 'neutral', confidence: 1 }, { label: 'water', confidence: .79 },
      { label: 'water', confidence: NaN }, { label: 'water', confidence: 2 }, { label: 'Not a label!', confidence: 1 }]) {
    const engine = createGestureTrigger();
    hold(engine, water, 0, 11);
    assert.equal(engine.update(interruption, 1100).progress, 0);
    assert.equal(hold(engine, water, 1200, 11).fired, null);
    assert.equal(engine.update(water, 2300).fired.label, 'water');
  }
});
test('changing labels, frame gaps and duplicate timestamps cannot complete a hold', () => {
  const engine = createGestureTrigger();
  hold(engine, water, 0, 11);
  assert.equal(engine.update({ label: 'help', confidence: .9 }, 1100).progress, 1/12);
  assert.equal(engine.update(water, 1200).progress, 1/12);
  assert.equal(engine.update(water, 1200).progress, 1/12);
  assert.equal(engine.update(water, 1900).progress, 1/12);
  engine.reset();
  assert.equal(engine.update(water, 2000).progress, 1/12);
});
test('approved per-label settings apply, clamp bounds and ignore unknown keys', () => {
  const config = sanitizeAdaptConfig({ version: 2, hold_frames: 999, min_confidence: 0,
    labels: { water: { hold_frames: 6, min_confidence: .9 }, surprise: { hold_frames: 1 } },
    retrain_labels: ['water', 'bad', 'water'], cooldown: 0 });
  assert.equal(config.hold_frames, 30);
  assert.equal(config.min_confidence, .6);
  assert.deepEqual(config.retrain_labels, ['water']);
  assert.equal(config.labels.surprise, undefined);
  assert.equal(config.cooldown, undefined);
  assert.equal(sanitizeAdaptConfig({ hold_frames: NaN }).hold_frames, 12);
  const engine = createGestureTrigger(config);
  assert.equal(hold(engine, { label: 'water', confidence: .9 }, 0, 6).fired.label, 'water');
  engine.setConfig(null); // changing settings must not cancel the cooldown
  assert.equal(engine.update(water, 600).fired, null);
});
test('capture saves 15 independent vectors across a full three-second hold', () => {
  const capture = createSampleCapture('water', 0);
  const vector = extractFeatures(hand);
  let state;
  for (let now = 0; now <= 2800; now += 100) state = capture.update(vector, now);
  assert.equal(state.samples.length, 15);
  assert.equal(state.done, false);
  state = capture.update(vector, 3000);
  assert.equal(state.done, true);
  vector[0] = 42;
  assert.equal(state.samples[0].vector[0], 0);
});
test('capture discards partial holds on lost hand or stalled frames', () => {
  for (const [vector, now] of [[null, 100], [extractFeatures(hand), 700]]) {
    const capture = createSampleCapture('help', 0);
    capture.update(extractFeatures(hand), 0);
    assert.equal(capture.update(vector, now).failed, true);
    assert.deepEqual(capture.update(extractFeatures(hand), now + 100).samples, []);
  }
});
test('capture tolerates normal 12fps jitter without fabricating missing samples', () => {
  const capture = createSampleCapture('water', 0);
  let state;
  for (let now = 40; now < 3000; now += 90) state = capture.update(extractFeatures(hand), now);
  state = capture.update(extractFeatures(hand), 3020);
  assert.equal(state.done, true);
  assert.equal(state.samples.length, 15);
  const missed = createSampleCapture('water', 0);
  for (let now = 0; now <= 3000; now += 400) missed.update(extractFeatures(hand), now);
  assert.equal(missed.update(extractFeatures(hand), 3100).failed, true);
});
test('session aggregates attempts and explicit feedback without inferring intent', () => {
  const session = createSession('p_demo', 2, new Date('2026-10-17T22:00:00Z'));
  session.recordAttempt('water', .9, 12, true);
  session.recordAttempt('water', .7, 5, false);
  session.recordFeedback('neutral', 'water');
  session.recordFeedback('pain', 'help');
  const snapshot = session.snapshot();
  assert.deepEqual(snapshot.labels.water, { attempts: 2, fired: 1, abandoned: 1, mean_conf: .8,
    min_conf: .7, mean_hold_frames_to_fire: 12 });
  assert.equal(snapshot.false_triggers_neutral, 1);
  snapshot.labels.water.fired = 100;
  assert.equal(session.snapshot().labels.water.fired, 1);
});
test('upload rejects server failure so callers can retain their session', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(() => postSession('https://example.test', createSession('p_demo').snapshot()), /503/);
  } finally { global.fetch = original; }
});
