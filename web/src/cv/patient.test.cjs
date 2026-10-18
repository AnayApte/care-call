const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
if (!process.env.CV_TEST_BUILD) throw new Error('Set CV_TEST_BUILD to compiled CV output');
const load = name => require(path.join(process.env.CV_TEST_BUILD, name + '.js'));
const { LABELS, REQUEST_LABELS, createPersonalClassifier, createSampleCapture, createGestureTrigger } = load('patient');
const { simulatedHand, startSimulatedTracker } = load('patientSimulation');
const { extractFeatures } = load('features');
const vectorFor = index => extractFeatures(simulatedHand(index));

function recordAll() {
  return LABELS.flatMap((label, index) => {
    const capture = createSampleCapture(label, 0);
    let result;
    for (let now = 0; now <= 3000; now += 100) result = capture.update(vectorFor(index), now);
    assert.equal(result.done, true);
    assert.equal(result.samples.length, 15);
    return result.samples;
  });
}

test('patient adapter records five labels and exposes readiness and training check', () => {
  const classifier = createPersonalClassifier();
  assert.equal(classifier.isReady(), false);
  classifier.setSamples(recordAll());
  assert.equal(classifier.isReady(), true);
  assert.equal(classifier.leaveOneOutAccuracy(), 1);
  assert.deepEqual(REQUEST_LABELS, ['water', 'pain', 'help', 'bathroom']);
  LABELS.forEach((label, index) => assert.equal(classifier.predict(vectorFor(index)).label, label));
});

test('an added word is learned once it has 15 samples, and stays unready until then', () => {
  const classifier = createPersonalClassifier();
  const capture = createSampleCapture('tea', 0);
  let result;
  for (let now = 0; now <= 3000; now += 100) result = capture.update(vectorFor(7), now);
  const tea = result.samples;
  classifier.setSamples([...recordAll(), ...tea.slice(0, 10)]);
  assert.equal(classifier.isReady(), false);
  assert.equal(classifier.counts().tea, 10);
  classifier.setSamples([...recordAll(), ...tea]);
  assert.equal(classifier.isReady(), true);
  assert.equal(classifier.predict(vectorFor(7)).label, 'tea');
  assert.equal(classifier.predict(vectorFor(0)).label, 'water');
  assert.throws(() => createSampleCapture('Not a label', 0));
});

test('patient instances keep separate personal meanings', () => {
  const trained = createPersonalClassifier();
  trained.setSamples(recordAll());
  const other = createPersonalClassifier();
  assert.equal(other.isReady(), false);
  assert.equal(other.predict(vectorFor(0)), null);
  assert.equal(trained.predict(vectorFor(0)).label, 'water');
});

test('real patient pipeline holds 12 frames, never sends rest, then cools down', () => {
  const classifier = createPersonalClassifier();
  classifier.setSamples(recordAll());
  const trigger = createGestureTrigger();
  for (let i = 0; i < 20; i++) assert.equal(trigger.update(classifier.predict(vectorFor(4)), i * 100).fired, null);
  for (let i = 0; i < 11; i++) {
    const state = trigger.update(classifier.predict(vectorFor(0)), 2000 + i * 100);
    assert.equal(state.fired, null);
    assert.equal(state.progress, (i + 1) / 12);
  }
  const fired = trigger.update(classifier.predict(vectorFor(0)), 3100).fired;
  assert.deepEqual({ patient_id: 'p_demo', ...fired, source: 'browser' },
    { patient_id: 'p_demo', label: 'water', confidence: 1, source: 'browser' });
  for (let now = 3200; now < 11100; now += 100) assert.equal(trigger.update(classifier.predict(vectorFor(0)), now).fired, null);
});

test('simulation uses valid features, clears hidden hand, and removes callbacks on abort', async () => {
  let next, frames = [], key;
  const previous = Object.fromEntries(['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(k => [k, globalThis[k]]));
  globalThis.window = { addEventListener: (_, fn) => { key = fn; }, removeEventListener: () => { key = undefined; } };
  globalThis.document = { hidden: false };
  globalThis.requestAnimationFrame = fn => { next = fn; return 1; };
  globalThis.cancelAnimationFrame = () => { next = undefined; };
  try {
    const controller = new AbortController();
    await startSimulatedTracker(null, frame => frames.push(frame), undefined, undefined, controller.signal);
    next(0);
    assert.deepEqual(frames[0].vector, vectorFor(4));
    key({ key: '1' }); next(100);
    assert.deepEqual(frames[1].vector, vectorFor(0));
    document.hidden = true; next(200);
    assert.equal(frames[2].vector, null);
    controller.abort();
    assert.equal(next, undefined);
    assert.equal(key, undefined);
  } finally {
    for (const [k, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[k]; else globalThis[k] = value;
    }
  }
});
