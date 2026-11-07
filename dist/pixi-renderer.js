/* PixiJS 8 WebGL renderer. Physics, input, persistence and Canvas fallback stay in game.js. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const tint = (hex, amount) => {
    const value = parseInt(String(hex).replace('#', ''), 16);
    return `rgb(${clamp((value >> 16) + amount, 0, 255)},${clamp(((value >> 8) & 255) + amount, 0, 255)},${clamp((value & 255) + amount, 0, 255)})`;
  };

  async function create(options) {
    const P = window.PIXI;
    if (!P?.Application || !P?.Sprite || !P?.Graphics) throw new Error('PixiJS 8 is not loaded');
    const host = options.host;
    if (!host?.appendChild) throw new Error('Pixi renderer requires a host element');
    let width = Math.max(1, options.width), height = Math.max(1, options.height);
    let resolution = options.resolution || 1, frame = 0, destroyed = false, failed = false;
    const canvas = document.createElement('canvas');
    canvas.id = 'orbita-pixi';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '0' });
    const app = new P.Application();
    try {
      await app.init({ canvas, width, height, resolution, autoDensity: true, autoStart: false, sharedTicker: false,
        preference: 'webgl', antialias: true, background: '#07091a', backgroundAlpha: 1,
        powerPreference: 'high-performance', hello: false });
      app.stop?.();
      host.appendChild(canvas);
    } catch (error) {
      try { app.destroy(true, { children: true }); } catch {}
      canvas.remove?.();
      throw error;
    }

    const root = new P.Container(); root.eventMode = 'none'; root.interactiveChildren = false;
    const world = new P.Container();
    const layer = {};
    for (const name of ['background', 'comets', 'nebula', 'planets', 'asteroids', 'collectibles', 'phenomena', 'particles', 'trail', 'ship', 'prediction', 'ui']) {
      layer[name] = new P.Container(); layer[name].label = name;
      if (name === 'background' || name === 'comets') root.addChild(layer[name]);
      else if (name === 'ui') continue;
      else world.addChild(layer[name]);
    }
    root.addChild(world); root.addChild(layer.ui);
    const clip = new P.Graphics(); root.mask = clip;
    app.stage.addChild(root); app.stage.addChild(clip);
    const textures = new Map(), assets = new Map(), records = new Map(), free = new Map();
    const arrays = new Map();
    let backgroundKey = '', backgroundSprite = null, backgroundImage = null, clipWidth = 0, clipHeight = 0, forecastStamp = null, forecastStyle = '';
    const forecast = new P.Graphics(); layer.prediction.addChild(forecast);
    const charge = new P.Graphics(); layer.ui.addChild(charge);
    let current = null;

    function fail(error) {
      if (failed || destroyed) return;
      failed = true; canvas.style.display = 'none';
      if (typeof options.onError === 'function') options.onError(error);
      else throw error;
    }
    const onContextLost = event => {
      event.preventDefault?.();
      const error = new Error('WebGL context lost'); error.name = 'WebGLContextLostError'; fail(error);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    function asset(key, size, paint) {
      let value = assets.get(key);
      if (value) { assets.delete(key); assets.set(key, value); return value; }
      const image = document.createElement('canvas'); image.width = image.height = Math.max(1, Math.ceil(size));
      const ctx = image.getContext('2d');
      if (!ctx) throw new Error('Canvas texture generation unavailable');
      paint(ctx, image.width);
      if (assets.size >= 96) assets.delete(assets.keys().next().value);
      assets.set(key, image); return image;
    }

    function texture(image) {
      let entry = textures.get(image);
      if (!entry) {
        const value = P.CanvasSource ? new P.Texture({ source: new P.CanvasSource({ resource: image, resolution: 1 }) }) : P.Texture.from(image);
        entry = { texture: value, frame }; textures.set(image, entry);
      }
      entry.frame = frame;
      return entry.texture;
    }

    function pruneTextures() {
      if (textures.size <= 128) return;
      for (const [image, entry] of textures) {
        if (entry.frame >= frame - 1) continue;
        entry.texture.destroy(true); textures.delete(image);
        if (textures.size <= 128) break;
      }
    }
    function releaseTexture(image) {
      const entry = textures.get(image);
      if (entry) { entry.texture.destroy(true); textures.delete(image); }
    }

    function circleImage() {
      return asset('white-circle', 32, (ctx, size) => {
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, TAU); ctx.fill();
      });
    }

    function glowImage(radius, color, blur) {
      const core = Math.ceil(radius / 2) * 2, spread = Math.ceil(blur / 4) * 4, extent = core + spread * 2;
      return asset(`glow:${core}:${spread}:${color}`, extent * 2, (ctx, size) => {
        const solid = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
        const g = ctx.createRadialGradient(size / 2, size / 2, core * .7, size / 2, size / 2, extent);
        g.addColorStop(0, `${solid}66`); g.addColorStop(.3, `${solid}33`); g.addColorStop(1, `${solid}00`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
      });
    }

    function newSprite(parent) {
      const sprite = new P.Sprite(); sprite.anchor.set(.5); parent.addChild(sprite); return sprite;
    }
    function setSprite(sprite, image, x, y, w = image.width, h = image.height, alpha = 1, color = '#ffffff') {
      sprite.texture = texture(image); sprite.position.set(x, y); sprite.width = w; sprite.height = h;
      sprite.alpha = alpha; sprite.tint = color; sprite.visible = true; return sprite;
    }
    function setGlow(sprite, x, y, radius, color, blur = 16, strength = 1) {
      const image = glowImage(radius, color, blur);
      return setSprite(sprite, image, x, y, image.width, image.height,
        strength * (current?.quality?.glowScale ?? 1));
    }

    function pool(name, parent, index) {
      let list = arrays.get(name);
      if (!list) { list = []; arrays.set(name, list); }
      if (!list[index]) list[index] = newSprite(parent);
      return list[index];
    }
    function finishPool(name, count) {
      const list = arrays.get(name) || [];
      for (let i = count; i < list.length; i++) list[i].visible = false;
      while (list.length > count + 64) list.pop().destroy();
    }

    function record(kind, entity) {
      let item = records.get(entity);
      if (item) { item.frame = frame; return item; }
      let available = free.get(kind);
      item = available?.pop();
      if (!item) {
        const node = new P.Container();
        item = { kind, node, before: new P.Graphics(), after: new P.Graphics(), surface: new P.Graphics(),
          mask: new P.Graphics(), frame, maskRadius: NaN };
        node.addChild(item.before); item.glow = newSprite(node); item.body = newSprite(node);
        node.addChild(item.surface); node.addChild(item.mask); item.surface.mask = item.mask;
        node.addChild(item.after); item.moonGlow = newSprite(node); item.moon = newSprite(node);
      }
      item.frame = frame; item.node.visible = true;
      layer[kind].addChild(item.node); records.set(entity, item); return item;
    }
    function releaseRecords() {
      for (const [entity, item] of records) {
        if (item.frame === frame) continue;
        records.delete(entity); item.node.removeFromParent(); item.node.visible = false;
        let list = free.get(item.kind);
        if (!list) { list = []; free.set(item.kind, list); }
        if (list.length < 24) list.push(item); else item.node.destroy({ children: true });
      }
    }

    function inCamera(entity, radius, scene) {
      const y = entity.y - scene.cameraY;
      return entity.x + radius >= 0 && entity.x - radius <= scene.W && y + radius >= 0 && y - radius <= scene.H;
    }
    function stroke(graphics, color, width = 1, alpha = 1) { graphics.stroke({ color, width, alpha }); }
    function circle(graphics, x, y, radius, color, alpha = 1) { graphics.circle(x, y, radius).fill({ color, alpha }); }
    function polygon(graphics, sides, radius, turn = 0, inner = null) {
      for (let i = 0; i < sides; i++) {
        const a = turn + i * TAU / sides, r = inner && i % 2 ? inner : radius;
        if (i) graphics.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else graphics.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      graphics.closePath();
    }
    function dashedArc(graphics, radius, turn, dash = 2, gap = 7) {
      const length = TAU * radius;
      for (let distance = 0; distance < length; distance += dash + gap) {
        const start = turn + distance / radius, end = turn + Math.min(length, distance + dash) / radius;
        graphics.moveTo(Math.cos(start) * radius, Math.sin(start) * radius).arc(0, 0, radius, start, end);
      }
    }
    function ellipse(graphics, x, y, rx, ry, turn = 0) {
      if (!turn) { graphics.ellipse(x, y, rx, ry); return; }
      graphics.save().translateTransform(x, y).rotateTransform(turn).ellipse(0, 0, rx, ry).restore();
    }

    function bodyImage(planet) {
      if (options.planetBody) return options.planetBody(planet);
      const radius = Math.ceil(planet.r / 2) * 2, size = radius * 2 + 2;
      const variant = planet.hazard ? (planet.hazardType === 'pulsar' ? 'pulsar' : 'hazard') : planet.color;
      const sprite = asset(`body:${radius}:${variant}`, Math.ceil(size * 1.5), (ctx, pixels) => {
        ctx.setTransform(pixels / size, 0, 0, pixels / size, 0, 0);
        const center = size / 2, g = ctx.createRadialGradient(center - radius * .34, center - radius * .38, radius * .05, center, center, radius);
        if (planet.hazardType === 'pulsar') { g.addColorStop(0, '#ffffff'); g.addColorStop(.22, '#9cf4ff'); g.addColorStop(.62, '#256fa8'); g.addColorStop(1, '#07152d'); }
        else if (planet.hazard) { g.addColorStop(0, '#171a2f'); g.addColorStop(.75, '#03040b'); g.addColorStop(1, '#000'); }
        else { g.addColorStop(0, tint(planet.color, 62)); g.addColorStop(.44, planet.color); g.addColorStop(1, tint(planet.color, -48)); }
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(center, center, radius, 0, TAU); ctx.fill();
      });
      return { sprite, radius, size };
    }

    function drawBackground(scene, time) {
      const key = `${Math.ceil(scene.W)}:${Math.ceil(scene.H)}`;
      if (backgroundKey !== key) {
        if (backgroundSprite) { backgroundSprite.removeFromParent(); backgroundSprite.destroy(); }
        if (backgroundImage) releaseTexture(backgroundImage);
        const image = document.createElement('canvas'); image.width = Math.ceil(scene.W); image.height = Math.ceil(scene.H);
        const ctx = image.getContext('2d'), g = ctx.createRadialGradient(scene.W * .5, scene.H * .32, 0, scene.W * .5, scene.H * .35, scene.H * .9);
        g.addColorStop(0, '#171944'); g.addColorStop(.58, '#090b23'); g.addColorStop(1, '#050615');
        ctx.fillStyle = g; ctx.fillRect(0, 0, image.width, image.height);
        backgroundSprite = newSprite(layer.background); backgroundSprite.anchor.set(0);
        backgroundSprite.texture = texture(image); backgroundSprite.width = scene.W; backgroundSprite.height = scene.H;
        layer.background.setChildIndex?.(backgroundSprite, 0); backgroundKey = key; backgroundImage = image;
      } else texture(backgroundImage);
      let count = 0;
      for (const n of scene.nebulae || []) {
        const x = n.x + Math.sin(time * n.drift * .001) * 28;
        const y = ((n.y - scene.cameraY * .035) % (scene.H + n.r * 2) + scene.H + n.r * 2) % (scene.H + n.r * 2) - n.r;
        if (x + n.r < 0 || x - n.r > scene.W || y + n.r < 0 || y - n.r > scene.H) continue;
        let image = n.sprite;
        if (!image) image = asset(`nebula:${n.r}:${n.color}`, Math.ceil(n.r * 2), (ctx, size) => {
          const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
          g.addColorStop(0, `${n.color}22`); g.addColorStop(.48, `${n.color}0d`); g.addColorStop(1, `${n.color}00`);
          ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
        });
        const sprite = setSprite(pool('nebulae', layer.background, count++), image, x, y, n.r * 2, n.r * 2);
        sprite.blendMode = 'screen';
      }
      finishPool('nebulae', count);
      const stars = scene.stars || [], total = clamp(Math.ceil(stars.length * (scene.quality?.starScale ?? 1)), 0, stars.length);
      const image = circleImage();
      for (let i = 0; i < total; i++) {
        const star = stars[i], y = ((star.y - scene.cameraY * .12) % scene.H + scene.H) % scene.H;
        setSprite(pool('stars', layer.background, i), image, star.x, y, star.r * 2, star.r * 2,
          star.a * (.75 + Math.sin(time * .0015 + star.p) * .25), '#dfe5ff');
      }
      finishPool('stars', total);
      const cometImage = asset('comet', 64, ctx => {
        const g = ctx.createLinearGradient(60, 32, 2, 32);
        g.addColorStop(0, '#ffffffdd'); g.addColorStop(.18, '#6ee7ffaa'); g.addColorStop(1, '#6ee7ff00');
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(60, 32); ctx.lineTo(2, 32); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(60, 32, 2.2, 0, TAU); ctx.fill();
      });
      count = 0;
      for (const comet of scene.comets || []) {
        if (comet.life > 0) continue;
        const sprite = setSprite(pool('comets', layer.comets, count++), cometImage, comet.x, comet.y, 64, 64);
        sprite.anchor.set(60 / 64, .5); sprite.rotation = Math.atan2(comet.vy, comet.vx); sprite.blendMode = 'screen';
      }
      finishPool('comets', count);
    }

    function drawPlanet(planet, scene) {
      if (!inCamera(planet, Math.max(planet.r * 5, planet.r + 64), scene)) return;
      const item = record('planets', planet), r = planet.r, pulse = planet.pulse || 0, seed = planet.seed || 0;
      item.node.position.set(planet.x, planet.y); item.node.rotation = 0; item.node.scale.set(1);
      const under = item.before.clear(), surface = item.surface.clear(), over = item.after.clear();
      item.surface.visible = !planet.hazard; item.moon.visible = item.moonGlow.visible = false;
      if (item.maskRadius !== r) { item.mask.clear().circle(0, 0, r - 1).fill('#ffffff'); item.maskRadius = r; }
      if (!planet.hazard && scene.ship && scene.state === 'playing') {
        const range = 190 + r * 3.4, distance = Math.hypot(scene.ship.x - planet.x, scene.ship.y - planet.y);
        if (distance < range) {
          const pull = 1 - distance / range;
          dashedArc(under, r + 18 + Math.sin(pulse * 2) * 3, 0); stroke(under, '#9cf4ff', 1 + pull, .08 + pull * .2);
        }
      }
      if (!planet.hazard && planet.style === 1) {
        ellipse(under, 0, 0, r * 1.55, r * .36, -.32); stroke(under, tint(planet.color, 28), Math.max(2, r * .1), .55);
      }
      if (!planet.hazard) {
        ellipse(under, 0, 0, r * 2.25, r * .68, -.18); stroke(under, planet.color, 1, .12);
        ellipse(under, 0, 0, r * 2.8, r * .92, -.18); stroke(under, planet.color, 1, .06);
      }
      setGlow(item.glow, 0, 0, r, planet.color, planet.hazard ? 24 : 16, planet.target ? .8 + Math.sin(pulse * 3) * .2 : .65);
      const body = bodyImage(planet), size = body.size * r / body.radius;
      setSprite(item.body, body.sprite, 0, 0, size, size);
      if (!planet.hazard) {
        if (planet.style === 2) {
          const spin = ((pulse * r * .62 + seed * 13) % (r * 2.8)) - r * 1.4;
          for (let band = -1; band <= 1; band++) surface.ellipse(spin + band * r * 1.4, 0, r * .4, r * 1.08);
          stroke(surface, tint(planet.color, 72), Math.max(2, r * .11), .2);
          surface.ellipse(0, -r * .28, r * .94, r * .18).ellipse(0, r * .3, r * .9, r * .16); stroke(surface, '#ffffff', Math.max(1, r * .045), .12);
        } else if (planet.style === 3) {
          for (let i = 0; i < 4; i++) {
            const a = seed + i * 1.8 + pulse * .18;
            ellipse(surface, Math.cos(a) * r * .48, Math.sin(a * 1.3) * r * .32, r * .3, r * .15, a);
          }
          surface.fill({ color: '#85f0c0', alpha: .32 });
        } else if (planet.style === 4) {
          for (let i = 0; i < 4; i++) {
            const a = seed * .3 + i * 1.55;
            surface.moveTo(Math.cos(a) * r * .12, Math.sin(a) * r * .12)
              .lineTo(Math.cos(a + .25) * r * .52, Math.sin(a + .25) * r * .52)
              .lineTo(Math.cos(a - .08) * r, Math.sin(a - .08) * r);
          }
          stroke(surface, '#ffb24d', Math.max(1, r * .055), .75);
        } else if (planet.style === 5) {
          for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + seed; surface.moveTo(0, 0).lineTo(Math.cos(a) * r, Math.sin(a) * r); }
          stroke(surface, '#e9fbff', Math.max(1, r * .045), .55);
        } else if (planet.style === 6) {
          for (let i = 0; i < 7; i++) {
            const a = seed + i * .94 + pulse * .1, rr = r * (.2 + (i % 3) * .18);
            circle(surface, Math.cos(a) * rr, Math.sin(a * 1.2) * rr, r * .12, '#ffdb72', .28);
          }
        }
        for (let i = 0; i < 3; i++) {
          const a = (seed * .17 + i * 2.1 + (planet.style < 2 ? 0 : pulse * .72)) % TAU;
          circle(surface, Math.cos(a) * r * .45, Math.sin(a) * r * .4, r * (.12 + (i % 2) * .08), '#ffffff', planet.style < 2 ? .18 : .24);
        }
      } else if (planet.hazardType === 'pulsar') {
        const a = pulse * .9, length = r * 4.5;
        over.moveTo(-Math.cos(a) * length, -Math.sin(a) * length).lineTo(Math.cos(a) * length, Math.sin(a) * length); stroke(over, '#9cf4ff', 2, .73);
        over.circle(0, 0, r * (1.8 + Math.sin(pulse * 2) * .2)); stroke(over, '#9cf4ff', 2, .4);
      } else {
        for (let ring = 0; ring < 3; ring++) {
          ellipse(over, 0, 0, r * (1.65 + ring * .38), r * (.36 + ring * .1), pulse * .22 - .35); stroke(over, ring === 1 ? '#6ee7ff' : '#c081ff', 2 - ring * .35, .65 - ring * .16);
        }
      }
      if (planet.target) { over.circle(0, 0, r + 9 + Math.sin(pulse * 3) * 3); stroke(over, planet.color, 1.5, .55); }
      if (!planet.hazard && planet.style === 0) {
        const a = pulse * .55 + seed, x = Math.cos(a) * r * 1.65, y = Math.sin(a) * r * .7, radius = Math.max(2.5, r * .11);
        setGlow(item.moonGlow, x, y, radius, '#9eb3ff', 8, .85);
        setSprite(item.moon, circleImage(), x, y, radius * 2, radius * 2, .85, '#dbe2ff');
      }
    }

    function drawAsteroid(entity, scene) {
      if (!inCamera(entity, entity.r + 2, scene)) return;
      const item = record('asteroids', entity);
      item.node.position.set(entity.x, entity.y); item.node.rotation = entity.rotation || 0;
      item.before.clear(); item.after.clear(); item.surface.visible = false;
      item.glow.visible = item.moon.visible = item.moonGlow.visible = false;
      const radius = entity.r, image = asset(`asteroid:${radius}:${entity.seed}`, radius * 2 + 6, (ctx, size) => {
        ctx.translate(size / 2, size / 2); ctx.fillStyle = '#5e6178'; ctx.strokeStyle = '#949ab7'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rr = radius * (.72 + .28 * Math.sin(entity.seed + i * 2.3)); if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.globalAlpha = .35; ctx.fillStyle = '#111522'; ctx.beginPath(); ctx.arc(-radius * .18, -radius * .12, radius * .22, 0, TAU); ctx.fill();
      });
      setSprite(item.body, image, 0, 0);
    }

    function drawCollectible(entity, scene) {
      if (entity.collected || !inCamera(entity, entity.r * 1.2 + 64, scene)) return;
      const item = record('collectibles', entity), r = entity.r;
      item.node.position.set(entity.x, entity.y); item.node.rotation = entity.pulse * .18; item.node.scale.set(1 + Math.sin(entity.pulse) * .18);
      item.surface.visible = item.moon.visible = item.moonGlow.visible = false; item.before.clear(); item.after.clear();
      setGlow(item.glow, 0, 0, r, '#ffcf5c', 18);
      const image = asset(`collectible:${r}`, r * 2 + 4, (ctx, size) => {
        ctx.translate(size / 2, size / 2); ctx.fillStyle = '#ffcf5c'; ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4, radius = i % 2 ? r * .42 : r; if (i) ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius); else ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius); }
        ctx.closePath(); ctx.fill();
      });
      setSprite(item.body, image, 0, 0);
    }

    function drawPhenomenon(entity, scene) {
      if (entity.used || !inCamera(entity, entity.r * 1.4 + 64, scene)) return;
      const item = record(entity.type === 'nebula' ? 'nebula' : 'phenomena', entity), r = entity.r, pulse = entity.pulse || 0;
      item.node.position.set(entity.x, entity.y); item.node.rotation = 0; item.node.scale.set(1);
      item.before.clear(); item.surface.visible = item.moon.visible = item.moonGlow.visible = false;
      item.body.visible = false; const g = item.after.clear(); item.glow.visible = false;
      if (entity.type === 'nebula') {
        const image = asset(`field-nebula:${r}`, r * 2 + 2, (ctx, size) => {
          const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, r);
          grad.addColorStop(0, '#7c5cff38'); grad.addColorStop(.55, '#4a3fa925'); grad.addColorStop(1, '#35206a00');
          ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
        });
        setSprite(item.body, image, 0, 0); dashedArc(g, r * .82, 0, 3, 8); stroke(g, '#b49cff', 1, .2);
      } else if (entity.type === 'shieldOrb') {
        item.node.scale.set(1 + Math.sin(pulse) * .08); setGlow(item.glow, 0, 0, r, '#6ee7ff', 18);
        polygon(g, 6, r, -Math.PI / 2); g.fill({ color: '#6ee7ff', alpha: .21 }); stroke(g, '#9cf4ff', 2);
        g.circle(0, 0, r * .38); stroke(g, '#9cf4ff', 2);
      } else if (entity.type === 'boostGate') {
        item.node.rotation = pulse * .35; setGlow(item.glow, 0, 0, r, '#ffcf5c', 16);
        g.arc(0, 0, r, -.3, Math.PI + .3); stroke(g, '#ffcf5c', 3);
        g.arc(0, 0, r * .65, Math.PI - .3, TAU + .3); stroke(g, '#ffcf5c', 3, .45);
      } else if (entity.type === 'phaseOrb') {
        item.node.rotation = -pulse * .28; setGlow(item.glow, 0, 0, r, '#c894ff', 20);
        g.circle(0, 0, r); stroke(g, '#e6c8ff', 2);
        g.circle(0, 0, r * .48).moveTo(-r * .8, 0).lineTo(r * .8, 0); stroke(g, '#e6c8ff', 2, .7);
      } else if (entity.type === 'starCache') {
        item.node.rotation = pulse * .22; setGlow(item.glow, 0, 0, r, '#ffcf5c', 22);
        polygon(g, 12, r, -Math.PI / 2, r * .42); g.fill('#ffcf5c');
      } else if (entity.type === 'gravityRift') {
        item.node.rotation = pulse * .18 * entity.direction; setGlow(item.glow, 0, 0, r, '#7c5cff', 18, .72);
        for (let i = 0; i < 3; i++) { g.arc(0, 0, r * (.34 + i * .24), i * 1.1, i * 1.1 + Math.PI * 1.45); stroke(g, '#c081ff', 2 - i * .4, .72); }
        circle(g, 0, 0, r, '#7c5cff', .18);
      } else if (entity.type === 'solarWind') {
        circle(g, 0, 0, r, '#ffb45c', .16);
        for (let i = -1; i <= 1; i++) { const y = i * r * .34 + Math.sin(pulse + i) * 3; g.moveTo(-r * entity.direction, y).quadraticCurveTo(0, y - 7 * entity.direction, r * entity.direction, y); }
        stroke(g, '#ffd58a', 1.5, .75);
      } else if (entity.type === 'mine') {
        item.node.rotation = pulse * .18; setGlow(item.glow, 0, 0, r, '#ff4f91', 18);
        polygon(g, 16, r * (1.25 + Math.sin(pulse) * .12), 0, r * .55); g.fill('#ff4f91'); stroke(g, '#ff9fc1', 2);
        circle(g, 0, 0, 2, '#ffffff');
      }
    }

    function drawCircles(scene) {
      const image = circleImage(); let count = 0;
      for (const p of scene.particles || []) {
        if (!inCamera(p, p.r + 1, scene)) continue;
        setSprite(pool('particles', layer.particles, count++), image, p.x, p.y, p.r * 2, p.r * 2, Math.max(0, p.life / p.max), p.color);
      }
      finishPool('particles', count); count = 0;
      if (scene.ship?.mode === 'flight') for (let i = 0; i < (scene.trail || []).length; i++) {
        const t = scene.trail[i], ratio = i / scene.trail.length, r = 1 + ratio * 3;
        const color = typeof scene.trailColor === 'function' ? scene.trailColor(i) : (scene.trailColors?.[i % scene.trailColors.length] || scene.trailColor || scene.skinColor || '#ffffff');
        setSprite(pool('trail', layer.trail, count++), image, t.x, t.y, r * 2, r * 2, Math.max(0, t.life) * ratio * .55, color);
      }
      finishPool('trail', count);
    }

    function drawShip(scene, time) {
      const ship = scene.ship; let count = 0;
      if (ship && scene.state !== 'menu') {
        const color = typeof scene.skinColor === 'function' ? scene.skinColor() : scene.skinColor || '#ffffff';
        const node = pool('ship-body', layer.ship, 0), halo = pool('ship-glow', layer.ship, 0);
        // Keep the glow behind the body even when the pool is reused.
        layer.ship.setChildIndex?.(halo, 0);
        const image = asset(`ship:${color}`, 48, (ctx, size) => {
          ctx.translate(size / 2, size / 2); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(2, 6); ctx.lineTo(0, 12); ctx.lineTo(-2, 6); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#151933'; ctx.beginPath(); ctx.arc(0, -2, 2.8, 0, TAU); ctx.fill();
        });
        setGlow(halo, ship.x, ship.y, 12, color, 14); setSprite(node, image, ship.x, ship.y);
        node.rotation = ship.mode === 'flight' ? Math.atan2(ship.vy, ship.vx) + Math.PI / 2 : ship.aimAngle + Math.PI / 2;
        count = 1;
      }
      finishPool('ship-body', count); finishPool('ship-glow', count);
      let phase = arrays.get('phase-graphics');
      if (!phase) { phase = [new P.Graphics()]; arrays.set('phase-graphics', phase); layer.ship.addChild(phase[0]); }
      const ring = phase[0].clear();
      if (count && scene.phaseCharges > 0) {
        const halo = pool('phase-glow', layer.ship, 0);
        setGlow(halo, ship.x, ship.y, 15, '#c894ff', 12, .72);
        layer.ship.setChildIndex?.(halo, layer.ship.children.indexOf(ring));
        ring.circle(ship.x, ship.y, 15 + Math.sin(time * .008) * 1.5); stroke(ring, '#d9adff', 1.6, .72);
      } else finishPool('phase-glow', 0);
    }

    function drawPrediction(scene, time) {
      const p = scene.prediction;
      layer.prediction.visible = scene.state !== 'menu' && scene.ship?.mode === 'orbit' && !!p?.count;
      if (!layer.prediction.visible) return;
      const stamp = Number.isFinite(p.stamp) ? p.stamp : Math.floor(time / 50);
      const style = `${scene.holding}:${p.outcome}`;
      if (stamp === forecastStamp && style === forecastStyle) return;
      forecastStamp = stamp; forecastStyle = style; forecast.clear();
      const color = p.outcome === 'safe' ? '#70f0aa' : p.outcome === 'danger' ? '#c081ff' : '#6ee7ff';
      let x = scene.ship.x, y = scene.ship.y, remaining = 3, drawing = true;
      const segment = (endX, endY) => {
        const dx = endX - x, dy = endY - y, length = Math.hypot(dx, dy);
        if (!length) return;
        let done = 0;
        while (done < length - 1e-8) {
          const step = Math.min(remaining, length - done), start = done / length, end = (done + step) / length;
          if (drawing) forecast.moveTo(x + dx * start, y + dy * start).lineTo(x + dx * end, y + dy * end);
          done += step; remaining -= step;
          if (remaining <= 1e-8) { drawing = !drawing; remaining = drawing ? 3 : 7; }
        }
        x = endX; y = endY;
      };
      for (let i = 3; i < p.count; i += 4) segment(p.points[i * 2], p.points[i * 2 + 1]);
      if (p.count % 4) segment(p.points[(p.count - 1) * 2], p.points[(p.count - 1) * 2 + 1]);
      stroke(forecast, color, scene.holding ? 2 : 1.3, scene.holding ? .9 : .48);
      for (let i = 0; i < p.count; i += 16) circle(forecast, p.points[i * 2], p.points[i * 2 + 1], 2.8, color, (1 - i / p.count) * (scene.holding ? .9 : .52));
    }

    function drawCharge(scene) {
      charge.clear(); charge.visible = scene.state === 'playing' && scene.holding;
      if (!charge.visible) return;
      const w = Math.min(220, scene.W * .54), x = (scene.W - w) / 2, y = scene.H - Math.max(38, (scene.safeBottom || 0) + 22);
      charge.roundRect(x, y, w, 10, 5).fill('#11152f');
      // Pixi masks keep the full-width gradient; changing power does not stretch its colour stops.
      const image = asset(`charge:${w}`, 256, ctx => {
        const g = ctx.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, '#6ee7ff'); g.addColorStop(.7, '#7c5cff'); g.addColorStop(1, '#ffcf5c');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
      });
      const fill = pool('charge', layer.ui, 0); setSprite(fill, image, x + 2, y + 2, w - 4, 6); fill.anchor.set(0);
      if (!charge.powerMask) { charge.powerMask = new P.Graphics(); layer.ui.addChild(charge.powerMask); fill.mask = charge.powerMask; }
      charge.powerMask.clear().roundRect(x + 2, y + 2, Math.max(0, (w - 4) * scene.charge), 6, 3).fill('#ffffff');
    }

    function render(scene, time) {
      if (destroyed || failed) return false;
      try {
        current = scene; frame++;
        const scale = scene.viewScale ?? Math.min(width / scene.W, height / scene.H);
        const x = scene.viewX ?? (width - scene.W * scale) / 2, y = scene.viewY ?? (height - scene.H * scale) / 2;
        root.position.set(x, y); root.scale.set(scale); clip.position.set(x, y); clip.scale.set(scale);
        world.position.set(0, -scene.cameraY);
        if (clipWidth !== scene.W || clipHeight !== scene.H) { clip.clear().rect(0, 0, scene.W, scene.H).fill('#ffffff'); clipWidth = scene.W; clipHeight = scene.H; }
        drawBackground(scene, time);
        for (const p of scene.planets || []) drawPlanet(p, scene);
        for (const a of scene.asteroids || []) drawAsteroid(a, scene);
        for (const c of scene.collectibles || []) drawCollectible(c, scene);
        for (const f of scene.phenomena || []) drawPhenomenon(f, scene);
        drawCircles(scene); drawShip(scene, time); drawPrediction(scene, time); drawCharge(scene);
        if (!charge.visible) { finishPool('charge', 0); if (charge.powerMask) charge.powerMask.clear(); }
        releaseRecords(); pruneTextures(); app.render(); return true;
      } catch (error) { fail(error); return false; }
    }

    function resize(size) {
      if (destroyed) return;
      width = Math.max(1, size.width); height = Math.max(1, size.height); resolution = size.resolution || 1;
      app.renderer.resize(width, height, resolution);
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true; canvas.removeEventListener('webglcontextlost', onContextLost);
      for (const item of free.values()) for (const entry of item) entry.node.destroy({ children: true });
      for (const entry of textures.values()) entry.texture.destroy(true);
      textures.clear(); assets.clear(); records.clear(); free.clear(); arrays.clear();
      app.destroy(true, { children: true }); canvas.remove?.(); current = null;
    }

    return { canvas, render, resize, destroy, backend: 'pixi-webgl',
      fidelityGaps: ['Antialias e tesselação de curvas dependem do backend WebGL; comparar capturas antes de promover.'],
      debugStats() { return { textures: textures.size, assets: assets.size, entities: records.size,
        pooledEntities: [...free.values()].reduce((sum, items) => sum + items.length, 0),
        pooledSprites: [...arrays.values()].reduce((sum, items) => sum + items.length, 0), frame, failed, destroyed, resolution }; }
    };
  }

  window.OrbitaPixiRenderer = { create, backend: 'pixi-webgl' };
})();
