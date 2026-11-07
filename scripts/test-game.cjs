// Behavioral regressions against the shipped game in an isolated DOM/canvas VM.
// Run: node scripts/test-game.cjs (no third-party dependencies).
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const original = readFileSync(join(__dirname, '../dist/game.js'), 'utf8');
const bootstrap = '  resize(); syncUI(); wakeLoop();';
assert.equal(original.split(bootstrap).length, 2, 'test seam must match bootstrap exactly once');
function harness(options = {}) {
  const elements = new Map(), frames = new Map(), captures = new Set(), logs = [], nativeRates = [];
  const size = { width: options.width || 390, height: options.height || 844 }, metrics = { transforms: 0, gradients: 0, arcs: 0, images: 0 };
  let now = 100, sequence = 0;
  const graphics = new Proxy({}, { get(t, k) {
    if (k in t) return t[k];
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => { metrics.gradients++; return { addColorStop() {} }; };
    if (k === 'arc') return () => { metrics.arcs++; };
    if (k === 'drawImage') return (...args) => { metrics.images++; if (options.captureImages) (metrics.imageCalls ||= []).push(args); };
    if (k === 'setTransform') return () => { metrics.transforms++; };
    return () => {};
  } });
  function element() {
    const classes = new Set();
    let text = '';
    return {
      hidden: true, style: {}, attributes: {}, handlers: {},
      textWrites: 0,
      get textContent() { return text; }, set textContent(value) { text = value; this.textWrites++; },
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x),
        toggle(x, force = !classes.has(x)) { if (force) classes.add(x); else classes.delete(x); return force; } },
      setAttribute(k, v) { this.attributes[k] = v; }, addEventListener(k, f) { this.handlers[k] = f; },
      getAttribute(k) { return this.attributes[k] ?? null; },
      focus() { document.activeElement = this; }, blur() { document.activeElement = document.body; },
      appendChild() {}, scrollTo() {}, getContext() { return graphics; }, querySelector() { return element(); },
      getBoundingClientRect() { return { ...size, left: 0, top: 0 }; },
      setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); },
      releasePointerCapture(id) { captures.delete(id); }
    };
  }
  const document = { hidden: false, body: element(), handlers: {}, documentElement: {},
    querySelector(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, addEventListener(k, f) { this.handlers[k] = f; } };
  document.activeElement = document.body;
  const storage = new Map([['orbita-infinita-v1', JSON.stringify({ sound: false })]]);
  const window = { handlers: {}, addEventListener(k, f) { this.handlers[k] = f; } };
  window.OrbitaNativeDisplay = { setFrameRate(rate) { nativeRates.push(rate); } };
  if (options.pixiFactory) {
    window.WebGLRenderingContext = function () {};
    window.PIXI = {}; window.OrbitaPixiRenderer = { create: options.pixiFactory };
    window.location = { search: options.search || '' };
  }
  class CachedPath {
    constructor() { this.points = []; }
    moveTo(x, y) { this.points.push([x, y]); }
    lineTo(x, y) { this.points.push([x, y]); }
  }
  const context = vm.createContext({ document, window, Path2D: options.path2D ? CachedPath : undefined, localStorage: {
    getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v)
  }, devicePixelRatio: options.dpr || 1, getComputedStyle: () => ({ getPropertyValue: () => '0' }),
    performance: { now: () => now },
    requestAnimationFrame(fn) { const id = ++sequence; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }, setTimeout() { return ++sequence; }, clearTimeout() {},
    console: { ...console, info: (...args) => logs.push(args.join(' ')) } });
  const source = original.replace(bootstrap, `
    window.test = {
      STEP, begin, advanceFrame, advanceFlight, tracePrediction, resize, press, aim, release,
      drawPrediction, drawBackground, drawPlanet, planetBody, burst, updateParticles, displayScene, land, resultMessage,
      setBest(value) { save.best = value; },
      best() { return save.best; },
      camera() { return cameraY; },
      setCameraTarget(value) { cameraTargetY = value; },
      benchmark() { return benchmarkRunner; },
      renderer() { return rendererName; },
      rendererReady() { return rendererReady; },
      quality() { return { choice: qualityController.choice, resolved: qualityController.resolved, targetFPS: qualityController.targetFPS }; },
      particleStats() { return { active: particles.length, pooled: particlePool.length }; },
      predictionStamp() { return prediction.stamp; },
      setCamera(y) { cameraY = y; },
      cancelAim, pauseRun, resumeRun, openQuitConfirm, cancelQuit, openShop, closeShop,
      wakeLoop, stopLoop, rewardFailure,
      fixture(o = {}) {
        stopLoop(); state = 'playing'; menuLayout = false; holding = false; activePointer = null;
        appBackground = false; cameraY = cameraTargetY = 0; score = 0; runDust = 0;
        save.shields = save.boosters = save.coins = 0; save.sound = false; charge = .35; phaseCharges = 0;
        specialEvent = { remaining: 18000, targetScore: 999, reward: 100 };
        planets = []; asteroids = []; collectibles = []; phenomena = []; trail = []; particles = [];
        current = { x: 180, y: 758, r: 39 };
        ship = { x: 180, y: 700, vx: 20, vy: -30, aimAngle: -Math.PI / 2, orbitRadius: 58, mode: 'flight' };
        if (o.ship) Object.assign(ship, o.ship);
        if (o.phenomena) phenomena = JSON.parse(JSON.stringify(o.phenomena));
        if (o.planets) planets = JSON.parse(JSON.stringify(o.planets)).map(p => ({ color: '#7c5cff', style: 0, seed: 1, pulse: 0, ...p }));
        document.querySelector('#pause-screen').hidden = true; ui.shop.classList.remove('open'); ui.quitConfirm.hidden = true;
      },
      snapshot() { return JSON.stringify({ state, holding, activePointer, charge, ship, current, planets, phenomena,
        coins: save.coins, remaining: specialEvent?.remaining, W, H, viewScale, viewX, viewY, accumulator }); }
    }; ${bootstrap}
  `);
  for (const dependency of ['performance.js', 'presentation.js', 'benchmark.js']) vm.runInContext(readFileSync(join(__dirname, '../dist', dependency), 'utf8'), context);
  vm.runInContext(source, context);
  return { game: window.test, document, window, size, metrics, captures, frames, storage, logs, nativeRates,
    snapshot: () => JSON.parse(window.test.snapshot()),
    consume(ms) { now += ms; },
    tick(ms = 1000 / 60) { const pending = [...frames.values()]; frames.clear(); now += ms; for (const fn of pending) fn(now); }
  };
}
function near(a, b, message, epsilon = 1e-7) { assert.ok(Math.abs(a - b) <= epsilon, `${message}: ${a} != ${b}`); }
function pointer(id, x = 180, y = 700) { return { pointerId: id, clientX: x, clientY: y, cancelable: true, preventDefault() {} }; }
function test(name, run) { run(); console.log(`PASS: ${name}`); }

if (require.main === module) {
test('saved sound preference', () => {
  const { document } = harness(); assert.equal(document.querySelector('#sound-button').textContent, 'SOM DESLIGADO');
  assert.equal(document.querySelector('#sound-button').attributes['aria-pressed'], 'false');
});

test('tablet pixel budget reduces raster work without changing world coordinates', () => {
  const h = harness({ width: 1098.2857, height: 686.2857, dpr: 1.75 });
  const canvas = h.document.querySelector('#game');
  assert.ok(canvas.width * canvas.height <= 1203000, 'rounding must stay within 0.25% of pixel budget');
  assert.ok(canvas.width * canvas.height < 1920 * 1200 * .53, 'tablet raster work nearly halves');
  near(h.snapshot().W, 1098.2857, 'logical world width');
  near(h.snapshot().H, 686.2857, 'logical world height');
  h.game.fixture();
  for (let i = 0; i < 60; i++) h.game.advanceFrame(1 / 60);
  near(h.snapshot().ship.x, 200, 'raster resolution does not alter physical movement');
  near(h.snapshot().ship.y, 670, 'raster resolution does not alter physical movement');
});
test('same flight and event at 20/30/60/120 FPS', () => {
  const results = [20, 30, 60, 120].map(fps => {
    const h = harness(); h.game.fixture({ phenomena: [
      { type: 'nebula', x: 180, y: 680, r: 300, used: false },
      { type: 'solarWind', x: 200, y: 680, r: 300, used: false, direction: -1 }
    ] });
    for (let i = 0; i < fps; i++) h.game.advanceFrame(1 / fps);
    const s = h.snapshot(); assert.equal(s.state, 'playing'); near(s.remaining, 17000, `${fps} FPS timer`); return s.ship;
  });
  for (const s of results) for (const key of ['x', 'y', 'vx', 'vy']) near(s[key], results[0][key], key);
});
test('nebula attenuation depends on elapsed seconds', () => {
  for (const fps of [20, 30, 60, 120]) {
    const h = harness(); h.game.fixture({ phenomena: [{ type: 'nebula', x: 180, y: 700, r: 10000, used: false }] });
    const body = { x: 180, y: 700, vx: 100, vy: 0 };
    for (let i = 0; i < fps; i++) h.game.advanceFlight(body, 1 / fps);
    near(body.vx, 100 * Math.exp(-.65), `nebula at ${fps} FPS`);
  }
});
test('wind and rift apply their declared force and direction', () => {
  for (const direction of [-1, 1]) for (const type of ['solarWind', 'gravityRift']) {
    const h = harness(); h.game.fixture({ phenomena: [{ type, x: 200, y: 700, r: 100, used: false, direction }] });
    const body = { x: 180, y: 700, vx: 0, vy: 0 };
    h.game.advanceFlight(body, h.game.STEP);
    if (type === 'solarWind') {
      near(body.vx, .8 * 115 * h.game.STEP * direction, 'wind force'); near(body.vy, 0, 'wind vertical');
    } else {
      near(body.vx, 0, 'rift horizontal'); near(body.vy, -.8 * 165 * h.game.STEP * direction, 'rift force');
    }
  }
});
test('preview matches flight: wind, rift, nebula, boost and moving planet', () => {
  for (const direction of [-1, 1]) {
    const h = harness(); h.game.fixture({ ship: { mode: 'orbit' },
      planets: [{ x: 315, y: 400, r: 10, pulse: 0, target: true,
        orbitMotion: { cx: 300, cy: 400, radius: 15, angle: 0, speed: .5 } }],
      phenomena: [
        { type: 'nebula', x: 180, y: 600, r: 250, used: false, pulse: 0 },
        { type: 'solarWind', x: 220, y: 600, r: 250, used: false, pulse: 0, direction },
        { type: 'gravityRift', x: 150, y: 600, r: 250, used: false, pulse: 0, direction },
        { type: 'boostGate', x: 180, y: 650, r: 17, used: false, pulse: 0 }
      ] });
    const before = h.snapshot(), preview = h.game.tracePrediction();
    const points = Array.from(preview.points.slice(0, preview.count * 2));
    assert.deepEqual(h.snapshot(), before, 'preview cannot move entities or consume rewards');
    h.game.fixture({ ship: { mode: 'flight', vx: 0, vy: -(255 + .35 * 290) }, planets: before.planets, phenomena: before.phenomena });
    for (let i = 0; i < points.length / 2; i++) {
      h.game.advanceFrame(h.game.STEP); const s = h.snapshot();
      near(s.ship.x, points[2 * i], `preview x step ${i}`); near(s.ship.y, points[2 * i + 1], `preview y step ${i}`);
    }
    assert.equal(h.snapshot().phenomena[3].used, true); assert.equal(h.snapshot().coins, 8, 'gate rewards once');
  }
});
test('multitouch, keyboard and cancellation preserve gesture ownership', () => {
  const h = harness(); h.game.fixture({ ship: { mode: 'orbit' } }); h.game.press(pointer(1)); h.game.aim(pointer(1, 220, 650));
  const before = h.snapshot(); assert.ok(h.captures.has(1));
  h.game.press(pointer(2)); h.game.aim(pointer(2, 20, 20)); h.game.release(pointer(2)); h.game.cancelAim(pointer(2)); h.game.release({ code: 'Space' });
  assert.deepEqual(h.snapshot(), before); h.game.release(pointer(1)); assert.equal(h.snapshot().ship.mode, 'flight'); assert.equal(h.captures.size, 0);
  h.game.fixture({ ship: { mode: 'orbit' } }); h.game.press(pointer(3)); h.game.cancelAim(pointer(3)); h.game.release(pointer(3));
  assert.equal(h.snapshot().ship.mode, 'orbit'); assert.equal(h.captures.size, 0);
  h.game.press({ code: 'Space' }); h.game.release(pointer(4)); assert.equal(h.snapshot().holding, true);
  h.game.release({ code: 'Space' }); assert.equal(h.snapshot().ship.mode, 'flight');
  h.game.fixture({ ship: { mode: 'orbit' } });
  h.window.handlers.keydown({ code: 'Space', target: h.document.querySelector('#shop-button') }); assert.equal(h.snapshot().holding, false);
});
test('rotation pauses and preserves world, velocity and event', () => {
  const h = harness(); h.game.fixture({ planets: [{ x: 280, y: 400, r: 25,
    orbitMotion: { cx: 270, cy: 400, radius: 10, angle: 0, speed: .5 } }] });
  const before = h.snapshot(); h.size.width = 844; h.size.height = 390; h.game.resize(); const after = h.snapshot();
  assert.equal(after.state, 'suspended');
  for (const key of ['ship', 'current', 'planets', 'remaining', 'W', 'H']) assert.deepEqual(after[key], before[key], key);
  const transforms = h.metrics.transforms; h.game.resize(); assert.equal(h.metrics.transforms, transforms, 'identical resize preserves canvas');
  h.game.advanceFrame(30); assert.deepEqual(h.snapshot(), after); h.game.resumeRun(); h.game.advanceFrame(h.game.STEP);
  assert.equal(h.snapshot().state, 'playing'); assert.notEqual(h.snapshot().ship.y, before.ship.y);
  h.game.fixture({ ship: { mode: 'orbit' } }); h.game.press(pointer(9));
  h.size.width = 390; h.size.height = 844; h.game.resize(); h.game.release(pointer(9));
  assert.equal(h.snapshot().holding, false); assert.equal(h.snapshot().ship.mode, 'orbit'); assert.equal(h.captures.size, 0);
});
test('pause drains RAF queue; background and long stalls never fast-forward flight', () => {
  const h = harness(); h.game.fixture(); h.game.wakeLoop(); assert.equal(h.frames.size, 1); h.tick();
  assert.equal(h.frames.size, 1); h.game.pauseRun(); h.tick(); assert.equal(h.frames.size, 0);
  const before = h.snapshot(); h.tick(60000); assert.deepEqual(h.snapshot(), before);
  h.game.resumeRun(); assert.equal(h.frames.size, 1); h.tick(1000 / 120);
  near(h.snapshot().remaining, before.remaining - 1000 / 120, 'resume counts only active time');
  h.window.handlers['orbita-app-pause'](); assert.equal(h.frames.size, 0); h.game.resumeRun(); assert.equal(h.snapshot().state, 'suspended');
  h.window.handlers['orbita-app-resume'](); h.tick(); assert.equal(h.snapshot().state, 'suspended'); assert.equal(h.frames.size, 0);
  h.game.resumeRun(); h.game.advanceFrame(.251); assert.equal(h.snapshot().state, 'playing', 'short stalls must not force an unwanted pause');
  h.game.advanceFrame(1.001); assert.equal(h.snapshot().state, 'suspended', 'long interruptions still protect the player');
});
test('Hangar blocks resuming until closed; short hitch advances exactly its elapsed time', () => {
  const h = harness(); h.game.fixture(); h.game.advanceFrame(.25);
  near(h.snapshot().remaining, 17750, '250 ms hitch'); near(h.snapshot().ship.x, 185, 'hitch flight position');
  h.game.openShop(); const before = h.snapshot(); h.game.resumeRun(); assert.deepEqual(h.snapshot(), before);
  h.game.closeShop(); h.game.resumeRun(); assert.equal(h.snapshot().state, 'playing');
});
test('quit pauses timer; aim slows world but not timer; visibility requires explicit resume', () => {
  const h = harness(); h.game.fixture({ ship: { mode: 'orbit' }, planets: [{ x: 300, y: 400, r: 10,
    pulse: 0, orbitMotion: { cx: 285, cy: 400, radius: 15, angle: 0, speed: .5 } }] });
  h.game.openQuitConfirm(); h.game.advanceFrame(10); near(h.snapshot().remaining, 18000, 'quit timer');
  h.game.cancelQuit(); h.game.press(pointer(1)); for (let i = 0; i < 60; i++) h.game.advanceFrame(1 / 60);
  near(h.snapshot().remaining, 17000, 'aim timer'); near(h.snapshot().planets[0].orbitMotion.angle, .5 * .18, 'aim orbital speed');
  h.document.hidden = true; h.document.handlers.visibilitychange(); assert.equal(h.frames.size, 0);
  h.game.resumeRun(); assert.equal(h.snapshot().state, 'suspended'); h.document.hidden = false; h.document.handlers.visibilitychange(); h.tick();
  assert.equal(h.snapshot().state, 'suspended');
});
test('ad failure copy separates unavailable, failed and interrupted ads', () => {
  const { game } = harness(); assert.match(game.rewardFailure({ shown: false, error: 'not-loaded' }), /indisponível/);
  assert.match(game.rewardFailure({ shown: false }), /indisponível/); assert.match(game.rewardFailure({ unavailable: true }), /Android/);
  assert.match(game.rewardFailure({ shown: true, rewarded: false }), /encerrado sem recompensa/);
});

test('120 Hz finger movement cannot bypass the preview computation budget', () => {
  const h = harness(); h.game.fixture({ ship: { mode: 'orbit' } }); h.game.press(pointer(1));
  h.game.drawPrediction(); let stamp = h.game.predictionStamp(), changes = 0;
  for (let i = 0; i < 120; i++) {
    h.tick(1000 / 120); h.game.aim(pointer(1, 220 + Math.sin(i) * 30, 600 + Math.cos(i) * 20));
    h.game.drawPrediction(); const next = h.game.predictionStamp();
    if (next !== stamp) changes++;
    stamp = next;
  }
  assert.ok(changes >= 16 && changes <= 20, `expected at most 20 previews, got ${changes}`);
  const latestAngle = h.snapshot().ship.aimAngle;
  h.game.release(pointer(1));
  near(Math.atan2(h.snapshot().ship.vy, h.snapshot().ship.vx), latestAngle, 'launch uses latest input, not cached preview');
});

test('planet gradients are reused while dynamic planet position changes', () => {
  const h = harness();
  const p = { x: 180, y: 300, r: 28, color: '#7c5cff', style: 0, seed: 1, pulse: 0 };
  h.game.drawPlanet(p); const count = h.metrics.gradients, sprite = h.game.planetBody(p);
  p.x += 20; p.pulse += .5; h.game.drawPlanet(p);
  assert.equal(h.metrics.gradients, count, 'moving and pulsing must not recreate static body or halo gradients');
  assert.equal(h.game.planetBody(p), sprite);
  const next = { ...p, r: 27.5, seed: 99 };
  assert.equal(h.game.planetBody(next), sprite, 'new sectors reuse a matching body texture');
  assert.equal(h.metrics.gradients, count, 'new planet object must not force a new gradient');
});

test('star tile is cached while parallax moves immediately without repainting the background', () => {
  const h = harness({ captureImages: true }); h.game.drawBackground(0); const arcs = h.metrics.arcs;
  const stationaryTile = h.metrics.imageCalls.at(-1);
  h.game.drawBackground(20);
  assert.equal(h.metrics.arcs, arcs, 'stars must reuse the cached background inside the balanced profile interval');
  assert.equal(h.metrics.imageCalls.at(-1)[0], stationaryTile[0], 'one star canvas is reused');
  h.game.drawBackground(75); assert.ok(h.metrics.arcs > arcs);
  const refreshed = h.metrics.arcs, gradients = h.metrics.gradients;
  h.metrics.imageCalls.length = 0;
  h.game.setCamera(10); h.game.drawBackground(76);
  assert.equal(h.metrics.arcs, refreshed, 'moving camera must not redraw any star geometry');
  assert.equal(h.metrics.gradients, gradients, 'moving camera must not rebuild the base gradient');
  const tiles = h.metrics.imageCalls.filter(args => args.length === 9);
  assert.equal(tiles.length, 2, 'periodic star tile is composed as two non-overlapping slices');
  assert.equal(tiles[0][0], stationaryTile[0]); assert.equal(tiles[1][0], stationaryTile[0]);
  near(tiles[0][2], 1.2, 'source parallax offset');
  near(tiles[0][8] + tiles[1][8], h.size.height, 'slices cover the viewport exactly once');
  near(tiles[1][6], tiles[0][8], 'slices meet without a vertical gap');
  h.metrics.imageCalls.length = 0;
  h.game.setCamera(-10); h.game.drawBackground(77);
  assert.equal(h.metrics.arcs, refreshed, 'reverse camera movement still reuses geometry');
  const reversed = h.metrics.imageCalls.filter(args => args.length === 9);
  near(reversed[0][2], h.size.height - 1.2, 'negative parallax wraps inside the tile');
});

test('offscreen drawing is culled without removing gravitational influence', () => {
  const h = harness();
  const p = { x: -150, y: 300, r: 20, color: '#7c5cff', style: 0, seed: 1, pulse: 0 };
  h.game.fixture({ planets: [p] }); const images = h.metrics.images, gradients = h.metrics.gradients;
  h.game.drawPlanet(p);
  assert.equal(h.metrics.images, images); assert.equal(h.metrics.gradients, gradients);
  const body = { x: 10, y: 300, vx: 0, vy: 0 }; h.game.advanceFlight(body, h.game.STEP);
  assert.ok(body.vx < 0, 'culled planet remains part of the physical simulation');
});

test('cached visual trajectory keeps the collision endpoint and reuses path geometry', () => {
  const h = harness({ path2D: true }); h.game.fixture({ ship: { mode: 'orbit' } });
  const preview = h.game.tracePrediction(), path = preview.path;
  assert.ok(path.points.length <= 47, 'visual path must not submit all 184 simulation points');
  const last = path.points[path.points.length - 1], pointIndex = (preview.count - 1) * 2;
  near(last[0], preview.points[pointIndex], 'trajectory endpoint x');
  near(last[1], preview.points[pointIndex + 1], 'trajectory endpoint y');
  h.game.drawPrediction(); h.tick(20); h.game.drawPrediction();
  assert.equal(preview.path, path, 'geometry is reused between solves');
});
}

module.exports = { harness, near, pointer };
