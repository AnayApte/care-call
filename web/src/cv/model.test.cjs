const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
if (!process.env.CV_TEST_BUILD) throw new Error('Set CV_TEST_BUILD to compiled CV output');
const load = name => require(path.join(process.env.CV_TEST_BUILD, name + '.js'));
const exported = require('../../../ml/baseline.json');
const reference = require('../../../ml/test_vectors.json');
const { createBaselineModel } = load('model');
const { createPersonalClassifier } = load('personal');
const { extractFeatures, toModelFeatures } = load('features');
const { createGestureTrigger } = load('trigger');
const { LABELS } = load('types');
const model = createBaselineModel(exported);

test('browser embeddings and probabilities match every Rey reference vector', () => {
  let maxError = 0;
  for (const vector of reference.vectors) {
    const embedding = model.embed(vector.input);
    const probs = model.probabilities(vector.input);
    assert.equal(embedding.length, 32);
    assert.equal(probs.length, exported.classes.length);
    embedding.forEach((x, i) => { maxError = Math.max(maxError, Math.abs(x - vector.embedding[i])); });
    probs.forEach((x, i) => { maxError = Math.max(maxError, Math.abs(x - vector.probs[i])); });
    assert.ok(Math.abs(probs.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  }
  assert.ok(maxError < reference.tolerance, `Max error ${maxError} exceeds ${reference.tolerance}`);
  console.log(`Rey reference parity: max absolute error ${maxError}`);
});
test('normalization adapter matches wrist_relative_v1 for original and reflected hands', () => {
  for (const mirror of [1, -1]) {
    const hand = Array.from({ length: 21 }, (_, i) => ({ x: .3 + mirror * i * .012, y: .4 + (i % 5) * .02 }));
    const adapted = toModelFeatures(extractFeatures(hand));
    const rel = hand.map(p => [p.x - hand[0].x, p.y - hand[0].y]);
    const scale = Math.hypot(...rel[9]);
    const sign = rel[17][0] < rel[5][0] ? -1 : 1;
    const expected = rel.flatMap(([x, y]) => [Math.fround(x / scale * sign), Math.fround(y / scale)]);
    adapted.forEach((x, i) => assert.ok(Math.abs(x - expected[i]) < 1e-6));
    assert.ok(Math.abs(Math.hypot(adapted[18], adapted[19]) - 1) < 1e-6);
  }
});
test('reject unsupported exports and degenerate model inputs', () => {
  assert.throws(() => createBaselineModel({ ...exported, normalisation: 'unknown' }));
  assert.throws(() => createBaselineModel({ ...exported, std: Array(42).fill(0) }));
  assert.throws(() => model.embed([1, 2]));
  assert.throws(() => toModelFeatures(Array(42).fill(0)));
});

// Synthetic hand shapes test plumbing only; this is NOT a performance benchmark.
function vectorFor(index) {
  const hand = Array.from({ length: 21 }, (_, i) => ({
    x: .2 + .01 * i + (i % 4) * index * .03,
    y: .5 - .012 * i + (i % 3) * index * .02,
  }));
  return extractFeatures(hand);
}
const training = LABELS.flatMap((label, index) => Array.from({ length: 15 }, () => ({ label, vector: vectorFor(index) })));
test('personal model remains disabled until all labels, including neutral, are trained', () => {
  const personal = createPersonalClassifier(model);
  assert.equal(personal.predict(vectorFor(0)), null);
  personal.setSamples(training.filter(s => s.label !== 'neutral'));
  assert.equal(personal.ready(), false);
  assert.equal(personal.leaveOneOutAccuracy(), null);
  personal.setSamples(training);
  assert.equal(personal.ready(), true);
  assert.equal(personal.counts().neutral, 15);
  assert.equal(personal.leaveOneOutAccuracy(), 1);
  assert.equal(personal.predict(Array(42).fill(0)), null);
});
test('pose meanings come from personal labels, not baseline shape categories', () => {
  const personal = createPersonalClassifier(model);
  personal.setSamples(training);
  assert.equal(personal.predict(vectorFor(0)).label, 'water');
  personal.setSamples(training.map(sample => ({ ...sample,
    label: sample.label === 'water' ? 'help' : sample.label === 'help' ? 'water' : sample.label })));
  assert.equal(personal.predict(vectorFor(0)).label, 'help');
});
test('malformed sample import leaves the existing personal model intact', () => {
  const personal = createPersonalClassifier(model);
  personal.setSamples(training);
  assert.throws(() => personal.setSamples([{ label: 'water', vector: [] }]));
  assert.equal(personal.predict(vectorFor(0)).label, 'water');
});
test('integrated learned pose fires once, suppresses neutral and respects cooldown', () => {
  const personal = createPersonalClassifier(model);
  personal.setSamples(training);
  const trigger = createGestureTrigger();
  const events = [];
  for (let frame = 0; frame < 60; frame++) {
    const prediction = personal.predict(vectorFor(frame < 15 ? 4 : 0));
    const state = trigger.update(prediction, frame * 100);
    if (state.fired) events.push(state.fired);
  }
  assert.deepEqual(events, [{ label: 'water', confidence: 1 }]);
});
