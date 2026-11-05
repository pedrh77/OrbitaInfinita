/* Interpolated read-only facades. Simulation objects are never changed by rendering. */
(function (root) {
  'use strict';
  const ARRAYS = ['planets', 'asteroids', 'collectibles', 'phenomena', 'particles', 'comets'];
  const KEYS = ['x', 'y', 'rotation', 'pulse'];
  class Presentation {
    constructor() { this.output = {}; this.arrays = {}; this.reset(); }
    reset() { this.history = new WeakMap(); this.views = new WeakMap(); this.previousCamera = null; }
    forget(entity) { this.history.delete(entity); }
    captureEntity(entity) {
      if (!entity) return;
      let previous = this.history.get(entity);
      if (!previous) { previous = {}; this.history.set(entity, previous); }
      previous.x = entity.x; previous.y = entity.y; previous.rotation = entity.rotation;
      previous.pulse = entity.pulse; previous.mode = entity.mode;
    }
    capture(scene) {
      this.captureEntity(scene.ship);
      for (const name of ARRAYS) for (const entity of scene[name] || []) this.captureEntity(entity);
      this.previousCamera = scene.cameraY;
    }
    entity(entity, alpha, W, H) {
      if (!entity) return entity;
      let view = this.views.get(entity);
      if (!view) { view = Object.create(entity); this.views.set(entity, view); }
      const previous = this.history.get(entity);
      const continuous = previous && previous.mode === entity.mode && entity.mode !== 'orbit'
        && Math.abs(entity.x - previous.x) < W * .5 && Math.abs(entity.y - previous.y) < H * .5;
      for (const key of KEYS) {
        view[key] = continuous && Number.isFinite(previous[key]) && Number.isFinite(entity[key])
          ? previous[key] + (entity[key] - previous[key]) * alpha : entity[key];
      }
      return view;
    }
    snapshot(scene, alpha) {
      Object.assign(this.output, scene);
      const W = scene.W || 1, H = scene.H || 1;
      alpha = Math.max(0, Math.min(1, alpha));
      this.output.ship = this.entity(scene.ship, alpha, W, H);
      for (const name of ARRAYS) {
        const source = scene[name] || [], target = this.arrays[name] || (this.arrays[name] = []);
        for (let i = 0; i < source.length; i++) target[i] = this.entity(source[i], alpha, W, H);
        target.length = source.length; this.output[name] = target;
      }
      const previous = this.previousCamera;
      this.output.cameraY = previous !== null && Math.abs(scene.cameraY - previous) < H * .5
        ? previous + (scene.cameraY - previous) * alpha : scene.cameraY;
      return this.output;
    }
  }
  root.OrbitaPresentation = Presentation;
  if (typeof module !== 'undefined' && module.exports) module.exports = Presentation;
})(typeof window !== 'undefined' ? window : globalThis);
