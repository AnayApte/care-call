const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createAdaptationClient, reviewFrom } = require(path.join(process.env.CV_TEST_BUILD, '../lib/adaptation.js'));
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
