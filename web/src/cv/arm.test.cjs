const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
if (!process.env.CV_TEST_BUILD) throw new Error('Set CV_TEST_BUILD to compiled CV output');
const load = name => require(path.join(process.env.CV_TEST_BUILD, name + '.js'));
const { createArmCheck } = load('armCheck');
const { simulatedArmPose } = load('armSimulation');
const { createDeviceAlert, serverBase } = load('deviceAlert');
function calibrated() {
  const check = createArmCheck(); check.start(0);
  for (let t = 0; t <= 1200; t += 100) check.update(simulatedArmPose(), t);
  assert.equal(check.snapshot().phase, 'holding');
  return check;
}

test('guided check requires both raised arms before observing', () => {
  const check = createArmCheck(); check.start(0);
  const points = simulatedArmPose('both');
  for (let t = 0; t <= 8000; t += 100) check.update(points, t);
  assert.equal(check.snapshot().phase, 'inconclusive');
});
test('sustained lowering flags each side, not a one-frame glitch', () => {
  for (const side of ['left', 'right', 'both']) {
    const check = calibrated();
    assert.equal(check.update(simulatedArmPose(side), 1300).phase, 'holding');
    check.update(simulatedArmPose(), 1400);
    for (let t = 1500; t <= 2300; t += 100) check.update(simulatedArmPose(side), t);
    assert.equal(check.snapshot().phase, 'flagged');
    assert.equal(check.snapshot().side, side);
    assert.equal(check.update([], 2400).phase, 'flagged'); // latches the observation
  }
});
test('lost, hidden, out-of-frame and low-quality landmarks are inconclusive', () => {
  for (const kind of ['absent', 'visibility', 'outside', 'nan']) {
    const check = calibrated();
    const points = simulatedArmPose();
    if (kind === 'visibility') points[15].visibility = .1;
    if (kind === 'outside') points[15].x = 2;
    if (kind === 'nan') points[15].y = NaN;
    assert.equal(check.update(kind === 'absent' ? [] : points, 1300).phase, 'inconclusive');
  }
  assert.equal(calibrated().interrupt('Tab hidden').phase, 'inconclusive');
});
test('stalled or duplicate frames cannot invent sustained movement', () => {
  const check = calibrated();
  for (let i = 0; i < 100; i++) check.update(simulatedArmPose('left'), 1300);
  assert.equal(check.snapshot().phase, 'holding');
  assert.equal(check.update(simulatedArmPose('left'), 2000).phase, 'inconclusive');
});
test('steady demo completion never claims stroke is ruled out', () => {
  const check = calibrated();
  for (let t = 1300; t <= 11200; t += 100) check.update(simulatedArmPose(), t);
  assert.equal(check.snapshot().phase, 'finished');
  assert.match(check.snapshot().message, /does not rule out a stroke/);
});
test('camera scaling changes make the check inconclusive', () => {
  const check = calibrated();
  const points = simulatedArmPose();
  for (const point of points) point.x = .5 + (point.x - .5) * 1.4;
  assert.equal(check.update(points, 1300).phase, 'inconclusive');
});
test('pending movement at timeout ends inconclusive, not completed', () => {
  const check = calibrated();
  for (let t = 1300; t <= 11100; t += 100) check.update(simulatedArmPose(), t);
  assert.equal(check.update(simulatedArmPose('left'), 11200).phase, 'inconclusive');
});
test('alert accepts secure origins and localhost, rejects embedded credentials', () => {
  assert.equal(serverBase('http://127.0.0.1:8000'), 'http://127.0.0.1:8000');
  assert.equal(serverBase('https://example.test/'), 'https://example.test');
  for (const bad of ['http://example.test', 'https://user:secret@example.test', 'https://example.test/path', 'javascript:alert(1)']) {
    assert.throws(() => serverBase(bad));
  }
});
test('one device HELP request per check, acknowledgement matches the same ID', async () => {
  let posts = 0;
  const fetcher = async (url, options) => {
    if (options?.method === 'POST') {
      posts++;
      assert.deepEqual(JSON.parse(options.body), { patient_id: 'p_demo', label: 'help', confidence: .9, source: 'browser' });
      return { ok: true, status: 201, json: async () => ({ id: 'r_1', label: 'help', status: 'open' }) };
    }
    return { ok: true, json: async () => [{ id: 'r_2', label: 'help', status: 'acked', acked_by: 'button' },
      { id: 'r_1', label: 'help', status: 'acked', acked_by: 'button' }] };
  };
  const alert = createDeviceAlert('https://example.test', 'p_demo', fetcher);
  await Promise.all([alert.send(.9), alert.send(.9)]);
  await alert.send(.9);
  assert.equal(posts, 1);
  assert.equal((await alert.refresh()).request.id, 'r_1');
  assert.equal(alert.snapshot().request.status, 'acked');
});
test('unknown delivery is shown and never automatically retried', async () => {
  let calls = 0;
  const alert = createDeviceAlert('https://example.test', 'p_demo', async () => { calls++; throw new Error('offline'); });
  assert.equal((await alert.send(.9)).status, 'uncertain');
  await alert.send(.9);
  assert.equal(calls, 1);
});
test('server rejection and missing device heartbeat are not presented as successful hardware alerts', async () => {
  const alert = createDeviceAlert('https://example.test', 'p_demo', async () => ({ ok: false, status: 503 }));
  assert.equal((await alert.send(.9)).status, 'uncertain');
  assert.equal(await alert.deviceOnline(), false);
  const rejected = createDeviceAlert('https://example.test', 'p_demo', async () => ({ ok: false, status: 422 }));
  assert.equal((await rejected.send(.9)).status, 'failed');
});
