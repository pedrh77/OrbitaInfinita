// Behavioral tests for quality selection and measurement. No browser or dependencies.
const assert = require('node:assert/strict');
const { Quality, Recorder } = require('../dist/performance.js');

function test(name, run) {
  try { run(); console.log(`PASS: ${name}`); }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}
function near(actual, expected, message, tolerance = .011) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
}
function qualityHarness(initial = {}) {
  let clock = 0;
  const data = new Map(Object.entries(initial)), writes = [], changes = [];
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem(key, value) { writes.push([key, value]); data.set(key, value); }
  };
  const quality = new Quality({ storage, now: () => clock,
    onChange: value => changes.push({ time: clock, profile: value.resolved }) });
  return { quality, storage, data, writes, changes,
    advance(ms) { clock += ms; },
    feed(ms, seconds) { for (let i = 0; i < seconds * 1000 / ms; i++) { clock += ms; quality.observe(ms); } }
  };
}

test('manual quality persists separately and preserves the existing save', () => {
  const save = JSON.stringify({ coins: 520, owned: ['cometa', 'solar'], best: 17 });
  const h = qualityHarness({ 'orbita-infinita-v1': save });
  h.quality.select('high', true);
  assert.equal(h.quality.resolved, 'high'); assert.equal(h.quality.targetFPS, 60);
  assert.equal(h.data.get('orbita-infinita-v1'), save);
  assert.equal(h.writes.length, 1); assert.notEqual(h.writes[0][0], 'orbita-infinita-v1');
  const restored = new Quality({ storage: h.storage, now: () => 0 });
  assert.equal(restored.choice, 'high'); assert.equal(restored.resolved, 'high');
  assert.equal(restored.cap30, true); assert.equal(restored.targetFPS, 60);
  h.feed(50, 40); assert.equal(h.quality.resolved, 'high', 'manual profile must not be overridden');
  assert.equal(h.changes.length, 1);
});

test('30 FPS cap applies only to the economic profile', () => {
  const { quality } = qualityHarness();
  for (const choice of ['high', 'balanced']) {
    quality.select(choice, true); assert.equal(quality.targetFPS, 60, choice);
  }
  quality.select('eco', true); assert.equal(quality.targetFPS, 30);
  quality.select('eco', false); assert.equal(quality.targetFPS, 60);
  quality.select('auto', true); assert.equal(quality.targetFPS, 60);
});

test('unknown quality names and prototype properties are rejected', () => {
  const h = qualityHarness();
  for (const choice of ['unknown', 'toString', '__proto__', 'constructor']) {
    h.quality.select(choice);
    assert.equal(h.quality.choice, 'auto', `invalid selection ${choice}`);
  }
  assert.equal(h.changes.length, 0); assert.equal(h.writes.length, 0);
  for (const choice of ['toString', '__proto__']) {
    const initial = qualityHarness({ 'orbita-infinita-performance-v1': JSON.stringify({ choice }) });
    assert.equal(initial.quality.choice, 'auto', `invalid saved choice ${choice}`);
    assert.equal(initial.quality.resolved, 'balanced');
  }
});

test('warmup and background-sized gaps cannot trigger a quality change', () => {
  const h = qualityHarness();
  h.feed(50, 2.9); assert.equal(h.changes.length, 0);
  h.quality.reset();
  for (let i = 0; i < 30; i++) { h.advance(60000); h.quality.observe(60000); }
  assert.equal(h.changes.length, 0); assert.equal(h.quality.resolved, 'balanced');
  h.quality.observe(0); h.quality.observe(-10); h.quality.observe(251);
  assert.equal(h.changes.length, 0);
});

test('automatic quality degrades gradually and recovers with hysteresis', () => {
  const h = qualityHarness();
  h.feed(1000 / 30, 35);
  assert.equal(h.quality.resolved, 'eco');
  assert.equal(h.changes.filter(change => change.profile === 'eco').length, 1);
  const down = h.changes[0]; assert.ok(down.time >= 6000, 'warmup and sustained overload precede downgrade');
  const before = h.changes.length;
  h.feed(1000 / 60, 8); assert.equal(h.changes.length, before, 'brief recovery must not switch quality');
  h.feed(1000 / 60, 60); assert.equal(h.quality.resolved, 'high');
  for (let i = 1; i < h.changes.length; i++) {
    const minimum = h.changes[i].profile === 'eco' ? 8000 : 20000;
    assert.ok(h.changes[i].time - h.changes[i - 1].time >= minimum, 'quality changes respect cooldown');
  }
  assert.ok(h.changes.length <= 3, 'quality cannot oscillate through profiles');
});

test('borderline timings do not cause profile oscillation', () => {
  const h = qualityHarness();
  for (let i = 0; i < 2000; i++) { const ms = i % 2 ? 20 : 19; h.advance(ms); h.quality.observe(ms); }
  assert.equal(h.quality.resolved, 'balanced'); assert.equal(h.changes.length, 0);
});

test('recorder reports independent frame, physics, preparation and prediction statistics', () => {
  const reports = [];
  const recorder = new Recorder({ emit: report => reports.push(report), memory: () => undefined });
  recorder.start({ warmupMs: 0, windowMs: 5050, durationMs: 5050, scenario: 'known-data' });
  for (let ms = 1; ms <= 100; ms++) {
    if (ms <= 10) recorder.prediction(ms);
    recorder.frame({ elapsedMs: ms, updateMs: 2, renderMs: 4, state: ms <= 50 ? 'orbit' : 'flight', counters: { landings: 2 } });
  }
  assert.equal(reports.length, 1); const report = reports[0];
  assert.equal(report.frames, 100); assert.equal(report.rafFrames, 100);
  assert.equal(report.sampleMs, 5050); near(report.fps, 100000 / 5050, 'average FPS');
  assert.equal(report.frameP50, 50); assert.equal(report.frameP95, 95); assert.equal(report.frameP99, 99);
  assert.equal(report.maxFrameMs, 100); assert.equal(report.minFPS, 10); assert.equal(report.over33ms, 67);
  assert.equal(report.updateMean, 2); assert.equal(report.updateP95, 2);
  assert.equal(report.renderPrepMean, 4); assert.equal(report.renderPrepP95, 4);
  assert.equal(report.predictionSolves, 10); assert.equal(report.predictionMean, 5.5); assert.equal(report.predictionP95, 10);
  assert.equal(report.stateChanges, 1); assert.equal(report.jsHeap, null); assert.equal(report.jsGCCount, null);
  assert.deepEqual(report.counters, { landings: 2 }); assert.equal(recorder.active, false);
});

test('presented FPS is separate from RAF frequency and skipped render costs', () => {
  const reports = [];
  const recorder = new Recorder({ emit: report => reports.push(report), memory: () => undefined });
  recorder.start({ warmupMs: 0, windowMs: 999.9, durationMs: 999.9 });
  for (let i = 1; i <= 60; i++) recorder.frame({ elapsedMs: 1000 / 60,
    updateMs: 2, renderMs: i % 2 ? 999 : 6, presented: i % 2 === 0, state: 'playing' });
  const report = reports[0]; assert.ok(report);
  assert.equal(report.rafFrames, 60); assert.equal(report.frames, 30); near(report.fps, 30, 'presented FPS');
  near(report.frameP95, 1000 / 30, 'presented interval'); assert.equal(report.renderPrepMean, 6);
});

test('warmup excludes both frame and trajectory work', () => {
  const reports = [];
  const recorder = new Recorder({ emit: report => reports.push(report) });
  recorder.start({ warmupMs: 100, windowMs: 50, durationMs: 50 });
  for (let i = 0; i < 4; i++) {
    recorder.prediction(999); recorder.frame({ elapsedMs: 25, updateMs: 999, renderMs: 999, state: 'menu' });
  }
  assert.equal(reports.length, 0);
  for (let i = 0; i < 2; i++) {
    recorder.prediction(3); recorder.frame({ elapsedMs: 25, updateMs: 1, renderMs: 2, state: 'playing' });
  }
  const report = reports[0]; assert.equal(report.sampleMs, 50); assert.equal(report.frames, 2);
  assert.equal(report.predictionSolves, 2); assert.equal(report.predictionMean, 3);
  assert.equal(report.updateP95, 1); assert.equal(report.renderPrepP95, 2); assert.equal(report.stateChanges, 0);
});

test('suspend excludes partial windows and time spent in background', () => {
  const reports = []; let clock = 0;
  const recorder = new Recorder({ emit: report => reports.push(report), now: () => clock });
  recorder.start({ warmupMs: 0, windowMs: 100, durationMs: 1000 });
  recorder.frame({ elapsedMs: 50, updateMs: 99, renderMs: 99, state: 'playing' });
  recorder.prediction(99); recorder.suspend(); clock += 60000;
  for (let i = 0; i < 2; i++) recorder.frame({ elapsedMs: 50, updateMs: 2, renderMs: 3, state: 'playing' });
  const report = reports[0]; assert.equal(report.sampleMs, 100); assert.equal(report.frames, 2);
  assert.equal(report.maxFrameMs, 50); assert.equal(report.updateMean, 2); assert.equal(report.predictionSolves, 0);
});

test('heap data is explicit and unsupported probes stay null', () => {
  for (const memory of [() => undefined, () => { throw new Error('unsupported'); }]) {
    const recorder = new Recorder({ memory }); recorder.start({ warmupMs: 0, windowMs: 10, durationMs: 10 });
    recorder.frame({ elapsedMs: 10, state: 'playing' }); assert.equal(recorder.latest.jsHeap, null);
  }
  const recorder = new Recorder({ memory: () => ({ usedJSHeapSize: 200, totalJSHeapSize: 400, jsHeapSizeLimit: 800 }) });
  recorder.start({ warmupMs: 0, windowMs: 10, durationMs: 10 }); recorder.frame({ elapsedMs: 10, state: 'playing' });
  assert.deepEqual(recorder.latest.jsHeap, { used: 200, total: 400, limit: 800 }); assert.equal(recorder.latest.jsGCCount, null);
});

test('finite sessions finish within one frame; manual overlays can run indefinitely', () => {
  const reports = [];
  const recorder = new Recorder({ emit: report => reports.push(report) });
  recorder.start({ warmupMs: 0, windowMs: 3000, durationMs: 100 });
  for (let i = 0; i < 4; i++) recorder.frame({ elapsedMs: 30, state: 'playing' });
  assert.equal(reports.length, 1); assert.equal(recorder.active, false);
  assert.ok(reports[0].sampleMs >= 100 && reports[0].sampleMs <= 130);
  recorder.frame({ elapsedMs: 30, state: 'playing' }); assert.equal(reports.length, 1);
  recorder.start({ warmupMs: 0, windowMs: 100, durationMs: Infinity });
  for (let i = 0; i < 100; i++) recorder.frame({ elapsedMs: 10, state: 'playing' });
  assert.equal(recorder.active, true); assert.equal(reports.length, 11);
});
