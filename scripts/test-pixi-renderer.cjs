// Lifecycle and pooling proof for the optional PixiJS 8 prototype, without GPU claims.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../dist/pixi-renderer.js'), 'utf8');

function harness({ failInit = false } = {}) {
  const metrics = { apps: [], sprites: 0, textures: 0, textureDestroys: 0, renders: 0, canvases: 0 };
  class Point { set(x, y = x) { this.x = x; this.y = y; } }
  class Container {
    constructor() { this.children = []; this.position = new Point(); this.scale = new Point(); this.visible = true; }
    addChild(...children) { for (const child of children) { child.removeFromParent?.(); this.children.push(child); child.parent = this; } return children[0]; }
    setChildIndex(child, index) { const previous = this.children.indexOf(child); if (previous < 0) throw new Error('Unknown child'); this.children.splice(previous, 1); this.children.splice(index, 0, child); }
    removeFromParent() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } }
    destroy(options) { this.destroyed = true; if (options?.children) for (const child of [...this.children]) child.destroy?.(options); this.removeFromParent(); }
  }
  class Sprite extends Container { constructor() { super(); this.anchor = new Point(); metrics.sprites++; } }
  class Graphics extends Container {}
  for (const name of ['clear', 'circle', 'fill', 'stroke', 'moveTo', 'lineTo', 'closePath', 'arc', 'ellipse', 'quadraticCurveTo', 'roundRect', 'rect', 'save', 'restore', 'translateTransform', 'rotateTransform']) Graphics.prototype[name] = function () { return this; };
  class CanvasSource { constructor(options) { assert.equal(options.resolution, 1, 'CanvasSource requires explicit texture resolution'); Object.assign(this, options); } }
  class Texture {
    constructor(options) { this.source = options.source; metrics.textures++; }
    static from(resource) { return new Texture({ source: new CanvasSource({ resource, resolution: 1 }) }); }
    destroy() { assert.equal(this.destroyed, undefined, 'texture destroyed twice'); this.destroyed = true; metrics.textureDestroys++; }
  }
  class Application {
    constructor() { this.stage = new Container(); metrics.apps.push(this); this.renderer = { resize: (...args) => { this.resized = args; } }; }
    async init(options) { this.options = options; this.canvas = options.canvas; if (failInit) throw new Error('WebGL unavailable'); }
    stop() { this.stopped = true; }
    render() { metrics.renders++; }
    destroy(_, options) { this.destroyed = true; this.stage.destroy(options); this.canvas?.remove(); }
  }
  const ctx = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (/Gradient$/.test(key)) return () => ({ addColorStop() {} });
    return () => {};
  } });
  const document = { createElement(tag) {
    assert.equal(tag, 'canvas'); metrics.canvases++;
    return { width: 0, height: 0, style: {}, listeners: {},
      setAttribute() {}, getContext() { return ctx; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      removeEventListener(name, fn) { if (this.listeners[name] === fn) delete this.listeners[name]; },
      remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
    };
  } };
  const host = { children: [], appendChild(child) { child.parentNode = this; this.children.push(child); } };
  const window = { PIXI: { Application, Container, Sprite, Graphics, Texture, CanvasSource } };
  vm.runInNewContext(source, { window, document });
  return { api: window.OrbitaPixiRenderer, host, metrics, document };
}

function scene() {
  const colors = ['#7c5cff', '#28c8d6', '#ff6b9d', '#ff9b54', '#62d391', '#c777ff'];
  const planets = Array.from({ length: 7 }, (_, i) => ({ x: 50 + i * 80, y: 100 + i % 2 * 70,
    r: 18, color: colors[i % colors.length], pulse: .4, seed: i * 3, style: i, target: i % 2 === 0 }));
  planets.push({ x: 150, y: 250, r: 15, color: '#9b63ff', pulse: .3, seed: 100, hazard: true, hazardType: 'blackHole' });
  planets.push({ x: 450, y: 250, r: 15, color: '#6ee7ff', pulse: .2, seed: 117, hazard: true, hazardType: 'pulsar' });
  const points = new Float64Array(184 * 2);
  for (let i = 0; i < 184; i++) { points[i * 2] = 300 + i * .5; points[i * 2 + 1] = 300 - i * .6; }
  return { W: 640, H: 480, cameraY: 0, state: 'playing', stars: Array.from({ length: 30 }, (_, i) => ({ x: i * 19, y: i * 13, r: 1, a: .5, p: i })),
    nebulae: [{ x: 150, y: 200, r: 110, color: '#713cff', drift: .012 }],
    comets: [{ x: 80, y: 50, vx: 100, vy: 40, life: 0 }, { x: 80, y: 50, vx: 100, vy: 40, life: 3 }], planets,
    asteroids: [{ x: 100, y: 300, r: 9, seed: 3, rotation: .2 }],
    collectibles: [{ x: 250, y: 300, r: 7, pulse: .4, collected: false }],
    phenomena: ['nebula', 'shieldOrb', 'boostGate', 'phaseOrb', 'starCache', 'gravityRift', 'solarWind', 'mine'].map((type, i) => ({ type, x: 35 + i * 80, y: 400, r: type === 'nebula' ? 30 : 12, pulse: .2, direction: -1, used: false })),
    particles: Array.from({ length: 25 }, (_, i) => ({ x: 200 + i, y: 320, r: 2, color: '#ffcf5c', life: .5, max: 1 })),
    trail: Array.from({ length: 8 }, (_, i) => ({ x: 290 + i, y: 300, life: .8 })),
    ship: { x: 300, y: 300, mode: 'orbit', aimAngle: -Math.PI / 2, vx: 0, vy: -300 },
    holding: true, charge: .6, phaseCharges: 1, skinColor: '#f7f8ff', trailColor: '#6ee7ff',
    prediction: { points, count: 184, outcome: 'safe', stamp: 100 }, quality: { glowScale: 1, starScale: 1 }
  };
}

async function main() {
  const h = harness(), errors = [];
  const renderer = await h.api.create({ host: h.host, width: 640, height: 480, resolution: 1.25, onError: error => errors.push(error) });
  assert.equal(h.metrics.apps[0].options.preference, 'webgl'); assert.equal(h.metrics.apps[0].options.autoStart, false);
  assert.equal(h.metrics.apps[0].stopped, true); assert.equal(h.host.children.length, 1);
  assert.equal(renderer.canvas.style.pointerEvents, 'none');
  const model = scene(), before = JSON.stringify(model);
  assert.equal(renderer.render(model, 1000), true); assert.equal(JSON.stringify(model), before, 'render cannot modify game state');
  const count = renderer.debugStats(), sprites = h.metrics.sprites, textures = h.metrics.textures;
  for (let i = 0; i < 200; i++) assert.equal(renderer.render(model, 1000 + i * 17), true);
  assert.equal(h.metrics.sprites, sprites, 'steady scene must reuse sprites');
  assert.equal(h.metrics.textures, textures, 'steady scene must reuse textures');
  assert.equal(renderer.debugStats().entities, count.entities);
  console.log('PASS: Pixi manual loop, complete scene, state isolation and steady resource reuse');

  for (let i = 0; i < 30; i++) {
    const width = i % 2 ? 640 : 800, height = i % 2 ? 480 : 600;
    renderer.resize({ width, height, resolution: 1 }); model.W = width; model.H = height;
    renderer.render(model, 5000 + i * 17);
  }
  assert.ok(renderer.debugStats().textures <= count.textures + 1, 'resize must release old fullscreen textures');
  assert.deepEqual(h.metrics.apps[0].resized, [640, 480, 1]);
  console.log('PASS: Pixi resize releases previous fullscreen texture');

  model.ship.mode = 'flight'; model.holding = false;
  for (let i = 0; i < 180; i++) {
    model.asteroids = [{ x: 100, y: 300, r: 9, seed: i + 20, rotation: .2 }];
    renderer.render(model, 6000 + i * 17);
  }
  const longStats = renderer.debugStats();
  assert.ok(longStats.textures <= 128, 'old entity textures must be evicted');
  assert.ok(longStats.assets <= 96, 'generated canvas cache must remain bounded');
  assert.ok(longStats.pooledEntities <= 2, 'sector changes must reuse released entity containers');
  assert.equal(errors.length, 0);
  console.log('PASS: Pixi sector churn keeps texture and entity caches bounded');

  let prevented = 0;
  renderer.canvas.listeners.webglcontextlost({ preventDefault() { prevented++; } });
  assert.equal(prevented, 1); assert.equal(errors.length, 1); assert.equal(errors[0].name, 'WebGLContextLostError');
  assert.equal(renderer.render(model, 10000), false); assert.equal(renderer.canvas.style.display, 'none');
  renderer.destroy(); renderer.destroy();
  assert.equal(h.host.children.length, 0); assert.equal(renderer.debugStats().textures, 0);
  assert.equal(h.metrics.textures, h.metrics.textureDestroys, 'all owned GPU textures must be destroyed');
  console.log('PASS: context loss requests fallback; destroy releases resources once');

  const unavailable = harness({ failInit: true });
  await assert.rejects(unavailable.api.create({ host: unavailable.host, width: 640, height: 480, resolution: 1 }), /WebGL unavailable/);
  assert.equal(unavailable.host.children.length, 0);
  console.log('PASS: unavailable WebGL rejects without replacing Canvas');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
