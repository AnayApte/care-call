const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
if (!process.env.CV_TEST_BUILD) throw new Error('Set CV_TEST_BUILD to compiled CV output');
const load = name => require(path.join(process.env.CV_TEST_BUILD, name + '.js'));
const { createGestureTrigger } = load('trigger');
const { createSessionReporter, startSessionReporting } = load('sessionReporter');
const { sanitizeAdaptConfig, loadApprovedConfig } = load('adapt');
const { createRetrainingPlan, latestSamples } = load('retraining');
const { LABELS } = load('types');
const water = { label: 'water', confidence: .8 };
const fired = { label: 'water', confidence: .9, minConfidence: .8, holdFrames: 12, fired: true };
const memory = () => {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
};
const reporter = options => createSessionReporter('http://localhost:8000', 'p_demo', options);

test('records one attempt per hold, real frame confidence minimum, and no cooldown attempts', () => {
  const reports = reporter();
  const trigger = createGestureTrigger(undefined, a => reports.recordAttempt(a));
  for (let i = 0; i < 12; i++) trigger.update({ label: 'water', confidence: i ? 1 : .8 }, i * 100);
  for (let i = 12; i < 30; i++) trigger.update(water, i * 100);
  trigger.reset(); trigger.reset();
  const stats = reports.snapshot().labels.water;
  assert.equal(stats.attempts, 1);
  assert.equal(stats.fired, 1);
  assert.equal(stats.abandoned, 0);
  assert.equal(stats.min_conf, .8);
  assert.equal(stats.mean_hold_frames_to_fire, 12);
  assert.ok(Math.abs(stats.mean_conf - 11.8 / 12) < 1e-12);
});

test('hand loss, label change, frame gaps and manual reset each close a hold once', () => {
  const events = [];
  const trigger = createGestureTrigger(undefined, a => events.push(a));
  trigger.update(water, 0); trigger.update(water, 0);
  trigger.update(null, 100);
  trigger.update(water, 200); trigger.update({ label: 'help', confidence: 1 }, 300);
  trigger.update(water, 1000); trigger.reset(); trigger.reset();
  assert.deepEqual(events.map(a => [a.label, a.holdFrames, a.fired]),
    [['water', 1, false], ['water', 1, false], ['help', 1, false], ['water', 1, false]]);
});

test('abandoned attempts include the confidence drop that stopped the hold', () => {
  const reports = reporter();
  const trigger = createGestureTrigger(undefined, a => reports.recordAttempt(a));
  trigger.update({ label: 'pain', confidence: 1 }, 0);
  trigger.update({ label: 'pain', confidence: .6 }, 100);
  assert.equal(reports.snapshot().labels.pain.mean_conf, .8);
  assert.equal(reports.snapshot().labels.pain.min_conf, .6);
  assert.equal(reports.snapshot().labels.pain.abandoned, 1);
});

test('empty reports are not uploaded', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true }; };
  try { const reports = reporter(); await reports.flush(); await reports.flush(); assert.equal(calls, 0); }
  finally { global.fetch = original; }
});

test('failed reports survive a reload and retry the same immutable summary', async () => {
  const original = global.fetch, storage = memory();
  let initial;
  global.fetch = async (_, init) => { initial = JSON.parse(init.body); return { ok: false, status: 503 }; };
  try {
    const first = reporter({ storage }); first.recordAttempt(fired);
    await assert.rejects(first.flush(), /503/);
    assert.equal(first.pendingCount(), 1);
    const second = reporter({ storage });
    global.fetch = async (_, init) => {
      assert.deepEqual(JSON.parse(init.body), initial);
      assert.equal(init.keepalive, true);
      return { ok: true };
    };
    await second.flush();
    assert.equal(second.pendingCount(), 0);
    assert.equal(reporter({ storage }).pendingCount(), 0);
  } finally { global.fetch = original; }
});

test('attempts during a slow upload are retained in a separate report', async () => {
  const original = global.fetch;
  const bodies = [];
  let release;
  global.fetch = async (_, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) await new Promise(resolve => { release = resolve; });
    return { ok: true };
  };
  try {
    const reports = reporter(); reports.recordAttempt(fired);
    const first = reports.flush();
    reports.recordAttempt({ ...fired, label: 'pain' });
    const second = reports.flush();
    release(); await Promise.all([first, second]);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].labels.water.fired, 1);
    assert.equal(bodies[0].labels.pain, undefined);
    assert.equal(bodies[1].labels.pain.fired, 1);
    assert.equal(reports.pendingCount(), 0);
  } finally { global.fetch = original; }
});

test('data arriving immediately after an empty flush is still sent by the next flush', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true }; };
  try {
    const reports = reporter();
    const empty = reports.flush(); reports.recordAttempt(fired);
    await Promise.all([empty, reports.flush()]);
    assert.equal(calls, 1); assert.equal(reports.pendingCount(), 0);
  } finally { global.fetch = original; }
});

test('a settings change separates old and new version reports', async () => {
  const original = global.fetch, bodies = [];
  global.fetch = async (_, init) => { bodies.push(JSON.parse(init.body)); return { ok: true }; };
  try {
    const reports = reporter(); reports.recordAttempt(fired);
    reports.setConfigVersion(2); reports.recordAttempt(fired);
    await reports.flush();
    assert.deepEqual(bodies.map(b => b.config_version), [1, 2]);
    assert.deepEqual(bodies.map(b => b.labels.water.attempts), [1, 1]);
    assert.ok(bodies.every(b => !('vector' in b) && !('landmarks' in b)));
  } finally { global.fetch = original; }
});

test('storage failure never prevents an in-memory report from uploading', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true }; };
  try {
    const broken = { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); }, removeItem() {} };
    const reports = reporter({ storage: broken }); reports.recordAttempt(fired);
    await reports.flush(); assert.equal(calls, 1);
  } finally { global.fetch = original; }
});

test('only the approved settings endpoint is read, with bounded values and per-label overrides', async () => {
  const original = global.fetch;
  global.fetch = async url => {
    assert.equal(url, 'http://localhost:8000/api/patients/p_demo/adapt-config');
    return { ok: true, json: async () => ({ version: 2, hold_frames: 999, min_confidence: 0,
      labels: { pain: { hold_frames: 6, min_confidence: .9 } }, retrain_labels: ['pain', 'invalid'] }) };
  };
  try {
    const config = await loadApprovedConfig('http://localhost:8000/', 'p_demo');
    assert.equal(config.hold_frames, 30); assert.equal(config.min_confidence, .6);
    assert.deepEqual(config.retrain_labels, ['pain']);
    const trigger = createGestureTrigger(config);
    for (let i = 0; i < 5; i++) assert.equal(trigger.update({ label: 'pain', confidence: .9 }, i * 100).fired, null);
    assert.equal(trigger.update({ label: 'pain', confidence: .9 }, 500).fired.label, 'pain');
  } finally { global.fetch = original; }
});

test('malformed or failed settings loads do not become usable proposals', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ proposal: { hold_frames: 1 } }) });
    await assert.rejects(loadApprovedConfig('http://localhost:8000', 'p_demo'), /Invalid approved/);
    global.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(loadApprovedConfig('http://localhost:8000', 'p_demo'), /503/);
  } finally { global.fetch = original; }
});

const samples = LABELS.flatMap(label => Array.from({ length: 15 }, (_, i) => ({ label, vector: [i] })));
test('selective retraining keeps other labels and uses the newest examples', () => {
  const config = sanitizeAdaptConfig({ version: 2, retrain_labels: ['pain'] });
  const plan = createRetrainingPlan('http://localhost:8000', 'p_demo'); plan.setConfig(config);
  assert.deepEqual(plan.order(samples, LABELS), ['pain']);
  const replacement = Array.from({ length: 15 }, (_, i) => ({ label: 'pain', vector: [100 + i] }));
  const latest = latestSamples([...samples, ...replacement]);
  assert.deepEqual(latest.filter(s => s.label !== 'pain'), samples.filter(s => s.label !== 'pain'));
  assert.deepEqual(latest.filter(s => s.label === 'pain'), replacement);
});

test('completed retraining is remembered per approved configuration and reset for a new version', () => {
  const storage = memory(), config = sanitizeAdaptConfig({ version: 2, retrain_labels: ['pain'] });
  const first = createRetrainingPlan('local', 'p_demo', storage); first.setConfig(config);
  first.complete('pain', true);
  const reloaded = createRetrainingPlan('local', 'p_demo', storage); reloaded.setConfig(config);
  assert.deepEqual(reloaded.order(samples, LABELS), []);
  reloaded.setConfig({ ...config, version: 3 });
  assert.deepEqual(reloaded.order(samples, LABELS), ['pain']);
});

test('failed uploads and late replies cannot complete a new configuration', () => {
  const storage = memory(), config = sanitizeAdaptConfig({ version: 2, retrain_labels: ['pain'] });
  const plan = createRetrainingPlan('local', 'p_demo', storage); plan.setConfig(config);
  const oldKey = plan.key(); plan.complete('pain');
  assert.deepEqual(plan.order(samples, LABELS), []);
  const reloaded = createRetrainingPlan('local', 'p_demo', storage); reloaded.setConfig(config);
  assert.deepEqual(reloaded.order(samples, LABELS), ['pain']);
  plan.setConfig({ ...config, version: 3 }); plan.complete('pain', true, oldKey);
  assert.deepEqual(plan.order(samples, LABELS), ['pain']);
});

test('reporting runs every ten minutes, closes a hold when hidden, retries online and cleans up', async () => {
  const originalFetch = global.fetch;
  const originalWindow = global.window, originalDocument = global.document;
  const win = new EventTarget(), doc = new EventTarget();
  let interval, intervalMs, cleared = false, calls = 0;
  win.setInterval = (fn, ms) => { interval = fn; intervalMs = ms; return 1; };
  win.clearInterval = () => { cleared = true; };
  global.window = win; global.document = doc;
  global.fetch = async () => { calls++; return { ok: true }; };
  try {
    const reports = reporter();
    const trigger = createGestureTrigger(undefined, a => reports.recordAttempt(a));
    const stop = startSessionReporting(reports, () => trigger.reset(), () => assert.fail('unexpected failure'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(intervalMs, 600000);
    trigger.update(water, 0); trigger.update(water, 100);
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    reports.recordAttempt(fired); interval();
    await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2);
    reports.recordAttempt(fired); win.dispatchEvent(new Event('online'));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 3);
    stop(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(cleared, true);
    reports.recordAttempt(fired); win.dispatchEvent(new Event('pagehide'));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 3);
  } finally {
    global.fetch = originalFetch;
    if (originalWindow === undefined) delete global.window; else global.window = originalWindow;
    if (originalDocument === undefined) delete global.document; else global.document = originalDocument;
  }
});
