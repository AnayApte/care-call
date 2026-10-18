const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
if (!process.env.CV_TEST_BUILD) throw new Error('Set CV_TEST_BUILD to compiled CV output');
const { thumbChoice, createThumbFeedback } = require(path.join(process.env.CV_TEST_BUILD, 'thumbFeedback.js'));

// Synthetic landmarks exercise geometry, not real-camera accuracy.
function thumb(direction = 'yes') {
  const p = Array.from({ length: 21 }, () => ({ x: .5, y: .8 }));
  [[0, .5, .8], [1, .36, .68], [2, .30, .55], [3, .30, .38], [4, .30, .20]].forEach(([i, x, y]) => { p[i] = { x, y }; });
  [5, 9, 13, 17].forEach((mcp, i) => {
    const x = .44 + i * .1;
    [[mcp, x, .5], [mcp + 1, x + .04, .4], [mcp + 2, x + .04, .55], [mcp + 3, x, .6]]
      .forEach(([i, x, y]) => { p[i] = { x, y }; });
  });
  return direction === 'yes' ? p : p.map(({ x, y }) => ({ x: 1 - x, y: 1 - y }));
}
function rotate(points, degrees) {
  const a = degrees * Math.PI / 180;
  return points.map(({ x, y }) => ({ x: .5 + (x - .5) * Math.cos(a) - (y - .5) * Math.sin(a), y: .5 + (x - .5) * Math.sin(a) + (y - .5) * Math.cos(a) }));
}
function extendFinger(p, mcp) {
  const { x, y } = p[mcp];
  for (let i = 1; i <= 3; i++) p[mcp + i] = { x, y: y - i * .1 };
}
function relax(gate, at = 0) { for (let t = at; t <= at + 300; t += 100) gate.update(null, t); }

test('recognises up and down with either mirrored hand', () => {
  for (const choice of ['yes', 'no']) {
    assert.equal(thumbChoice(thumb(choice)), choice);
    assert.equal(thumbChoice(thumb(choice).map(({ x, y }) => ({ x: 1 - x, y }))), choice);
  }
});

test('handles position, size, modest tilt and camera aspect ratio', () => {
  for (const choice of ['yes', 'no']) for (const angle of [-25, 0, 25]) {
    const scaled = rotate(thumb(choice), angle).map(({ x, y }) => ({ x: x * .4 + .2, y: y * .4 + .1 }));
    assert.equal(thumbChoice(scaled), choice);
    assert.equal(thumbChoice(scaled.map(({ x, y }) => ({ x: x / (16 / 9), y })), 16 / 9), choice);
  }
});

test('rejects a pointing finger, open palm, fist and sideways thumb', () => {
  const pointing = thumb(); extendFinger(pointing, 5);
  const palm = thumb(); [5, 9, 13, 17].forEach(mcp => extendFinger(palm, mcp));
  const fist = thumb(); fist[3] = { x: .34, y: .6 }; fist[4] = { x: .4, y: .6 };
  for (const p of [pointing, palm, fist, rotate(thumb(), 90)]) assert.equal(thumbChoice(p), null);
});

test('rejects bent or tucked thumbs and incomplete or invalid tracking', () => {
  const bent = thumb(); bent[3] = { x: .1, y: .5 };
  const tucked = thumb(); tucked[2].y = .8; tucked[3].y = .65; tucked[4].y = .5;
  const invalid = thumb(); invalid[4].x = NaN;
  for (const p of [bent, tucked, invalid, null, [], thumb().slice(1), Array(21).fill({ x: .5, y: .5 })]) assert.equal(thumbChoice(p), null);
  assert.equal(thumbChoice(thumb(), 0), null);
});

test('runs only inside a prompt and never accepts the original held pose', () => {
  const gate = createThumbFeedback();
  assert.equal(gate.update(thumb(), 0).confirmed, null);
  gate.begin();
  for (let t = 0; t <= 2000; t += 100) {
    const next = gate.update(thumb(), t);
    assert.equal(next.confirmed, null); assert.equal(next.ready, false);
  }
});

test('relax then hold a thumb for one second, once per prompt', () => {
  for (const choice of ['yes', 'no']) {
    const gate = createThumbFeedback(); gate.begin(); relax(gate);
    for (let t = 400; t < 1400; t += 100) assert.equal(gate.update(thumb(choice), t).confirmed, null);
    assert.equal(gate.update(thumb(choice), 1400).confirmed, choice);
    assert.equal(gate.isActive(), false);
    assert.equal(gate.update(thumb(choice), 1500).confirmed, null);
    gate.begin();
    assert.equal(gate.update(thumb(choice), 1600).ready, false);
  }
});

test('an ambiguous frame or opposite thumb restarts the hold', () => {
  const gate = createThumbFeedback(); gate.begin(); relax(gate);
  gate.update(thumb(), 400); gate.update(thumb(), 500);
  assert.equal(gate.update(null, 600).progress, 0);
  for (let t = 700; t <= 1100; t += 100) gate.update(thumb(), t);
  assert.equal(gate.update(thumb('no'), 1200).progress, 0);
  for (let t = 1300; t < 2200; t += 100) assert.equal(gate.update(thumb('no'), t).confirmed, null);
  assert.equal(gate.update(thumb('no'), 2200).confirmed, 'no');
});

test('tracking gaps and camera resets require relaxing again', () => {
  const gate = createThumbFeedback(); gate.begin(); relax(gate);
  gate.update(thumb(), 400); gate.update(thumb(), 500);
  assert.equal(gate.update(thumb(), 1000).ready, false);
  relax(gate, 1100); gate.update(thumb(), 1500);
  gate.reset();
  assert.equal(gate.isActive(), true);
  assert.equal(gate.update(thumb(), 1600).ready, false);
  assert.equal(gate.update(thumb(), NaN).confirmed, null);
});

test('clicking a button or leaving the prompt cancels all thumb input', () => {
  const gate = createThumbFeedback(); gate.begin(); relax(gate);
  gate.update(thumb(), 400); gate.cancel();
  assert.equal(gate.isActive(), false);
  for (let t = 500; t <= 2000; t += 100) assert.equal(gate.update(thumb(), t).confirmed, null);
});
