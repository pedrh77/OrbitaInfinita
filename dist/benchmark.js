/* Deterministic benchmark orchestration. The host owns physics, rendering and save isolation. */
(function (root) {
  'use strict';
  const SUITE = Object.freeze(['menu', 'start', 'aim', 'flight', 'stress', 'particles']);
  const SCENARIOS = new Set([...SUITE, 'long', 'suite']);

  class OrbitaBenchmarkRunner {
    constructor({ api, recorder, now = () => performance.now(), emit = () => {}, overlay = () => {} }) {
      if (!api || !recorder) throw new TypeError('Benchmark requires an API and a recorder.');
      this.api = api; this.recorder = recorder; this.now = now; this.emit = emit; this.overlay = overlay;
      this.running = false; this.reports = []; this.generation = 0; this.saved = null; this.hasSaved = false;
      this.queue = []; this.index = 0; this._transitioning = false;
      this._starting = false; this._restoration = Promise.resolve();
    }

    async start(options = {}) {
      // Keep a single owner of the captured save while a renderer is initializing.
      if (this._starting) return false;
      this._starting = true;
      let token;
      const scenario = options.scenario || 'menu';
      const renderer = options.renderer || 'canvas', quality = options.quality || 'balanced';
      const seconds = options.seconds == null ? (scenario === 'long' ? 120 : 20) : Number(options.seconds);
      const seed = options.seed == null ? 12345 : Number(options.seed);
      try {
        const stopped = this.stop('replaced');
        token = this.generation;
        await stopped;
        if (token !== this.generation) return false;
        if (!SCENARIOS.has(scenario)) throw new RangeError(`Unknown benchmark scenario: ${scenario}`);
        if (!['canvas', 'pixi'].includes(renderer)) throw new RangeError(`Unknown benchmark renderer: ${renderer}`);
        if (!['high', 'balanced', 'eco'].includes(quality)) throw new RangeError(`Unknown benchmark quality: ${quality}`);
        if (!Number.isFinite(seconds) || seconds < 5 || seconds > 180) throw new RangeError('Benchmark duration must be between 5 and 180 seconds.');
        if (!Number.isSafeInteger(seed)) throw new RangeError('Benchmark seed must be a safe integer.');
        this.options = { scenario, renderer, quality, seconds, seed };
        this.saved = this.api.capture(); this.hasSaved = true; this.running = true;
        const restoreRenderer = this.saved?.renderer || 'canvas';
        this.reports = []; this.queue = scenario === 'suite' ? SUITE.slice() : [scenario]; this.index = 0;
        this.overlay({ running: true, initializing: true, scenario, renderer, quality });
        this.api.pause?.();
        const actual = await this.api.setRenderer(renderer);
        if (token !== this.generation) {
          // A cancelled initialization may have completed after restoration.
          if (!this.running) await this.api.setRenderer(restoreRenderer);
          return false;
        }
        if (actual !== true && actual !== renderer) {
          throw new Error(`Requested ${renderer}; renderer initialization returned ${String(actual)}.`);
        }
        this.api.setQuality(quality);
        this.emit({ type: 'benchmark-start', ...this.options, startedAt: this.now() });
        this._enterScene();
        return true;
      } catch (error) {
        if (token !== this.generation) return false;
        this.emit({ type: 'benchmark-error', scenario, renderer, quality, message: String(error?.message || error) });
        await this.stop('error');
        return false;
      } finally {
        this._starting = false;
      }
    }

    _enterScene() {
      this.scenario = this.queue[this.index]; this.sceneTime = 0; this.phaseTime = 0;
      this.runIndex = 0; this.burstCount = 0; this.phaseIndex = 0;
      this._setFixture(this.scenario === 'long' ? 'aim' : this.scenario);
      this.recorder.start({ scenario: this.scenario, renderer: this.options.renderer,
        profile: this.options.quality, warmupMs: 3000, windowMs: 5000,
        durationMs: this.options.seconds * 1000 });
      this._lastReport = this.recorder.latest;
      const info = { running: true, scenario: this.scenario, renderer: this.options.renderer,
        quality: this.options.quality, seed: this.options.seed, index: this.index + 1, count: this.queue.length };
      this.overlay(info); this.emit({ type: 'benchmark-scene', ...info });
    }

    _setFixture(kind) {
      this.kind = kind; this.phaseTime = 0; this.burstCount = 0;
      const level = kind === 'stress' ? 25 : kind === 'particles' ? 15 : 0;
      this.api.reset({ seed: this.options.seed + this.index * 1000 + this.runIndex,
        level, mode: kind === 'menu' ? 'menu' : 'orbit' });
      if (kind === 'flight') this.api.launch();
      if (kind === 'aim' || kind === 'stress') this.api.aim(-Math.PI / 2, .55);
      if (kind === 'particles') this.api.burst(80);
    }

    step(dt) {
      if (!this.running || this._transitioning || !this.recorder.active || !Number.isFinite(dt) || dt <= 0) return;
      this.sceneTime += dt; this.phaseTime += dt;
      if (this.scenario === 'long') {
        const index = Math.floor((this.sceneTime + 1e-9) / 20);
        if (index !== this.phaseIndex) {
          this.phaseIndex = index; this.runIndex++;
          this._setFixture(['aim', 'flight', 'stress'][index % 3]);
        }
      }
      if (this.kind === 'aim' || this.kind === 'stress') {
        this.api.aim(-Math.PI / 2 + Math.sin(this.phaseTime * .9) * .48,
          .55 + Math.sin(this.phaseTime * 1.3) * .28);
      } else if (this.kind === 'flight') {
        const state = this.api.state();
        if (state.state === 'over' || state.mode === 'over') {
          this.runIndex++; this._setFixture('flight');
        }
      } else if (this.kind === 'particles') {
        const count = Math.floor((this.phaseTime + 1e-9) / .5);
        if (count > this.burstCount) { this.burstCount = count; this.api.burst(60); }
      }
    }

    afterFrame() {
      if (!this.running || this._transitioning) return;
      if (this.recorder.latest && this.recorder.latest !== this._lastReport) {
        this._lastReport = this.recorder.latest;
        this.reports.push(this.recorder.latest);
        if (this.reports.length > 256) this.reports.shift();
      }
      if (this.recorder.active) return;
      this._transitioning = true;
      try {
        if (++this.index < this.queue.length) this._enterScene();
        else {
          // Synchronous host restoration happens immediately; asynchronous renderer cleanup is caught.
          this.stop('complete').catch(error => this.emit({ type: 'benchmark-error', message: String(error?.message || error) }));
        }
      } catch (error) {
        this.emit({ type: 'benchmark-error', message: String(error?.message || error) });
        this.stop('error').catch(() => {});
      } finally { this._transitioning = false; }
    }

    stop(reason = 'cancelled') {
      ++this.generation;
      const wasRunning = this.running || this.hasSaved;
      this.running = false; this.recorder.active = false; this._transitioning = false;
      if (!wasRunning) return this._restoration;
      const saved = this.saved;
      this.hasSaved = false; this.saved = null;
      try { this.api.pause?.(); }
      catch (error) { this.emit({ type: 'benchmark-error', message: `Pause failed: ${String(error?.message || error)}` }); }
      let restored;
      try { restored = this.api.restore(saved); }
      catch (error) { restored = Promise.reject(error); }
      this.overlay({ running: false });
      this.emit({ type: reason === 'complete' ? 'benchmark-complete' : 'benchmark-stopped',
        reason, ...this.options, reports: this.reports.length });
      this._restoration = Promise.resolve(restored).catch(error => {
        this.emit({ type: 'benchmark-error', message: `Restore failed: ${String(error?.message || error)}` });
        throw error;
      });
      return this._restoration;
    }
  }

  root.OrbitaBenchmarkRunner = OrbitaBenchmarkRunner;
  if (typeof module !== 'undefined' && module.exports) module.exports = OrbitaBenchmarkRunner;
})(typeof window !== 'undefined' ? window : globalThis);
