const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequestFlow } = require(path.join(process.env.CV_TEST_BUILD, 'requestFlow.js'));
const { createSampleQueue } = require(path.join(process.env.CV_TEST_BUILD, 'sampleQueue.js'));
const { RequestError } = require(path.join(process.env.CV_TEST_BUILD, '../lib/requests.js'));
const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const rest = { label: 'neutral', confidence: 1 };
const water = { label: 'water', confidence: 1 };
function setup(storage = memory(), browserAudio = true) {
  let now = 1000, creates = [], gets = [], words = [];
  let request = { id: 'r_1', label: 'water', status: 'open', speech: 'Water please' };
  const client = { create: async body => { creates.push(body); return request; }, get: async id => { gets.push(id); return request; } };
  const flow = createRequestFlow(client, 'test', { storage, now: () => now,
    ...(browserAudio ? { speak: word => words.push(word) } : {}) });
  const observe = (prediction, time) => { now = time; flow.observe(prediction, time); };
  return { flow, client, storage, creates, gets, words, observe,
    ack: () => { request = { ...request, status: 'acked' }; }, setTime: time => { now = time; } };
}
function release(t, start) { for (let time = start; time <= start + 600; time += 100) t.observe(rest, time); }

test('external-speaker mode completes delivery, acknowledgement and release without browser audio', async () => {
  const t = setup(memory(), false);
  release(t, 1000);
  await t.flow.fire('water', .9);
  assert.equal(t.flow.snapshot().phase, 'waiting_ack');
  t.ack(); t.setTime(3000); await t.flow.poll();
  assert.equal(t.flow.snapshot().phase, 'acknowledged');
  t.setTime(11000); await t.flow.poll(); release(t, 11000);
  assert.equal(t.flow.snapshot().phase, 'ready');
  assert.equal(t.creates.length, 1);
  assert.deepEqual(t.words, []);
});

test('three full cycles return to ready without patient buttons; held pose never resends', async () => {
  const t = setup();
  for (let cycle = 0; cycle < 3; cycle++) {
    const start = 1000 + cycle * 13000;
    t.client.create = async body => { t.creates.push(body); return { id: `r_${cycle + 1}`, label: 'water', status: 'open', speech: 'Water please' }; };
    t.client.get = async id => { t.gets.push(id); return { id, label: 'water', status: 'acked', speech: 'Water please' }; };
    release(t, start);
    assert.equal(t.flow.snapshot().phase, 'ready');
    await t.flow.fire('water', .9);
    assert.equal(t.flow.snapshot().phase, 'waiting_ack');
    await t.flow.fire('water', .9);
    assert.equal(t.creates.length, cycle + 1);
    t.setTime(start + 1000); await t.flow.poll(); await t.flow.poll();
    assert.equal(t.flow.snapshot().phase, 'acknowledged');
    for (let time = start + 1100; time < start + 10000; time += 100) t.observe(water, time);
    assert.equal(t.flow.snapshot().phase, 'waiting_release');
    assert.deepEqual(t.words.slice(-2), ['Water please', 'Help is coming.']);
    release(t, start + 10000);
    assert.equal(t.flow.snapshot().phase, 'ready');
    assert.equal(t.flow.snapshot().input, null);
    assert.equal(t.gets.at(-1), `r_${cycle + 1}`);
  }
});

test('unknown delivery survives refresh and retries the same key', async () => {
  const t = setup(); release(t, 1000);
  let first;
  t.client.create = async input => { first = input; throw new RequestError('Reply lost'); };
  await t.flow.fire('water', .9);
  assert.equal(t.flow.snapshot().phase, 'delivery_unknown');
  t.flow.recoverFailed(); assert.equal(t.flow.snapshot().phase, 'delivery_unknown');
  const reloaded = setup(t.storage);
  assert.equal(reloaded.flow.snapshot().phase, 'delivery_unknown');
  await reloaded.flow.retry();
  assert.deepEqual(reloaded.creates[0], first);
  assert.equal(reloaded.flow.snapshot().phase, 'waiting_ack');
});

test('refresh recovers pending ID and never replays request or previous acknowledgement speech', async () => {
  const t = setup(); release(t, 1000); await t.flow.fire('water', .9);
  const reloaded = setup(t.storage); await reloaded.flow.poll();
  assert.deepEqual(reloaded.gets, ['r_1']); assert.deepEqual(reloaded.words, []);
  reloaded.ack(); reloaded.setTime(3000); await reloaded.flow.poll();
  assert.deepEqual(reloaded.words, ['Help is coming.']);
  const again = setup(t.storage); await again.flow.poll();
  assert.deepEqual(again.words, []); assert.equal(again.flow.snapshot().phase, 'waiting_release');
});

test('poll failure and wrong ID never fabricate acknowledgement', async () => {
  const t = setup(); release(t, 1000); await t.flow.fire('water', .9);
  t.client.get = async () => { throw new RequestError('Offline'); }; await t.flow.poll();
  assert.equal(t.flow.snapshot().phase, 'waiting_ack'); assert.equal(t.flow.snapshot().online, false);
  t.client.get = async () => ({ id: 'r_2', status: 'acked' }); await t.flow.poll();
  assert.equal(t.flow.snapshot().phase, 'waiting_ack'); assert.deepEqual(t.words, ['Water please']);
});

test('hidden, stalled, missing and low-confidence frames cannot release a request', () => {
  const t = setup();
  t.observe(rest, 1000); t.flow.observe(rest, 2000, false); t.observe(rest, 2100);
  assert.equal(t.flow.snapshot().phase, 'waiting_release');
  for (let time = 2200; time < 5000; time += 100) t.observe(null, time);
  for (let time = 5000; time < 6000; time += 100) t.observe({ ...rest, confidence: .4 }, time);
  assert.equal(t.flow.snapshot().phase, 'waiting_release');
  release(t, 6000); assert.equal(t.flow.snapshot().phase, 'ready');
  t.observe(water, 8000); assert.equal(t.flow.snapshot().phase, 'waiting_release');
  release(t, 8100); t.flow.interrupt(); assert.equal(t.flow.snapshot().phase, 'waiting_release');
});

test('definite rejection can recover but never claims sent', async () => {
  const t = setup(); release(t, 1000);
  t.client.create = async () => { throw new RequestError('Bad request', 422); };
  await t.flow.fire('water', .9);
  assert.equal(t.flow.snapshot().phase, 'failed'); assert.deepEqual(t.words, []);
  t.flow.recoverFailed(); release(t, 3000); assert.equal(t.flow.snapshot().phase, 'ready');
});

test('malformed success reply never claims delivery', async () => {
  const t = setup(); release(t, 1000);
  t.client.create = async () => ({ id: 'r_9', label: 'pain', status: 'open', speech: 'Pain' });
  await t.flow.fire('water', .9);
  assert.equal(t.flow.snapshot().phase, 'delivery_unknown'); assert.equal(t.flow.snapshot().request, null);
  assert.deepEqual(t.words, []);
});

test('failed training batch survives refresh, overrides old samples, and retries atomically', async () => {
  const original = global.fetch, storage = memory(), saved = [];
  const vectors = Array.from({ length: 15 }, (_, i) => Array(42).fill(i));
  const queue = createSampleQueue('http://test', 'p_demo', storage);
  queue.load([{ label: 'water', vector: Array(42).fill(9) }, { label: 'pain', vector: Array(42).fill(-1) }]);
  queue.enqueue('pain', vectors, 'config-2');
  global.fetch = async () => ({ ok: false, status: 503 });
  try {
    await assert.rejects(queue.flush(), /503/);
    const reloaded = createSampleQueue('http://test', 'p_demo', storage, (...args) => saved.push(args));
    assert.equal(reloaded.load().filter(s => s.label === 'pain').length, 15);
    assert.equal(reloaded.load().filter(s => s.label === 'water').length, 1);
    let calls = 0;
    global.fetch = async (url, init) => { calls++; assert.equal(url, 'http://test/api/patients/p_demo/samples/pain');
      assert.equal(init.method, 'PUT'); assert.deepEqual(JSON.parse(init.body), { vectors }); return { ok: true }; };
    await reloaded.flush(); assert.equal(calls, 1); assert.deepEqual(saved, [['pain', 'config-2']]);
    assert.equal(createSampleQueue('http://test', 'p_demo', storage).pendingCount(), 0);
  } finally { global.fetch = original; }
});

test('a slow training save stays pending and concurrent retries share one upload', async () => {
  const original = global.fetch;
  const queue = createSampleQueue('http://test', 'p_demo', memory());
  queue.enqueue('water', Array.from({ length: 15 }, () => Array(42).fill(0)), 'config-1');
  let finish, calls = 0;
  global.fetch = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  try {
    const first = queue.flush();
    assert.equal(queue.pendingCount(), 1);
    assert.equal(queue.flush(), first);
    assert.equal(calls, 1);
    finish({ ok: true }); await first;
    assert.equal(queue.pendingCount(), 0);
  } finally { global.fetch = original; }
});

test('training errors explain a rejection or timeout and keep the batch for retry', async () => {
  const original = global.fetch, storage = memory();
  const queue = createSampleQueue('http://test', 'p_demo', storage);
  queue.enqueue('water', Array.from({ length: 15 }, () => Array(42).fill(0)), 'config-1');
  try {
    global.fetch = async () => ({ ok: false, status: 422, json: async () => ({ error: 'unknown movement label' }) });
    await assert.rejects(queue.flush(), /422.*unknown movement label/);
    global.fetch = async () => { throw Object.assign(new Error(), { name: 'TimeoutError' }); };
    await assert.rejects(queue.flush(), /too long/);
    global.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(queue.flush(), /Could not reach the server/);
    assert.equal(createSampleQueue('http://test', 'p_demo', storage).pendingCount(), 1);
  } finally { global.fetch = original; }
});
