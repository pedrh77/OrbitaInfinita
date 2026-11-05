// Exercise production wiring rather than replacing the benchmark host with mocks.
const assert = require('node:assert/strict');
const { harness, near } = require('./test-game.cjs');

function select(h, choice, cap30 = false) {
  const quality = h.document.querySelector('#quality-select');
  quality.handlers.change({ target: { value: choice } });
  h.document.querySelector('#eco-30').handlers.change({ target: { checked: cap30 } });
}
function report(name) { console.log(`PASS: ${name}`); }
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

(async () => {
  {
    const h = harness();
    assert.equal(h.snapshot().state, 'menu'); assert.equal(h.frames.size, 1);
    h.game.openShop(); h.tick();
    assert.equal(h.frames.size, 0, 'covered menu stops after its pending frame');
    const images = h.metrics.images;
    for (let i = 0; i < 60; i++) h.tick();
    assert.equal(h.metrics.images, images, 'shop does not redraw its hidden game background');
    h.game.closeShop(); assert.equal(h.frames.size, 1); h.tick();
    assert.equal(h.frames.size, 1, 'closing shop resumes animated menu');
    h.document.querySelector('#performance-button').handlers.click(); h.tick();
    assert.equal(h.frames.size, 0);
    select(h, 'eco'); assert.equal(h.frames.size, 1, 'profile selection requests a fresh preview');
    h.tick(); assert.equal(h.frames.size, 0, 'profile preview does not restart continuous hidden rendering');
    h.document.querySelector('#close-performance').handlers.click(); h.tick();
    assert.equal(h.frames.size, 1, 'closing graphics resumes animated menu');
    report('shop and graphics stop covered menu rendering and resume it only when closed');
  }
  {
    const results = [];
    for (const [quality, cap30] of [['high', false], ['eco', true]]) {
      const h = harness(); h.game.fixture(); select(h, quality, cap30); h.game.wakeLoop();
      const images = h.metrics.images;
      for (let i = 0; i < 120; i++) h.tick(1000 / 120);
      results.push({ state: h.snapshot(), images: h.metrics.images - images });
      assert.equal(h.game.quality().targetFPS, cap30 ? 30 : 60);
      const preference = JSON.parse(h.storage.get('orbita-infinita-performance-v1'));
      assert.equal(preference.choice, quality); assert.equal(preference.cap30, cap30);
    }
    for (const key of ['x', 'y', 'vx', 'vy']) near(results[0].state.ship[key], results[1].state.ship[key], `quality preserves ${key}`);
    near(results[0].state.remaining, results[1].state.remaining, '30 FPS preserves event time');
    assert.ok(results[1].images < results[0].images * .5, '30 FPS reduces submitted draws on a 120 Hz display');
    report('manual graphics preferences persist; optional 30 FPS reduces drawing without changing physics');
  }
  {
    const h = harness(); h.game.fixture();
    for (let i = 0; i < 90; i++) {
      h.game.advanceFrame(1 / 90);
      const simulated = h.snapshot();
      const visual = h.game.displayScene();
      assert.ok(Number.isFinite(visual.ship.x));
      assert.ok(visual.ship.x <= simulated.ship.x + 1e-8, 'presentation cannot advance physics');
      assert.ok(simulated.ship.x - visual.ship.x <= 20 / 120 + 1e-8, 'visual lag stays within one fixed step');
      assert.deepEqual(h.snapshot(), simulated, 'render snapshot does not mutate simulation');
    }
    near(h.snapshot().ship.x, 200, '90 Hz fixed-step distance');
    assert.ok(h.document.querySelector('#event-timer').textWrites <= 12, 'one-second timer needs at most eleven distinct labels');
    report('90 Hz production presentation preserves physics and timer avoids redundant DOM writes');
  }
  {
    const h = harness(); h.game.fixture();
    h.game.burst(180, 700, '#6ee7ff', 10000, 150);
    assert.ok(h.game.particleStats().active <= 256);
    h.game.updateParticles(2);
    assert.equal(h.game.particleStats().active, 0);
    const pooled = h.game.particleStats().pooled; assert.ok(pooled > 0 && pooled <= 256);
    h.game.burst(180, 700, '#6ee7ff', 100, 150);
    assert.ok(h.game.particleStats().pooled < pooled, 'new burst reuses expired objects');
    for (let i = 0; i < 100; i++) { h.game.burst(180, 700, '#6ee7ff', 1000, 150); h.game.updateParticles(2); }
    assert.ok(h.game.particleStats().pooled <= 256);
    report('particle storms stay bounded and reuse expired objects');
  }
  {
    const h = harness(); select(h, 'high'); h.tick();
    const storage = [...h.storage.entries()], before = h.snapshot();
    assert.equal(await h.window.OrbitaBenchmark({ scenario: 'particles', renderer: 'canvas', quality: 'eco', seconds: 5 }), true);
    for (let i = 0; i < 100; i++) h.tick();
    assert.equal(h.game.benchmark().running, true);
    await h.game.benchmark().stop('integration-cancel'); await flush();
    assert.deepEqual([...h.storage.entries()], storage, 'cancelled diagnostics must not persist rewards or graphics changes');
    assert.equal(h.snapshot().state, before.state);
    assert.equal(h.game.quality().choice, 'high');
    assert.equal(h.document.querySelector('#benchmark-status').hidden, true);
    assert.ok(!h.logs.some(line => line.includes('benchmark-error')));
    report('cancelled production benchmark restores save, menu and selected graphics');
  }
  {
    const h = harness(); const storage = [...h.storage.entries()];
    assert.equal(await h.window.OrbitaBenchmark({ scenario: 'flight', renderer: 'canvas', seconds: 5, seed: 12345 }), true);
    for (let i = 0; i < 650 && h.game.benchmark().running; i++) { h.tick(); await flush(); }
    await flush();
    assert.equal(h.game.benchmark().running, false, 'finite run completes without user input');
    assert.deepEqual([...h.storage.entries()], storage, 'completed diagnostics must not persist run rewards');
    assert.equal(h.snapshot().state, 'menu');
    const completion = h.logs.find(line => line.includes('benchmark-complete'));
    assert.ok(completion, 'completion result emitted');
    assert.ok(h.logs.some(line => line.includes('"scenario":"flight"') && line.includes('"frameP99"')));
    assert.ok(!h.logs.some(line => line.includes('benchmark-error')));
    report('production flight benchmark completes, records frame percentiles and restores original save');
  }
  {
    const h = harness();
    assert.equal(await h.window.OrbitaBenchmark({ scenario: 'start', renderer: 'canvas', seconds: 5 }), true);
    // Pass warmup before the interruption so the gap belongs to a measured window.
    for (let i = 0; i < 200; i++) h.tick();
    const before = h.snapshot(), simulationTime = h.game.benchmark().sceneTime;
    h.tick(1500);
    assert.equal(h.snapshot().state, 'playing', 'diagnostics continue after the interruption');
    assert.deepEqual(h.snapshot().ship, before.ship, 'long diagnostic stall never catches up physics');
    near(h.game.benchmark().sceneTime, simulationTime, 'stall does not advance scripted inputs');
    assert.ok(h.logs.some(line => line.includes('"type":"benchmark-stall"') && line.includes('"elapsedMs":1500')));
    assert.equal(h.game.benchmark().running, true);
    for (let i = 0; i < 650 && h.game.benchmark().running; i++) { h.tick(); await flush(); }
    await flush();
    assert.equal(h.game.benchmark().running, false);
    assert.ok(h.game.benchmark().reports.some(result => result.maxFrameMs >= 1500), 'measured interval includes the actual stall');
    assert.ok(h.logs.some(line => line.includes('benchmark-complete')));
    assert.ok(!h.logs.some(line => line.includes('benchmark-error')));
    report('diagnostic long stall records the gap, skips physics catch-up and still completes');
  }
  {
    const h = harness();
    assert.equal(await h.window.OrbitaBenchmark({ scenario: 'menu', renderer: 'canvas', seconds: 5 }), true);
    for (let i = 0; i < 650 && h.game.benchmark().running; i++) { h.tick(); await flush(); }
    await flush();
    assert.equal(h.game.benchmark().running, false);
    assert.ok(h.game.benchmark().reports.length > 0);
    for (const result of h.game.benchmark().reports) {
      assert.equal(result.scenario, 'menu');
      assert.equal(result.predictionSolves, 0, 'menu must not simulate an unused trajectory');
    }
    report('production menu benchmark avoids all trajectory solves');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
