const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createAdaptationClient, reviewFrom } = require(path.join(process.env.CV_TEST_BUILD, '../lib/adaptation.js'));
const { reportStore, reportSummary } = require(path.join(process.env.CV_TEST_BUILD, '../lib/reports.js'));
const base = { version: 1, hold_frames: 12, min_confidence: .8, labels: {}, retrain_labels: [], suggest_replace: [] };
const job = { id: 'test-run', base };
const done = { status: 'done', proposal: { ...base, hold_frames: 8, retrain_labels: ['pain'] }, explanation_md: 'SIMULATED TEST RESPONSE' };

test('fetching a report, starting and reading a suggestion do not save settings', async () => {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json(url.endsWith('/run') ? { job_id: job.id, base_config: base } : url.includes('/adapt/test-run') ? done : base);
  };
  try {
    const client = createAdaptationClient('http://test', 'p_demo');
    await client.current();
    const started = await client.start();
    const review = reviewFrom(await client.poll(started), started.base);
    assert.equal(review.settings.version, 2);
    assert.equal(calls.filter(x => x.init.method === 'PUT').length, 0);
    await client.apply(started, review);
    const saved = calls.at(-1);
    assert.equal(saved.init.method, 'PUT');
    assert.ok(saved.url.endsWith('?expected_version=1'));
    assert.equal(JSON.parse(saved.init.body).hold_frames, 8);
  } finally { global.fetch = original; }
});

test('failed output cannot become a review and stale Apply explains recovery', async () => {
  assert.throws(() => reviewFrom({ status: 'failed' }, base));
  assert.throws(() => reviewFrom({ ...done, explanation_md: '' }, base));
  const original = global.fetch;
  global.fetch = async () => Response.json({ error: 'conflict' }, { status: 409 });
  try { await assert.rejects(createAdaptationClient('http://test', 'p_demo').apply(job, reviewFrom(done, base)), /Refresh/); }
  finally { global.fetch = original; }
});

test('a completed report retains its original approval baseline and outcome after refresh', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const cache = reportStore('http://test', 'p_demo', storage);
  const report = { id: job.id, job, review: reviewFrom(done, base), outcome: 'pending' };
  assert.equal(cache.save(report), true);
  assert.equal(cache.read().job.base.version, 1);
  cache.save({ ...report, outcome: 'applied' });
  const reloaded = reportStore('http://test', 'p_demo', storage).read(job.id);
  assert.equal(reloaded.outcome, 'applied');
  assert.equal(reloaded.review.settings.version, 2);
  assert.equal(reloaded.job.base.version, 1);
  assert.equal(reportStore('http://other-server', 'p_demo', storage).read(), null);
  assert.equal(reportStore('http://test', 'another-patient', storage).read(), null);
});

test('a directly opened report stays read-only without inventing an approval baseline', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const cache = reportStore('http://test', 'p_demo', storage);
  const report = { id: job.id, job: null, review: reviewFrom({ ...done, proposal: { ...done.proposal, version: 8 } }), outcome: 'readonly' };
  cache.save(report);
  assert.equal(cache.read().job, null);
  assert.equal(cache.read().review.settings.version, 8);
  cache.save({ ...report, outcome: 'pending' });
  assert.equal(cache.read(), null);
});

test('summary includes both retraining and recognition changes; unavailable storage is reported', () => {
  const summary = reportSummary({ id: job.id, job, review: reviewFrom(done, base), outcome: 'pending' });
  assert.equal(summary.title, 'Record Pain again');
  assert.match(summary.detail, /adjusting recognition settings/);
  const cache = reportStore('http://test', 'p_demo', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
  assert.equal(cache.read(), null);
  assert.equal(cache.save({}), false);
});
