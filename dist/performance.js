/* Performance policy and measurements have no dependency on game physics. */
(function (root) {
  'use strict';
  const PROFILES = Object.freeze({
    high: Object.freeze({ label: 'Alta', pixels: 2200000, maxDpr: 2, particleScale: 1, glowScale: 1, starScale: 1, backgroundInterval: 50 }),
    balanced: Object.freeze({ label: 'Balanceada', pixels: 1200000, maxDpr: 1.5, particleScale: .85, glowScale: .9, starScale: .85, backgroundInterval: 66 }),
    eco: Object.freeze({ label: 'Econômica', pixels: 650000, maxDpr: 1, particleScale: .55, glowScale: .65, starScale: .55, backgroundInterval: 100 })
  });
  const ORDER = ['eco', 'balanced', 'high'], KEY = 'orbita-infinita-performance-v1';
  const validProfile = name => Object.prototype.hasOwnProperty.call(PROFILES, name);

  class Quality {
    constructor({ storage, onChange = () => {}, now = () => performance.now() } = {}) {
      this.storage = storage; this.onChange = onChange; this.now = now;
      this.choice = 'auto'; this.resolved = 'balanced'; this.cap30 = false;
      try {
        const saved = JSON.parse(storage?.getItem(KEY) || '{}');
        if (saved.choice === 'auto' || validProfile(saved.choice)) this.choice = saved.choice;
        this.cap30 = saved.cap30 === true;
      } catch {}
      if (this.choice !== 'auto') this.resolved = this.choice;
      this.lastChange = -Infinity; this.nextUpgradeAfter = this.now() + 20000; this.reset();
    }
    get profile() { return PROFILES[this.resolved]; }
    get targetFPS() { return this.resolved === 'eco' && this.cap30 ? 30 : 60; }
    reset() { this.average = 16.67; this.bad = this.good = 0; this.warmUntil = this.now() + 3000; }
    select(choice, cap30 = this.cap30, persist = true) {
      if (choice !== 'auto' && !validProfile(choice)) return;
      this.choice = choice; this.cap30 = !!cap30;
      this.resolved = choice === 'auto' ? 'balanced' : choice;
      this.lastChange = this.now(); this.reset();
      if (persist) { try { this.storage?.setItem(KEY, JSON.stringify({ choice, cap30: this.cap30 })); } catch {} }
      this.onChange(this);
    }
    observe(intervalMs) {
      const now = this.now();
      if (this.choice !== 'auto' || now < this.warmUntil || intervalMs <= 0 || intervalMs > 250) return;
      const ms = Math.min(intervalMs, 100);
      this.average += (ms - this.average) * .04;
      this.bad = this.average > 19.5 ? this.bad + ms : Math.max(0, this.bad - ms * 2);
      // 30 FPS is an explicit power preference, not evidence that quality can increase.
      this.good = this.average < 17.8 && this.targetFPS === 60 ? this.good + ms : 0;
      const index = ORDER.indexOf(this.resolved);
      const down = this.bad >= 3000 && now - this.lastChange >= 8000 && index > 0;
      const up = this.good >= 15000 && now - this.lastChange >= 20000 && now >= this.nextUpgradeAfter && index < ORDER.length - 1;
      if (!down && !up) return;
      this.resolved = ORDER[index + (down ? -1 : 1)]; this.lastChange = now;
      if (down) this.nextUpgradeAfter = now + 60000;
      this.reset(); this.onChange(this);
    }
  }

  const percentile = (values, ratio) => {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
  };
  const rounded = n => Math.round(n * 100) / 100;
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  class Recorder {
    constructor({ emit = () => {}, now = () => performance.now(), memory = () => performance.memory } = {}) {
      this.emit = emit; this.now = now; this.memory = memory; this.active = false;
      this.overlay = false; this.latest = null;
    }
    start({ scenario = 'manual', renderer = 'canvas', profile = 'balanced', warmupMs = 3000, windowMs = 5000, durationMs = 30000 } = {}) {
      this.options = { scenario, renderer, profile, warmupMs, windowMs, durationMs };
      this.active = true; this.elapsed = 0; this.warmLeft = warmupMs; this.reset();
    }
    reset() {
      this.windowElapsed = 0; this.raf = 0; this.state = null;
      this.intervals = []; this.updates = []; this.preparations = []; this.predictions = [];
      this.presentElapsed = 0; this.events = 0; this.lastHeap = null;
    }
    suspend() { this.reset(); }
    prediction(ms) { if (this.active && this.warmLeft <= 0) this.predictions.push(ms); }
    frame({ elapsedMs, updateMs = 0, renderMs = 0, presented = true, state, counters = {} }) {
      if (!this.active || elapsedMs <= 0 || !Number.isFinite(elapsedMs)) return;
      if (this.warmLeft > 0) { this.warmLeft -= elapsedMs; return; }
      this.elapsed += elapsedMs; this.windowElapsed += elapsedMs; this.presentElapsed += elapsedMs; this.raf++;
      if (this.state && this.state !== state) this.events++;
      this.state = state; this.updates.push(updateMs);
      if (presented) { this.intervals.push(this.presentElapsed); this.presentElapsed = 0; this.preparations.push(renderMs); }
      if (this.windowElapsed < this.options.windowMs && this.elapsed < this.options.durationMs) return;
      const frames = this.intervals.length, worst = Math.max(0, ...this.intervals);
      let heap = null;
      try {
        const mem = this.memory();
        if (mem && Number.isFinite(mem.usedJSHeapSize)) heap = { used: mem.usedJSHeapSize, total: mem.totalJSHeapSize, limit: mem.jsHeapSizeLimit };
      } catch {}
      this.latest = { ...this.options, state, frames, rafFrames: this.raf, sampleMs: rounded(this.windowElapsed),
        fps: rounded(frames * 1000 / this.windowElapsed), minFPS: worst ? rounded(1000 / worst) : 0,
        frameP50: rounded(percentile(this.intervals, .5)), frameP95: rounded(percentile(this.intervals, .95)),
        frameP99: rounded(percentile(this.intervals, .99)), maxFrameMs: rounded(worst),
        over33ms: this.intervals.filter(ms => ms > 33.5).length,
        updateMean: rounded(average(this.updates)), updateP95: rounded(percentile(this.updates, .95)),
        predictionMean: rounded(average(this.predictions)), predictionP95: rounded(percentile(this.predictions, .95)),
        predictionSolves: this.predictions.length, renderPrepMean: rounded(average(this.preparations)),
        renderPrepP95: rounded(percentile(this.preparations, .95)), stateChanges: this.events,
        jsHeap: heap, jsGCCount: null, counters };
      this.emit(this.latest);
      const finished = this.elapsed >= this.options.durationMs;
      this.reset(); if (finished) this.active = false;
    }
  }
  const api = { PROFILES, Quality, Recorder, percentile };
  root.OrbitaPerformance = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
