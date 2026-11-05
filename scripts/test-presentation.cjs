// The presentation facade may change visual positions, never simulation state.
const assert = require('node:assert/strict');
const Presentation = require('../dist/presentation.js');

function test(name, run) { run(); console.log(`PASS: ${name}`); }
function near(actual, expected, message, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
}
function scene() {
  return { W: 1000, H: 1000, cameraY: 0, state: 'playing',
    ship: { x: 100, y: 500, vx: 20, vy: -10, mode: 'flight', aimAngle: 1 },
    planets: [{ x: 300, y: 300, pulse: 0, r: 20, color: '#6ee7ff' }],
    asteroids: [], collectibles: [], phenomena: [], particles: [], comets: [] };
}

test('interpolated flight is uniform at 30/60/90/120 Hz without changing physics', () => {
  const step = 1 / 120;
  for (const fps of [30, 60, 90, 120]) {
    const presentation = new Presentation(), model = scene();
    let accumulator = 0, simulationTime = 0, lastVisual;
    for (let frame = 1; frame <= fps * 2; frame++) {
      accumulator += 1 / fps;
      while (accumulator + 1e-10 >= step) {
        presentation.capture(model);
        model.ship.x += model.ship.vx * step; model.ship.y += model.ship.vy * step;
        model.planets[0].x += 10 * step; model.cameraY += 5 * step;
        simulationTime += step; accumulator = Math.max(0, accumulator - step);
      }
      const physicalBefore = JSON.stringify(model);
      const view = presentation.snapshot(model, accumulator / step);
      const elapsed = frame / fps;
      near(view.ship.x, 100 + 20 * (elapsed - step), `${fps} Hz visual x`);
      near(view.ship.y, 500 - 10 * (elapsed - step), `${fps} Hz visual y`);
      near(view.planets[0].x, 300 + 10 * (elapsed - step), `${fps} Hz moving planet`);
      near(view.cameraY, 5 * (elapsed - step), `${fps} Hz camera`);
      if (lastVisual !== undefined) near(view.ship.x - lastVisual, 20 / fps, `${fps} Hz uniform displacement`);
      lastVisual = view.ship.x;
      assert.equal(JSON.stringify(model), physicalBefore, 'rendering cannot modify the physical scene');
      near(model.ship.x, 100 + 20 * simulationTime, 'physical movement remains exact');
    }
    near(model.ship.x, 140, `${fps} Hz final physical position`);
  }
});

test('facades and array identities are stable while values follow the model', () => {
  const presentation = new Presentation(), model = scene();
  presentation.capture(model); model.ship.x += 10; model.planets[0].x += 8;
  const original = JSON.stringify(model), first = presentation.snapshot(model, .25);
  const ship = first.ship, planet = first.planets[0], planets = first.planets;
  near(ship.x, 102.5, 'quarter-step ship');
  const second = presentation.snapshot(model, .75);
  assert.equal(first, second); assert.equal(second.ship, ship); assert.equal(second.planets, planets); assert.equal(second.planets[0], planet);
  near(ship.x, 107.5, 'three-quarter-step ship');
  assert.equal(ship.aimAngle, model.ship.aimAngle); assert.equal(planet.color, '#6ee7ff');
  assert.equal(JSON.stringify(model), original);
  ship.x = 999; assert.equal(model.ship.x, 110, 'writing an own facade position cannot alter simulation');
});

test('new entities, orbit, mode transitions and teleports use current coordinates', () => {
  const presentation = new Presentation(), model = scene();
  let view = presentation.snapshot(model, 0); assert.equal(view.ship.x, model.ship.x, 'new entity');
  model.ship.mode = 'orbit'; presentation.capture(model); model.ship.x += 20;
  view = presentation.snapshot(model, 0); assert.equal(view.ship.x, model.ship.x, 'orbit cannot lag its planet');
  presentation.capture(model); model.ship.mode = 'flight'; model.ship.x += 10;
  view = presentation.snapshot(model, .5); assert.equal(view.ship.x, model.ship.x, 'mode transition');
  presentation.capture(model); model.ship.x += 600; model.ship.y -= 600;
  view = presentation.snapshot(model, .5); assert.equal(view.ship.x, model.ship.x); assert.equal(view.ship.y, model.ship.y);
  model.cameraY = 0; presentation.capture(model); model.cameraY = 700;
  view = presentation.snapshot(model, .5); assert.equal(view.cameraY, 700, 'camera teleport must not sweep old space');
});

test('alpha is bounded and reset cannot interpolate against a previous run', () => {
  const presentation = new Presentation(), model = scene();
  presentation.capture(model); model.ship.x += 10;
  assert.equal(presentation.snapshot(model, -5).ship.x, 100);
  assert.equal(presentation.snapshot(model, 5).ship.x, 110);
  const oldFacade = presentation.snapshot(model, .5).ship;
  presentation.reset(); const fresh = presentation.snapshot(model, 0).ship;
  assert.notEqual(fresh, oldFacade); assert.equal(fresh.x, 110);
});

test('repeated entity removal truncates presentation arrays without retaining old entries', () => {
  const presentation = new Presentation(), model = scene();
  for (let pass = 0; pass < 100; pass++) {
    const count = 1 + pass % 20;
    model.particles = Array.from({ length: count }, (_, i) => ({ x: i, y: 10, life: 1 }));
    presentation.capture(model); const populated = presentation.snapshot(model, .5);
    assert.equal(populated.particles.length, count);
    const facade = populated.particles;
    model.particles = []; const empty = presentation.snapshot(model, .5);
    assert.equal(empty.particles, facade); assert.equal(empty.particles.length, 0);
    assert.equal(Object.keys(empty.particles).length, 0, 'removed entries must not remain in the reused array');
  }
});
