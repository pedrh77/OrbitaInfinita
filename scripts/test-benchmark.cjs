const assert = require('node:assert/strict');
const Runner = require('../dist/benchmark.js');
const { Recorder } = require('../dist/performance.js');

function harness({ rendererResult = true, pendingRenderer = null } = {}) {
  const calls = [], emitted = [], overlays = [], outputs = [];
  let now = 0, sceneState = { state: 'playing', mode: 'orbit' };
  const saved = { renderer: 'canvas', sentinel: 'original save' };
  const api = {
    capture() { calls.push(['capture']); return saved; },
    restore(value) { calls.push(['restore', value]); },
    reset(value) { calls.push(['reset', value]); sceneState = { state: value.mode === 'menu' ? 'menu' : 'playing', mode: 'orbit' }; },
    aim(angle, charge) { calls.push(['aim', angle, charge]); },
    launch() { calls.push(['launch']); sceneState.mode = 'flight'; },
    burst(count) { calls.push(['burst', count]); }, state() { return sceneState; },
    setRenderer(name) { calls.push(['renderer', name]); return pendingRenderer || Promise.resolve(rendererResult); },
    setQuality(name) { calls.push(['quality', name]); }, pause() { calls.push(['pause']); }
  };
  const recorder = new Recorder({ now: () => now, memory: () => undefined, emit: result => outputs.push(result) });
  const runner = new Runner({ api, recorder, now: () => now, emit: value => emitted.push(value), overlay: value => overlays.push(value) });
  return { api, runner, recorder, calls, emitted, overlays, outputs, saved,
    state(value) { sceneState = value; },
    fixedStep(dt = 1 / 120) { runner.step(dt); },
    frame(dt) { now += dt * 1000; recorder.frame({ elapsedMs: dt * 1000, state: sceneState.state, presented: true }); runner.afterFrame(); }
  };
}

async function test(name, run) { await run(); console.log(`PASS: ${name}`); }

(async () => {
  await test('suite uses declared scenarios, seed, quality and clean restoration', async () => {
    const h = harness(); assert.equal(await h.runner.start({ scenario: 'suite', seconds: 5, seed: 42 }), true);
    const expected = ['menu', 'start', 'aim', 'flight', 'stress', 'particles'];
    for (const scenario of expected) {
      assert.equal(h.runner.scenario, scenario);
      h.recorder.warmLeft = 0;
      for (let i = 0; i < 600; i++) h.fixedStep();
      h.frame(5);
    }
    assert.equal(h.runner.running, false);
    assert.equal(h.calls.filter(call => call[0] === 'capture').length, 1);
    assert.deepEqual(h.calls.filter(call => call[0] === 'restore'), [['restore', h.saved]]);
    assert.equal(h.outputs.length, 6); assert.equal(h.runner.reports.length, 6);
    assert.equal(h.emitted.at(-1).type, 'benchmark-complete');
    assert.equal(h.overlays.at(-1).running, false);
    assert.deepEqual(h.calls.filter(call => call[0] === 'reset').map(call => call[1].level), [0, 0, 0, 0, 25, 15]);
    assert.equal(h.calls.find(call => call[0] === 'reset')[1].seed, 42);
    assert.equal(JSON.stringify(h.emitted).includes('original save'), false, 'save cannot leak into diagnostics');
  });

  await test('fixed-step aim inputs are identical under 20/30/60/90/120 Hz presentation', async () => {
    const results = [];
    for (const fps of [20, 30, 60, 90, 120]) {
      const h = harness(); await h.runner.start({ scenario: 'aim', seconds: 20 });
      let accumulator = 0;
      for (let i = 0; i < fps * 2; i++) {
        accumulator += 1 / fps;
        while (accumulator + 1e-10 >= 1 / 120) { h.fixedStep(); accumulator -= 1 / 120; }
        h.frame(1 / fps);
      }
      results.push(h.calls.filter(call => call[0] === 'aim'));
      await h.runner.stop();
    }
    for (const actual of results) assert.deepEqual(actual, results[0]);
  });

  await test('flight launches again after landing and resets the seeded run only after game-over', async () => {
    const h = harness(); await h.runner.start({ scenario: 'flight', seed: 10 });
    h.fixedStep(); assert.equal(h.calls.filter(call => call[0] === 'launch').length, 1);
    h.state({ state: 'playing', mode: 'orbit' }); h.fixedStep();
    assert.equal(h.calls.filter(call => call[0] === 'launch').length, 2);
    assert.equal(h.calls.filter(call => call[0] === 'reset').length, 1, 'landing keeps the current world');
    h.state({ state: 'over', mode: 'flight' }); h.fixedStep();
    assert.equal(h.calls.filter(call => call[0] === 'launch').length, 3);
    assert.equal(h.calls.filter(call => call[0] === 'reset').at(-1)[1].seed, 11);
    await h.runner.stop();
  });

  await test('long session defaults to 120 seconds and cycles every 20 simulation seconds', async () => {
    const h = harness(); await h.runner.start({ scenario: 'long' });
    assert.equal(h.recorder.options.durationMs, 120000);
    for (let i = 0; i < 4800; i++) h.fixedStep();
    const resets = h.calls.filter(call => call[0] === 'reset');
    assert.deepEqual(resets.map(call => call[1].level), [0, 0, 25]);
    assert.equal(h.calls.filter(call => call[0] === 'launch').length, 1);
    await h.runner.stop();
  });

  await test('ten-minute run retains all windows and restores save; unsafe duration never captures', async () => {
    const h = harness();
    assert.equal(await h.runner.start({ scenario: 'long', seconds: 600 }), true);
    assert.equal(h.recorder.options.durationMs, 600000);
    h.recorder.warmLeft = 0;
    for (let i = 0; i < 120; i++) h.frame(5);
    assert.equal(h.runner.running, false);
    assert.equal(h.runner.reports.length, 120);
    assert.deepEqual(h.calls.filter(call => call[0] === 'restore'), [['restore', h.saved]]);
    for (const seconds of [901, Infinity, NaN, 4]) {
      const invalid = harness();
      assert.equal(await invalid.runner.start({ scenario: 'long', seconds }), false);
      assert.equal(invalid.calls.length, 0);
    }
    const maximum = harness();
    assert.equal(await maximum.runner.start({ scenario: 'long', seconds: 900 }), true);
    await maximum.runner.stop();
  });

  await test('failed Pixi initialization restores state instead of mislabelling Canvas', async () => {
    const h = harness({ rendererResult: 'canvas' });
    assert.equal(await h.runner.start({ scenario: 'stress', renderer: 'pixi' }), false);
    assert.equal(h.runner.running, false); assert.equal(h.recorder.active, false);
    assert.equal(h.calls.filter(call => call[0] === 'restore').length, 1);
    assert.equal(h.calls.filter(call => call[0] === 'reset').length, 0);
    assert.ok(h.emitted.some(event => event.type === 'benchmark-error' && event.message.includes('Requested pixi')));
  });

  await test('manual stop restores once and prevents additional scenario mutations', async () => {
    const h = harness(); await h.runner.start({ scenario: 'particles' });
    h.fixedStep(.5); assert.equal(h.calls.filter(call => call[0] === 'burst').length, 2);
    await h.runner.stop(); const calls = h.calls.length;
    h.fixedStep(); h.runner.afterFrame(); await h.runner.stop();
    assert.equal(h.calls.length, calls); assert.equal(h.calls.filter(call => call[0] === 'restore').length, 1);
  });

  await test('invalid benchmark configuration never captures or mutates game state', async () => {
    const h = harness(); assert.equal(await h.runner.start({ scenario: 'unknown' }), false);
    assert.equal(h.calls.length, 0); assert.equal(h.runner.running, false);
    assert.ok(h.emitted.some(event => event.type === 'benchmark-error'));
  });

  await test('pause failure cannot prevent restoration on stop', async () => {
    const h = harness(); await h.runner.start({ scenario: 'start' });
    h.api.pause = () => { throw new Error('view disposed'); };
    await h.runner.stop();
    assert.equal(h.runner.running, false);
    assert.equal(h.calls.filter(call => call[0] === 'restore').length, 1);
    assert.ok(h.emitted.some(event => event.message?.includes('Pause failed')));
  });

  await test('cancelling asynchronous renderer initialization cannot start a late scene', async () => {
    let resolveRenderer;
    const pending = new Promise(resolve => { resolveRenderer = resolve; });
    const h = harness({ pendingRenderer: pending });
    const start = h.runner.start({ scenario: 'stress', renderer: 'pixi' });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(h.runner.running, true);
    await h.runner.stop(); resolveRenderer('pixi');
    assert.equal(await start, false);
    assert.equal(h.calls.filter(call => call[0] === 'reset').length, 0);
    assert.deepEqual(h.calls.filter(call => call[0] === 'renderer').at(-1), ['renderer', 'canvas']);
    assert.equal(h.runner.saved, null, 'released capture must not retain old scene resources');
  });

  await test('simultaneous starts cannot overwrite the original captured save', async () => {
    const h = harness();
    let value = 'original';
    h.api.capture = () => { h.calls.push(['capture']); const saved = { renderer: 'canvas', value }; value = 'diagnostic copy'; return saved; };
    h.api.restore = saved => { value = saved.value; };
    const first = h.runner.start({ scenario: 'start' });
    const second = h.runner.start({ scenario: 'stress' });
    assert.deepEqual(await Promise.all([first, second]), [true, false]);
    assert.equal(h.calls.filter(call => call[0] === 'capture').length, 1);
    await h.runner.stop(); assert.equal(value, 'original');
  });

  await test('immediate cancellation before capture prevents a late benchmark start', async () => {
    const h = harness();
    const starting = h.runner.start({ scenario: 'start' });
    await h.runner.stop();
    assert.equal(await starting, false);
    assert.equal(h.calls.filter(call => call[0] === 'capture').length, 0);
    assert.equal(h.runner.running, false);
  });

  await test('a completed initialization can replace an active benchmark safely', async () => {
    const h = harness();
    assert.equal(await h.runner.start({ scenario: 'start' }), true);
    assert.equal(await h.runner.start({ scenario: 'stress' }), true);
    assert.equal(h.calls.filter(call => call[0] === 'restore').length, 1);
    assert.equal(h.calls.filter(call => call[0] === 'capture').length, 2);
    assert.equal(h.runner.scenario, 'stress');
    await h.runner.stop();
  });

  await test('new benchmark waits for an earlier asynchronous restoration', async () => {
    const h = harness(); await h.runner.start({ scenario: 'start' });
    const restore = h.api.restore;
    let completeRestore;
    h.api.restore = saved => new Promise(resolve => { completeRestore = () => { restore(saved); resolve(); }; });
    const stopped = h.runner.stop();
    const next = h.runner.start({ scenario: 'stress' });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(h.calls.filter(call => call[0] === 'capture').length, 1);
    completeRestore(); await stopped;
    assert.equal(await next, true);
    assert.equal(h.calls.filter(call => call[0] === 'capture').length, 2);
    h.api.restore = restore; await h.runner.stop();
  });

  await test('completion waits for asynchronous restoration and restoration failures never report success', async () => {
    const h = harness(); await h.runner.start({ scenario: 'start', seconds: 5 });
    let restore;
    h.api.restore = () => new Promise(resolve => { restore = resolve; });
    h.recorder.warmLeft = 0; h.frame(5);
    assert.equal(h.emitted.some(event => event.type === 'benchmark-complete'), false);
    restore(); await h.runner.stop();
    assert.equal(h.emitted.filter(event => event.type === 'benchmark-complete').length, 1);

    const failed = harness(); await failed.runner.start({ scenario: 'start' });
    failed.api.restore = async () => { throw new Error('restore fixture failed'); };
    await assert.rejects(failed.runner.stop('complete'), /restore fixture failed/);
    assert.equal(failed.emitted.some(event => event.type === 'benchmark-complete'), false);
    assert.ok(failed.emitted.some(event => event.type === 'benchmark-error' && event.message.includes('Restore failed')));
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
