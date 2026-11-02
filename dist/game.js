(() => {
  'use strict';

  const shell = document.querySelector('#game-shell');
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = {
    start: document.querySelector('#start-screen'), over: document.querySelector('#game-over'),
    shop: document.querySelector('#shop'), score: document.querySelector('#score'),
    best: document.querySelector('#best'), coins: document.querySelector('#coins'),
    shopCoins: document.querySelector('#shop-coins'), final: document.querySelector('#final-score'),
    result: document.querySelector('#result-copy'), combo: document.querySelector('#combo'),
    toast: document.querySelector('#toast'),
    continueButton: document.querySelector('#continue-button'), skins: document.querySelector('#skins'),
    trails: document.querySelector('#trails'), items: document.querySelector('#items'),
    sector: document.querySelector('#sector'), rewardDust: document.querySelector('#reward-dust'),
    quitButton: document.querySelector('#quit-button'), quitConfirm: document.querySelector('#quit-confirm'),
    quitCopy: document.querySelector('#quit-copy'), missions: document.querySelector('#missions'),
    missionList: document.querySelector('#mission-list'), eventBanner: document.querySelector('#event-banner'),
    eventTimer: document.querySelector('#event-timer')
  };

  const TAU = Math.PI * 2;
  const SAVE_KEY = 'orbita-infinita-v1';
  const palette = ['#7c5cff', '#28c8d6', '#ff6b9d', '#ff9b54', '#62d391', '#c777ff'];
  const skins = [
    { id: 'cometa', name: 'Cometa', color: '#f7f8ff', cost: 0 },
    { id: 'solar', name: 'Solar', color: '#ffcf5c', cost: 120 },
    { id: 'nebula', name: 'Nebulosa', color: '#ff6bce', cost: 280 },
    { id: 'ion', name: 'Íon', color: '#6ee7ff', cost: 520 },
    { id: 'void', name: 'Vazio', color: '#ad8cff', cost: 900 },
    { id: 'nova', name: 'Supernova', color: '#ff724c', cost: 1500 },
    { id: 'aurora', name: 'Aurora', color: '#7dffb2', cost: 2200 },
    { id: 'quantum', name: 'Quântica', color: '#65a4ff', cost: 3600 },
    { id: 'eclipse', name: 'Eclipse', color: '#e3a7ff', cost: 6000 }
  ];
  const trails = [
    { id: 'classic', name: 'Clássico', color: '#f7f8ff', cost: 0 },
    { id: 'plasma', name: 'Plasma', color: '#6ee7ff', cost: 350 },
    { id: 'solar', name: 'Solar', color: '#ffcf5c', cost: 700 },
    { id: 'nebula', name: 'Nebulosa', color: '#ff6bce', cost: 1100 },
    { id: 'void', name: 'Vácuo', color: '#9b63ff', cost: 1800 },
    { id: 'aurora', name: 'Aurora', color: '#70f0aa', cost: 2600 }
  ];
  const missionCatalog = buildMissionCatalog();
  const defaults = { best: 0, coins: 0, selected: 'cometa', owned: ['cometa'], selectedTrail: 'classic', ownedTrails: ['classic'], shields: 0, boosters: 0, sound: true, runs: 0, missionDay: '', missionIds: [], missionProgress: {}, missionClaimed: [] };
  let save = loadSave();
  let W = 0, H = 0, dpr = 1, safeBottom = 0, last = 0, state = 'menu';
  let stars = [], nebulae = [], comets = [], planets = [], particles = [], trail = [], asteroids = [], collectibles = [], phenomena = [];
  let ship, current, targets = [], score = 0, streak = 0, cameraY = 0, cameraTargetY = 0;
  let holding = false, charge = .35, aimStartX = 0, aimStartY = 0, continued = false, runDust = 0, phaseCharges = 0, runShieldUsed = false;
  let specialEvent = null;
  let runSeed = 0, random = Math.random;
  let audioCtx = null, musicTimer = null, musicStep = 0;
  const STEP = 1 / 120, MAX_FRAME_TIME = .25;
  let frameId = 0, accumulator = 0, appBackground = false;
  let viewportW = 0, viewportH = 0, viewScale = 1, viewX = 0, viewY = 0, menuLayout = true;
  let activePointer = null, backgroundGradient = null;
  let trailSampleTime = 0;
  const forceScratch = {}, positionScratch = {};
  const glowSprites = new Map();
  const planetBodies = new WeakMap();
  const bodySprites = new Map();
  const backgroundLayer = document.createElement('canvas');
  const backgroundCtx = backgroundLayer.getContext('2d', { alpha: false });
  let backgroundStamp = -Infinity, backgroundCamera = NaN;
  const prediction = { points: new Float64Array(184 * 2), count: 0, outcome: 'open', stamp: -Infinity };
  let perfSample = null;
  // Opt-in local diagnostics, started by the Android debug build only. No network or player data.
  window.OrbitaMeasurePerformance = () => {
    perfSample = { start: performance.now(), state, intervals: [], update: [], draw: [], windows: 0,
      predictions: 0, backgrounds: 0, bodies: 0 };
  };

  function resetPerformanceWindow(now = performance.now()) {
    if (!perfSample) return;
    perfSample.start = now; perfSample.state = state;
    perfSample.intervals.length = perfSample.update.length = perfSample.draw.length = 0;
    perfSample.predictions = perfSample.backgrounds = perfSample.bodies = 0;
  }

  function recordPerformance(elapsed, updateMs, drawMs, now) {
    const sample = perfSample;
    if (sample.state !== state) { resetPerformanceWindow(now); return; }
    sample.intervals.push(elapsed * 1000); sample.update.push(updateMs); sample.draw.push(drawMs);
    if (now - sample.start < 5000) return;
    const percentile = (values, fraction) => {
      values.sort((a, b) => a - b);
      return +values[Math.min(values.length - 1, Math.floor(values.length * fraction))].toFixed(2);
    };
    console.info('[OrbitaPerf] ' + JSON.stringify({ state, frames: sample.intervals.length, sampleMs: +(now - sample.start).toFixed(1),
      fps: +(sample.intervals.length * 1000 / (now - sample.start)).toFixed(1),
      frameP50: percentile(sample.intervals, .5), frameP95: percentile(sample.intervals, .95),
      updateP95: percentile(sample.update, .95), drawP95: percentile(sample.draw, .95),
      pixels: canvas.width * canvas.height, dpr, width: W, height: H,
      predictionSolves: sample.predictions, backgroundPaints: sample.backgrounds, planetBodyPaints: sample.bodies }));
    if (++sample.windows === 3) perfSample = null;
    else resetPerformanceWindow(now);
  }

  function loadSave() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; }
    catch { return { ...defaults }; }
  }
  function persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); syncUI(); }
  function syncUI() {
    ensureDailyMissions();
    const setText = (element, value) => { if (element.textContent !== String(value)) element.textContent = value; };
    setText(ui.best, save.best); setText(ui.coins, save.coins); setText(ui.shopCoins, save.coins);
    const soundButton = document.querySelector('#sound-button');
    setText(soundButton, save.sound ? 'SOM LIGADO' : 'SOM DESLIGADO');
    if (soundButton.getAttribute('aria-pressed') !== String(save.sound)) soundButton.setAttribute('aria-pressed', String(save.sound));
  }

  function buildMissionCatalog() {
    const list = [], add = (type, index, target, reward, title, copy, mode = 'max') => list.push({ id: `${type}-${index + 1}`, type, target, reward, title, copy, mode });
    for (let i = 0; i < 35; i++) add('reach', i, i + 3, 30 + i * 5, `Alcance ${i + 3} planetas`, 'Melhor marca em uma viagem.');
    for (let i = 0; i < 35; i++) add('dust', i, 20 + i * 10, 25 + i * 6, `Colete ${20 + i * 10} poeiras`, 'Acumule em uma única viagem.');
    for (let i = 0; i < 35; i++) add('land', i, i + 3, 20 + i * 4, `Pouse em ${i + 3} planetas`, 'Progresso acumulado durante o dia.', 'add');
    for (let i = 0; i < 30; i++) add('perfect', i, i + 2, 35 + i * 6, `Faça ${i + 2} pousos perfeitos`, 'Progresso acumulado durante o dia.', 'add');
    for (let i = 0; i < 25; i++) add('power', i, i + 1, 30 + i * 8, `Ative ${i + 1} power-ups`, 'Qualquer benefício encontrado conta.', 'add');
    for (let i = 0; i < 30; i++) add('noShield', i, i + 3, 50 + i * 8, `Alcance ${i + 3} sem escudo`, 'Pouse sem ativar proteção.');
    return list;
  }

  function localDay() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }

  function ensureDailyMissions() {
    const day = localDay();
    if (save.missionDay === day && save.missionIds?.length === 6) return;
    const rnd = mulberry32(hashText(day));
    const types = ['reach', 'dust', 'land', 'perfect', 'power', 'noShield'];
    save.missionDay = day; save.missionProgress = {}; save.missionClaimed = [];
    save.missionIds = types.map(type => {
      const group = missionCatalog.filter(m => m.type === type);
      const playerBand = type === 'reach' || type === 'noShield'
        ? Math.min(group.length, Math.max(7, save.best + 6))
        : Math.min(group.length, type === 'power' ? 12 : 18);
      return group[Math.floor(rnd() * playerBand)].id;
    });
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }

  function dailyMissions() {
    ensureDailyMissions();
    return save.missionIds.map(id => missionCatalog.find(m => m.id === id)).filter(Boolean);
  }

  function recordMission(type, value = 1) {
    for (const mission of dailyMissions()) {
      if (mission.type !== type || save.missionClaimed.includes(mission.id)) continue;
      const previous = save.missionProgress[mission.id] || 0;
      save.missionProgress[mission.id] = mission.mode === 'add' ? previous + value : Math.max(previous, value);
    }
  }

  function resize() {
    shell.scrollTo(0, 0);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    // Bound raster/compositing work on large screens; DOM controls keep native resolution.
    const nextDpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(1200000 / (width * height)));
    const isMenu = state === 'menu';
    if (width === viewportW && height === viewportH && nextDpr === dpr && isMenu === menuLayout) return;
    if (viewportW && (width !== viewportW || height !== viewportH)) pauseRun();
    viewportW = width; viewportH = height; dpr = nextDpr; menuLayout = isMenu;
    // Keep run coordinates and physics intact when rotating; fit the same world on screen.
    if (!W || isMenu) { W = width; H = height; makeStars(); seedMenuWorld(); }
    viewScale = Math.min(width / W, height / H);
    viewX = (width - W * viewScale) / 2; viewY = (height - H * viewScale) / 2;
    safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, viewX * dpr, viewY * dpr);
    backgroundGradient = null; backgroundStamp = -Infinity; prediction.stamp = -Infinity;
    requestFrame();
  }

  function makeStars() {
    const rnd = mulberry32(9137);
    stars = Array.from({ length: Math.floor(W * H / 4400) }, () => ({
      x: rnd() * W, y: rnd() * H, r: rnd() * 1.4 + .25, a: rnd() * .7 + .2, p: rnd() * 8
    }));
    nebulae = Array.from({ length: 4 }, (_, i) => ({
      x: rnd() * W, y: rnd() * H, r: 90 + rnd() * 150,
      color: ['#713cff', '#1ba9c9', '#d73991', '#425fe0'][i], drift: .012 + rnd() * .02
    }));
    for (const n of nebulae) {
      n.sprite = document.createElement('canvas');
      n.sprite.width = n.sprite.height = Math.ceil(n.r * 2);
      const layer = n.sprite.getContext('2d');
      const g = layer.createRadialGradient(n.r, n.r, 0, n.r, n.r, n.r);
      g.addColorStop(0, `${n.color}22`); g.addColorStop(.48, `${n.color}0d`); g.addColorStop(1, `${n.color}00`);
      layer.fillStyle = g; layer.fillRect(0, 0, n.sprite.width, n.sprite.height);
    }
    comets = Array.from({ length: 3 }, (_, i) => makeComet(rnd, i * 2.7));
  }

  function makeComet(rnd = Math.random, delay = 0) {
    return { x: -80 - rnd() * W, y: rnd() * H * .7, vx: 120 + rnd() * 100, vy: 38 + rnd() * 45, life: delay };
  }

  function seedMenuWorld() {
    planets = [
      planet(W * .18, H * .26, 18, '#28c8d6', 0),
      planet(W * .84, H * .52, 34, '#ff6b9d', 1),
      planet(W * .2, H * .82, 52, '#7c5cff', 2)
    ];
  }

  function planet(x, y, r, color, seed) {
    return { x, y, r, color, seed, style: Math.abs(Math.floor(seed)) % 7, pulse: Math.random() * TAU, visited: false, target: false };
  }

  function threatBudget(level) {
    if (level < 3) return 0;
    return Math.min(5, 1 + Math.floor((level - 3) / 5));
  }

  function outsideLaunchBubble(entity) {
    return Math.hypot(entity.x - current.x, entity.y - current.y) > current.r + entity.r + 92;
  }

  function findFreePosition(r, yMin, yMax, padding = 24, xMin = 58, xMax = W - 58) {
    let best = { x: W / 2, y: (yMin + yMax) / 2 }, bestClearance = -Infinity;
    const lowY = Math.min(yMin, yMax), highY = Math.max(yMin, yMax);
    const lowX = Math.max(r + 8, Math.min(xMin, xMax)), highX = Math.min(W - r - 8, Math.max(xMin, xMax));
    for (let attempt = 0; attempt < 42; attempt++) {
      const candidate = { x: lowX + random() * Math.max(1, highX - lowX), y: lowY + random() * Math.max(1, highY - lowY) };
      let clearance = Infinity;
      for (const p of planets) {
        const px = p.orbitMotion?.cx ?? p.x, py = p.orbitMotion?.cy ?? p.y;
        clearance = Math.min(clearance, Math.hypot(candidate.x - px, candidate.y - py) - r - p.r - (p.orbitMotion?.radius ?? 0));
      }
      for (const a of asteroids) clearance = Math.min(clearance, Math.hypot(candidate.x - a.x, candidate.y - a.y) - r - a.r);
      for (const c of collectibles) if (!c.collected) clearance = Math.min(clearance, Math.hypot(candidate.x - c.x, candidate.y - c.y) - r - c.r);
      for (const f of phenomena) if (!f.used) clearance = Math.min(clearance, Math.hypot(candidate.x - f.x, candidate.y - f.y) - r - f.r);
      if (clearance > bestClearance) { best = candidate; bestClearance = clearance; }
      if (clearance >= padding) return candidate;
    }
    return best;
  }

  function distanceToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const length2 = abx * abx + aby * aby;
    const t = length2 ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / length2)) : 0;
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
  }

  function begin() {
    document.activeElement?.blur(); shell.scrollTo(0, 0);
    cancelAim();
    score = 0; streak = 0; continued = false; holding = false; charge = .35; runDust = 0; phaseCharges = 0; runShieldUsed = false; specialEvent = null;
    ui.eventBanner.hidden = true;
    cameraY = 0; cameraTargetY = 0; trail = []; particles = []; asteroids = []; collectibles = []; phenomena = [];
    runSeed = Math.floor(Math.random() * 900000) + 100000;
    random = mulberry32(runSeed);
    current = planet(W * .5, H * .72, 39, '#7c5cff', 10);
    current.visited = true;
    planets = [current];
    spawnTargets();
    ship = { x: 0, y: 0, vx: 0, vy: 0, aimAngle: -Math.PI / 2, orbitRadius: current.r + 19, mode: 'orbit' };
    placeOrbitShip();
    state = 'playing';
    document.querySelector('#pause-screen').hidden = true;
    ui.start.classList.remove('active'); ui.over.classList.remove('active'); ui.shop.classList.remove('open');
    ui.quitConfirm.hidden = true; ui.quitButton.hidden = false;
    ui.score.textContent = '0';
    ui.sector.textContent = 'SETOR 01';
    ping(380, .06, 'sine');
    startMusic();
    wakeLoop();
  }

  function spawnTargets() {
    const level = score + 1;
    const gapY = Math.min(H * .37, 205 + level * 2.4);
    const margin = Math.min(58, Math.max(34, W * .12));
    const horizontalReach = Math.min(W * .44, Math.max(150, H * .72));
    const targetMinX = Math.max(margin, current.x - horizontalReach);
    const targetMaxX = Math.min(W - margin, current.x + horizontalReach);
    const choiceCount = level >= 5 ? 4 : 3;
    targets = [];
    for (let i = 0; i < choiceCount; i++) {
      const r = Math.max(20, 32 - level * .22 + random() * 9);
      const movesInOrbit = i % 2 === level % 2;
      const orbitRadius = movesInOrbit ? 18 + random() * 20 : 0;
      const pos = findFreePosition(r + orbitRadius, current.y - gapY * 1.62, current.y - gapY * .56, 34, targetMinX, targetMaxX);
      const next = planet(pos.x, pos.y, r, palette[(level + i * 2) % palette.length], level * 37 + i * 11);
      if (movesInOrbit) {
        next.orbitMotion = {
          cx: pos.x, cy: pos.y, radius: orbitRadius,
          angle: random() * TAU,
          speed: (.42 + random() * .28) * (random() < .5 ? -1 : 1)
        };
        movePlanetOnOrbit(next, 0);
      }
      next.target = true; planets.push(next); targets.push(next);
    }
    const safeTarget = targets.find(t => !t.orbitMotion) || targets[0];
    const collectibleTarget = targets[Math.floor(random() * targets.length)];
    const collectibleT = .38 + random() * .24;
    const routeX = current.x + (collectibleTarget.x - current.x) * collectibleT;
    const routeY = current.y + (collectibleTarget.y - current.y) * collectibleT;
    const collectiblePos = findFreePosition(7, routeY - 38, routeY + 38, 16, routeX - 62, routeX + 62);
    collectibles.push({ x: collectiblePos.x, y: collectiblePos.y, r: 7, pulse: random() * TAU, collected: false });
    const powerTypes = level < 4 ? ['shieldOrb', 'boostGate'] : ['shieldOrb', 'boostGate', 'phaseOrb', 'starCache'];
    const powerCount = level < 7 ? 1 : random() < .42 ? 2 : 1;
    for (let i = 0; i < powerCount; i++) {
      const type = powerTypes[Math.floor(random() * powerTypes.length)];
      const r = type === 'boostGate' ? 17 : type === 'starCache' ? 12 : 10;
      const pos = findFreePosition(r, current.y - gapY * 1.2, current.y - gapY * .3, 24);
      phenomena.push({ type, x: pos.x, y: pos.y, r, pulse: random() * TAU, used: false });
    }

    const unlockedThreats = ['blackHole'];
    if (level >= 4) unlockedThreats.push('asteroid');
    if (level >= 5) unlockedThreats.push('nebula');
    if (level >= 6) unlockedThreats.push('mine');
    if (level >= 8) unlockedThreats.push('pulsar');
    if (level >= 10) unlockedThreats.push('solarWind');
    if (level >= 12) unlockedThreats.push('gravityRift');
    const deck = [...unlockedThreats].sort(() => random() - .5);
    for (let i = 0; i < threatBudget(level); i++) {
      const type = deck[i % deck.length];
      const dangerTop = current.y - gapY * 1.24;
      const dangerBottom = current.y - Math.max(132, gapY * .42);
      if (type === 'asteroid') {
        const r = 8 + random() * 5, pos = findFreePosition(r, dangerTop, dangerBottom, 26);
        asteroids.push({ x: pos.x, y: pos.y, r, rotation: random() * TAU, spin: (random() - .5) * 1.4, seed: random() * 20 });
      } else if (type === 'blackHole' || type === 'pulsar') {
        const r = 13 + random() * 6, pos = findFreePosition(r, dangerTop, dangerBottom, 32);
        planets.push({ ...planet(pos.x, pos.y, r, type === 'pulsar' ? '#6ee7ff' : '#9b63ff', 100 + level * 17 + i), hazard: true, hazardType: type, gravity: type === 'pulsar' ? -(265000 + level * 4500) : 0 });
      } else {
        const r = type === 'mine' ? 9 : type === 'nebula' ? 38 + random() * 10 : 34 + random() * 9;
        const pos = findFreePosition(r, dangerTop, dangerBottom, type === 'mine' ? 27 : 18);
        phenomena.push({ type, x: pos.x, y: pos.y, r, pulse: random() * TAU, used: false, direction: random() < .5 ? -1 : 1 });
      }
    }
    if (safeTarget) {
      const corridor = 30;
      planets = planets.filter(p => p === current || p.target || distanceToSegment(p.x, p.y, current.x, current.y, safeTarget.x, safeTarget.y) > corridor + p.r);
      asteroids = asteroids.filter(a => distanceToSegment(a.x, a.y, current.x, current.y, safeTarget.x, safeTarget.y) > corridor + a.r);
      phenomena = phenomena.filter(f => !['mine', 'gravityRift', 'solarWind'].includes(f.type) || distanceToSegment(f.x, f.y, current.x, current.y, safeTarget.x, safeTarget.y) > corridor + f.r);
    }
    planets = planets.filter(p => !p.hazard || outsideLaunchBubble(p));
    asteroids = asteroids.filter(outsideLaunchBubble);
    phenomena = phenomena.filter(f => !['mine', 'nebula', 'gravityRift', 'solarWind'].includes(f.type) || outsideLaunchBubble(f));
    const normalPlanets = planets.filter(p => !p.hazard);
    const visibleHazards = planets.filter(p => p.hazard).slice(-Math.min(6, 3 + Math.floor(level / 10)));
    planets = [...normalPlanets, ...visibleHazards];
    asteroids = asteroids.slice(-Math.min(6, 2 + Math.floor(level / 8)));
    phenomena = phenomena.filter(f => !f.used && f.y - cameraTargetY > -180 && f.y - cameraTargetY < H + 180).slice(-8);
    if (level === 3) toast('ANOMALIA: primeiro obstáculo detectado.');
    if (level === 4) toast('NOVO: fase quântica e reservas de poeira.');
    if (level === 10) toast('NOVO: ventos solares alteram a rota.');
    if (level === 12) toast('NOVO: fendas gravitacionais giram a nave.');
  }

  function placeOrbitShip() {
    ship.x = current.x;
    ship.y = current.y - ship.orbitRadius;
  }

  function movePlanetOnOrbit(p, dt) {
    if (!p.orbitMotion) return;
    p.orbitMotion.angle = (p.orbitMotion.angle + p.orbitMotion.speed * dt + TAU) % TAU;
    p.x = p.orbitMotion.cx + Math.cos(p.orbitMotion.angle) * p.orbitMotion.radius;
    p.y = p.orbitMotion.cy + Math.sin(p.orbitMotion.angle) * p.orbitMotion.radius;
  }

  function futurePlanetPosition(p, seconds, result = {}) {
    if (!p.orbitMotion) { result.x = p.x; result.y = p.y; return result; }
    const angle = p.orbitMotion.angle + p.orbitMotion.speed * seconds;
    result.x = p.orbitMotion.cx + Math.cos(angle) * p.orbitMotion.radius;
    result.y = p.orbitMotion.cy + Math.sin(angle) * p.orbitMotion.radius;
    return result;
  }

  function gravityRange(p) {
    if (p.hazard) return p.gravity ? 210 + p.r * 6 : 0;
    return 190 + p.r * 3.4;
  }

  function gravityVector(p, x, y, seconds = 0, result = {}) {
    result.ax = result.ay = 0;
    const range = gravityRange(p);
    if (!range) return result;
    const future = futurePlanetPosition(p, seconds, positionScratch);
    const dx = future.x - x, dy = future.y - y, distance = Math.max(1, Math.hypot(dx, dy));
    if (distance >= range) return result;
    const proximity = 1 - distance / range;
    const smoothInfluence = proximity * proximity * (3 - 2 * proximity);
    const mass = p.hazard ? Math.abs(p.gravity) : 850000 * (.72 + p.r / 52);
    const polarity = p.hazard && p.gravity < 0 ? -1 : 1;
    const strength = Math.min(p.hazard ? 135 : 190, mass / (distance * distance + 1200) * smoothInfluence) * polarity;
    result.ax = dx / distance * strength; result.ay = dy / distance * strength;
    return result;
  }

  // One integrator for the real flight and its preview. This never consumes items.
  function advanceFlight(body, dt, seconds = 0) {
    let ax = 0, ay = 0;
    for (const p of planets) {
      const force = gravityVector(p, body.x, body.y, seconds, forceScratch);
      ax += force.ax; ay += force.ay;
    }
    body.vx += ax * dt; body.vy += ay * dt;
    for (const f of phenomena) {
      if (f.used) continue;
      const dx = body.x - f.x, dy = body.y - f.y, distance = Math.hypot(dx, dy);
      if (distance >= f.r) continue;
      if (f.type === 'nebula') {
        const drag = Math.exp(-.65 * dt);
        body.vx *= drag; body.vy *= drag;
      } else if (distance >= 1 && (f.type === 'gravityRift' || f.type === 'solarWind')) {
        const strength = (1 - distance / f.r) * (f.type === 'gravityRift' ? 165 : 115);
        if (f.type === 'gravityRift') {
          body.vx -= dy / distance * strength * dt * f.direction;
          body.vy += dx / distance * strength * dt * f.direction;
        } else body.vx += strength * dt * f.direction;
      }
    }
    body.x += body.vx * dt; body.y += body.vy * dt;
  }

  function pointerKey(e) { return Number.isFinite(e?.pointerId) ? e.pointerId : 'keyboard'; }
  function inputPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left - viewX) / viewScale, y: (e.clientY - rect.top - viewY) / viewScale };
  }

  function press(e) {
    if (holding || state !== 'playing' || ship.mode !== 'orbit' || ui.shop.classList.contains('open')) return;
    if (e?.cancelable) e.preventDefault();
    const point = inputPoint(e);
    activePointer = pointerKey(e);
    holding = true; charge = .25; ship.aimAngle = -Math.PI / 2;
    if (Number.isFinite(e?.pointerId)) canvas.setPointerCapture?.(e.pointerId);
    aimStartX = Number.isFinite(e?.clientX) ? point.x : ship.x;
    aimStartY = Number.isFinite(e?.clientY) ? point.y : ship.y - cameraY;
    prediction.stamp = -Infinity;
    ping(230, .025, 'sine');
  }
  function aim(e) {
    if (!holding || pointerKey(e) !== activePointer || state !== 'playing' || ship.mode !== 'orbit') return;
    if (e?.cancelable) e.preventDefault();
    const { x, y } = inputPoint(e);
    const dx = x - aimStartX, dy = y - aimStartY, distance = Math.hypot(dx, dy);
    if (distance > 7) ship.aimAngle = Math.atan2(dy, dx);
    charge = Math.max(.2, Math.min(1, distance / Math.min(190, W * .42)));
    // Keep the latest input immediately, but let the preview use its 50 ms budget.
  }
  function release(e) {
    if (!holding || pointerKey(e) !== activePointer || state !== 'playing' || ship.mode !== 'orbit') return;
    if (e?.cancelable) e.preventDefault();
    cancelAim();
    const tangent = ship.aimAngle;
    const boost = save.boosters > 0 ? 1.15 : 1;
    const speed = (255 + charge * 290) * boost;
    if (save.boosters > 0) { save.boosters -= 1; persist(); toast('IMPULSO +15% ATIVADO'); }
    ship.vx = Math.cos(tangent) * speed;
    ship.vy = Math.sin(tangent) * speed;
    ship.mode = 'flight'; trail = [];
    trailSampleTime = 0;
    burst(ship.x, ship.y, skinColor(), 9, 100);
    ping(520, .07, 'triangle');
  }

  function update(dt) {
    const aimingInSlowMotion = state === 'playing' && ship?.mode === 'orbit' && holding;
    const worldDt = aimingInSlowMotion ? dt * .18 : dt;
    updateSpace(worldDt);
    if (state === 'menu') {
      planets.forEach((p, i) => p.pulse += dt * (.5 + i * .12));
      return;
    }
    if (state === 'over') { updateParticles(dt); return; }
    if (state !== 'playing') return;
    const cameraDelta = cameraTargetY - cameraY;
    cameraY += cameraDelta * Math.min(1, worldDt * 3.5);
    if (Math.abs(cameraDelta) < .35) cameraY = cameraTargetY;
    planets.forEach(p => p.pulse += worldDt * 1.35);
    planets.forEach(p => { if (p !== current) movePlanetOnOrbit(p, worldDt); });
    asteroids.forEach(a => a.rotation += a.spin * worldDt);
    collectibles.forEach(c => c.pulse += worldDt * 3);
    phenomena.forEach(f => f.pulse += worldDt * (f.type === 'mine' ? 3.2 : 1.8));
    updateParticles(worldDt);
    if (ship.mode === 'orbit') {
      placeOrbitShip();
    } else if (ship.mode === 'flight') {
      advanceFlight(ship, dt);
      trailSampleTime += dt;
      if (trailSampleTime + 1e-10 >= 1 / 60) {
        trailSampleTime = Math.max(0, trailSampleTime - 1 / 60);
        trail.push({ x: ship.x, y: ship.y, life: 1 });
        if (trail.length > 34) trail.shift();
      }
      trail.forEach(t => t.life -= dt * 1.8);
      checkCollisions();
      const sy = ship.y - cameraY;
      if (sy > H + 90 || sy < -160 || ship.x < -120 || ship.x > W + 120) lose();
    }
  }

  function checkCollisions() {
    for (const p of planets) {
      const dx = ship.x - p.x, dy = ship.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < p.r + 8) {
        if (p.target) land(p, d);
        else if (consumePhase(p.x, p.y)) planets = planets.filter(q => q !== p);
        else lose();
        return;
      }
    }
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      if (Math.hypot(ship.x - a.x, ship.y - a.y) < a.r + 7) {
        if (consumePhase(a.x, a.y)) asteroids.splice(i, 1); else lose();
        return;
      }
    }
    for (const c of collectibles) {
      if (!c.collected && Math.hypot(ship.x - c.x, ship.y - c.y) < c.r + 11) {
        c.collected = true; save.coins += 15; runDust += 15; recordMission('dust', runDust); persist(); burst(c.x, c.y, '#ffcf5c', 18, 120); ping(980, .08, 'sine'); toast('+15 POEIRA ESTELAR');
      }
    }
    for (const f of phenomena) {
      if (f.used || ['nebula', 'gravityRift', 'solarWind'].includes(f.type)) continue;
      if (Math.hypot(ship.x - f.x, ship.y - f.y) >= f.r + 8) continue;
      if (f.type === 'mine') {
        if (consumePhase(f.x, f.y)) f.used = true; else lose();
        return;
      }
      f.used = true;
      recordMission('power', 1);
      if (f.type === 'shieldOrb') {
        save.shields += 1; persist(); burst(f.x, f.y, '#6ee7ff', 22, 145); ping(1120, .1, 'sine'); toast('ESCUDO ENCONTRADO');
      } else if (f.type === 'boostGate') {
        ship.vx *= 1.18; ship.vy *= 1.18; save.coins += 8; runDust += 8; recordMission('dust', runDust); persist(); burst(f.x, f.y, '#ffcf5c', 20, 160); ping(760, .08, 'triangle'); toast('PORTAL DE IMPULSO · +8 POEIRA');
      } else if (f.type === 'phaseOrb') {
        phaseCharges = Math.min(2, phaseCharges + 1); persist(); burst(f.x, f.y, '#c894ff', 24, 150); ping(1240, .1, 'sine'); toast('FASE QUÂNTICA · ATRAVESSE 1 AMEAÇA');
      } else if (f.type === 'starCache') {
        save.coins += 35; runDust += 35; recordMission('dust', runDust); persist(); burst(f.x, f.y, '#ffcf5c', 26, 165); ping(1040, .12, 'triangle'); toast('RESERVA ESTELAR · +35 POEIRA');
      }
    }
  }

  function consumePhase(x, y) {
    if (phaseCharges < 1) return false;
    phaseCharges -= 1; burst(x, y, '#c894ff', 30, 190); ping(1320, .12, 'sine'); toast('FASE QUÂNTICA ATIVADA');
    return true;
  }

  function updateSpecialEvent(dt) {
    if (!specialEvent) return;
    const remaining = specialEvent.remaining = Math.max(0, specialEvent.remaining - dt * 1000);
    ui.eventTimer.textContent = `${(remaining / 1000).toFixed(1)}s`;
    if (remaining > 0) return;
    specialEvent = null; ui.eventBanner.hidden = true; ping(150, .14, 'sawtooth'); toast('CORRIDA ENCERRADA · CONTINUE A VIAGEM');
  }

  function updateEventAfterLanding() {
    if (specialEvent && score >= specialEvent.targetScore) {
      const reward = specialEvent.reward;
      specialEvent = null; ui.eventBanner.hidden = true; save.coins += reward; runDust += reward;
      recordMission('dust', runDust); persist(); burst(current.x, current.y, '#ffcf5c', 34, 210); ping(1320, .16, 'triangle'); toast(`CORRIDA VENCIDA · +${reward} POEIRA`);
      return;
    }
    const sector = score + 1;
    if (sector % 10 !== 0) return;
    specialEvent = { remaining: 18000, targetScore: score + 3, reward: 100 + sector / 10 * 25 };
    ui.eventTimer.textContent = '18.0s'; ui.eventBanner.hidden = false; ping(880, .12, 'square'); toast('EVENTO: POUSE EM 3 PLANETAS EM 18 SEGUNDOS');
  }

  function land(p) {
    const speed = Math.hypot(ship.vx, ship.vy);
    const centerHit = speed < 480;
    score += 1; streak = centerHit ? streak + 1 : 0;
    const reward = 3 + Math.min(12, streak * 2);
    save.coins += reward; runDust += reward; save.best = Math.max(save.best, score);
    recordMission('reach', score); recordMission('dust', runDust); recordMission('land', 1);
    if (centerHit) recordMission('perfect', 1);
    if (!runShieldUsed) recordMission('noShield', score);
    persist();
    updateEventAfterLanding();
    ui.score.textContent = score;
    ui.sector.textContent = `SETOR ${String(score + 1).padStart(2, '0')}`;
    p.target = false; p.visited = true; p.orbitMotion = null; current = p;
    ship.mode = 'orbit'; ship.orbitRadius = current.r + 19;
    prediction.stamp = -Infinity;
    ship.aimAngle = -Math.PI / 2;
    charge = .35;
    cameraTargetY = current.y - H * .66;
    burst(p.x, p.y, p.color, centerHit ? 24 : 14, 155);
    ping(700 + Math.min(score, 12) * 28, .1, 'sine');
    if (centerHit && streak >= 2) popCombo(streak);
    planets = [current];
    asteroids = [];
    collectibles = [];
    phenomena = [];
    spawnTargets();
  }

  function lose() {
    if (state !== 'playing') return;
    if (save.shields > 0) {
      save.shields -= 1; runShieldUsed = true; persist(); holding = false; ship.mode = 'orbit'; ship.vx = ship.vy = 0; ship.aimAngle = -Math.PI / 2; placeOrbitShip();
      prediction.stamp = -Infinity;
      burst(current.x, current.y, '#6ee7ff', 26, 150); ping(820, .12, 'sine'); toast('ESCUDO DE EMERGÊNCIA ATIVADO'); return;
    }
    state = 'over'; holding = false; specialEvent = null; ui.eventBanner.hidden = true; save.runs += 1; persist();
    ui.quitButton.hidden = true; ui.quitConfirm.hidden = true; stopMusic();
    burst(ship.x, ship.y, skinColor(), 30, 210);
    ping(110, .22, 'sawtooth');
    setTimeout(() => {
      ui.final.textContent = score;
      ui.result.textContent = score >= save.best && score > 0 ? 'Novo recorde. O próximo planeta espera.' : score < 3 ? 'A próxima órbita é sua.' : 'Você chegou mais longe desta vez.';
      ui.continueButton.style.display = continued ? 'none' : 'flex';
      ui.over.classList.add('active');
    }, 420);
    if (save.runs >= 3 && (save.runs - 3) % 2 === 0) {
      window.OrbitaAds.showInterstitial('game-over').catch(() => {});
    }
  }

  async function continueRun() {
    ui.continueButton.disabled = true;
    const ad = await rewardedAd('continue-run');
    ui.continueButton.disabled = false;
    if (!ad.rewarded) return toast(rewardFailure(ad));
    continued = true; ui.over.classList.remove('active'); state = 'playing';
    ui.quitButton.hidden = false; startMusic();
    ship.mode = 'orbit'; ship.aimAngle = -Math.PI / 2; ship.vx = ship.vy = 0; placeOrbitShip();
    toast('Sinal recuperado!'); ping(620, .12, 'sine');
    wakeLoop();
  }

  function restart() { begin(); }

  function openQuitConfirm() {
    if (state !== 'playing') return;
    cancelAim(); state = 'paused'; stopMusic(); stopLoop(); requestFrame();
    const penalty = Math.floor(runDust * .3);
    ui.quitCopy.textContent = penalty > 0
      ? `Você conquistou ✦ ${runDust} nesta rodada e perderá ✦ ${penalty}.`
      : 'Você ainda não conquistou poeira nesta rodada.';
    ui.quitConfirm.hidden = false;
  }

  function cancelQuit() {
    if (state !== 'paused') return;
    ui.quitConfirm.hidden = true; state = 'playing'; startMusic(); wakeLoop();
  }

  function confirmQuit() {
    if (state !== 'paused') return;
    const penalty = Math.min(save.coins, Math.floor(runDust * .3));
    save.coins -= penalty; save.best = Math.max(save.best, score); save.runs += 1; persist();
    state = 'over'; continued = true; specialEvent = null; ui.eventBanner.hidden = true; ui.quitConfirm.hidden = true; ui.quitButton.hidden = true; stopMusic();
    ui.final.textContent = score;
    ui.result.textContent = penalty ? `Viagem encerrada. Você perdeu ✦ ${penalty}.` : 'Viagem encerrada sem perda de poeira.';
    ui.continueButton.style.display = 'none'; ui.over.classList.add('active');
    wakeLoop();
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = Math.random() * speed;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .5 + Math.random() * .6, max: 1, color, r: 1 + Math.random() * 2.5 });
    }
  }
  function updateParticles(dt) {
    const drag = Math.pow(.985, dt * 60);
    let alive = 0;
    for (const p of particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= drag; p.vy *= drag;
      particles[alive++] = p;
    }
    particles.length = alive;
  }

  function updateSpace(dt) {
    for (const c of comets) {
      c.life -= dt;
      if (c.life > 0) continue;
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.x > W + 140 || c.y > H + 100) Object.assign(c, makeComet(Math.random, 3 + Math.random() * 6));
    }
  }

  function draw(time) {
    ctx.fillStyle = '#07091a';
    ctx.fillRect(-viewX / viewScale, -viewY / viewScale, viewportW / viewScale, viewportH / viewScale);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    drawBackground(time);
    drawComets();
    ctx.save();
    ctx.translate(0, -cameraY);
    for (const f of phenomena) if (f.type === 'nebula') drawPhenomenon(f);
    planets.forEach(drawPlanet);
    asteroids.forEach(drawAsteroid);
    collectibles.forEach(drawCollectible);
    for (const f of phenomena) if (f.type !== 'nebula') drawPhenomenon(f);
    drawParticles();
    if (state !== 'menu' && ship) drawShip();
    ctx.restore();
    if (state === 'playing' && holding) drawCharge();
    ctx.restore();
  }

  function drawBackground(time) {
    const density = Math.min(1, dpr * viewScale);
    const width = Math.max(1, Math.round(W * density)), height = Math.max(1, Math.round(H * density));
    if (backgroundLayer.width !== width || backgroundLayer.height !== height) {
      backgroundLayer.width = width; backgroundLayer.height = height;
      backgroundCtx.setTransform(width / W, 0, 0, height / H, 0, 0);
      backgroundGradient = null; backgroundStamp = -Infinity;
    }
    // Twinkle/drift are slow. Preserve full-rate parallax whenever the camera moves.
    if (time - backgroundStamp >= 50 || cameraY !== backgroundCamera) {
      if (perfSample) perfSample.backgrounds++;
      if (!backgroundGradient) {
        backgroundGradient = backgroundCtx.createRadialGradient(W * .5, H * .32, 0, W * .5, H * .35, H * .9);
        backgroundGradient.addColorStop(0, '#171944'); backgroundGradient.addColorStop(.58, '#090b23'); backgroundGradient.addColorStop(1, '#050615');
      }
      backgroundCtx.fillStyle = backgroundGradient; backgroundCtx.fillRect(0, 0, W, H);
      drawNebulae(time, backgroundCtx); drawStars(time, backgroundCtx);
      backgroundStamp = time; backgroundCamera = cameraY;
    }
    ctx.drawImage(backgroundLayer, 0, 0, W, H);
  }

  function inCamera(entity, radius) {
    const y = entity.y - cameraY;
    return entity.x + radius >= 0 && entity.x - radius <= W && y + radius >= 0 && y - radius <= H;
  }

  function drawStars(time, target = ctx) {
    target.save();
    for (const s of stars) {
      const y = ((s.y - cameraY * .12) % H + H) % H;
      target.globalAlpha = s.a * (.75 + Math.sin(time * .0015 + s.p) * .25);
      target.fillStyle = '#dfe5ff'; target.beginPath(); target.arc(s.x, y, s.r, 0, TAU); target.fill();
    }
    target.restore();
  }

  function drawNebulae(time, target = ctx) {
    target.save(); target.globalCompositeOperation = 'screen';
    for (const n of nebulae) {
      const x = n.x + Math.sin(time * n.drift * .001) * 28;
      const y = ((n.y - cameraY * .035) % (H + n.r * 2) + H + n.r * 2) % (H + n.r * 2) - n.r;
      if (x + n.r >= 0 && x - n.r <= W && y + n.r >= 0 && y - n.r <= H) target.drawImage(n.sprite, x - n.r, y - n.r);
    }
    target.restore();
  }

  function drawComets() {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const c of comets) {
      if (c.life > 0) continue;
      const len = 58, angle = Math.atan2(c.vy, c.vx);
      const g = ctx.createLinearGradient(c.x, c.y, c.x - Math.cos(angle) * len, c.y - Math.sin(angle) * len);
      g.addColorStop(0, '#ffffffdd'); g.addColorStop(.18, '#6ee7ffaa'); g.addColorStop(1, '#6ee7ff00');
      ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - Math.cos(angle) * len, c.y - Math.sin(angle) * len); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(c.x, c.y, 2.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawGlow(x, y, radius, color, blur = 16, strength = 1) {
    const core = Math.ceil(radius / 2) * 2, spread = Math.ceil(blur / 4) * 4;
    const key = `${core}:${spread}:${color}`;
    let sprite = glowSprites.get(key);
    if (!sprite) {
      const extent = core + spread * 2;
      sprite = document.createElement('canvas'); sprite.width = sprite.height = extent * 2;
      const layer = sprite.getContext('2d');
      const solid = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
      const g = layer.createRadialGradient(extent, extent, core * .7, extent, extent, extent);
      g.addColorStop(0, `${solid}66`); g.addColorStop(.3, `${solid}33`); g.addColorStop(1, `${solid}00`);
      layer.fillStyle = g; layer.fillRect(0, 0, sprite.width, sprite.height);
      // Bounded across an infinite run; colours/radii from old sectors cannot accumulate.
      if (glowSprites.size >= 48) glowSprites.delete(glowSprites.keys().next().value);
      glowSprites.set(key, sprite);
    }
    ctx.save(); ctx.globalAlpha *= strength;
    ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2); ctx.restore();
  }

  function planetBody(p) {
    let body = planetBodies.get(p);
    if (body) return body;
    const radius = Math.ceil(p.r / 2) * 2;
    const variant = p.hazard ? (p.hazardType === 'pulsar' ? 'pulsar' : 'hazard') : p.color;
    const key = `${radius}:${variant}`;
    body = bodySprites.get(key);
    if (body) {
      bodySprites.delete(key); bodySprites.set(key, body);
      planetBodies.set(p, body); return body;
    }
    if (perfSample) perfSample.bodies++;
    const size = radius * 2 + 2;
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = Math.ceil(size * 1.5);
    const layer = sprite.getContext('2d');
    layer.setTransform(sprite.width / size, 0, 0, sprite.height / size, 0, 0);
    const center = size / 2;
    const g = layer.createRadialGradient(center - radius * .34, center - radius * .38, radius * .05, center, center, radius);
    if (p.hazardType === 'pulsar') { g.addColorStop(0, '#ffffff'); g.addColorStop(.22, '#9cf4ff'); g.addColorStop(.62, '#256fa8'); g.addColorStop(1, '#07152d'); }
    else if (p.hazard) { g.addColorStop(0, '#171a2f'); g.addColorStop(.75, '#03040b'); g.addColorStop(1, '#000'); }
    else { g.addColorStop(0, tint(p.color, 62)); g.addColorStop(.44, p.color); g.addColorStop(1, tint(p.color, -48)); }
    layer.fillStyle = g; layer.beginPath(); layer.arc(center, center, radius, 0, TAU); layer.fill();
    body = { sprite, radius, size };
    if (bodySprites.size >= 64) bodySprites.delete(bodySprites.keys().next().value);
    bodySprites.set(key, body); planetBodies.set(p, body);
    return body;
  }

  function drawPlanet(p) {
    if (!inCamera(p, Math.max(p.r * 5, p.r + 64))) return;
    ctx.save();
    if (!p.hazard && ship && state === 'playing') {
      const range = gravityRange(p), distance = Math.hypot(ship.x - p.x, ship.y - p.y);
      if (distance < range) {
        const pull = 1 - distance / range;
        ctx.globalAlpha = .08 + pull * .2; ctx.strokeStyle = '#9cf4ff'; ctx.lineWidth = 1 + pull;
        ctx.setLineDash([2, 7]); ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 18 + Math.sin(p.pulse * 2) * 3, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }
    if (!p.hazard && p.style === 1) {
      ctx.globalAlpha = .55; ctx.strokeStyle = tint(p.color, 28); ctx.lineWidth = Math.max(2, p.r * .1);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.55, p.r * .36, -.32, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (!p.hazard) {
      ctx.globalAlpha = .12; ctx.strokeStyle = p.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 2.25, p.r * .68, -.18, 0, TAU); ctx.stroke();
      ctx.globalAlpha = .06; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 2.8, p.r * .92, -.18, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    drawGlow(p.x, p.y, p.r, p.color, p.hazard ? 24 : 16, p.target ? .8 + Math.sin(p.pulse * 3) * .2 : .65);
    const body = planetBody(p), size = body.size * p.r / body.radius;
    ctx.drawImage(body.sprite, p.x - size / 2, p.y - size / 2, size, size);
    if (!p.hazard) {
      if (p.style === 2) {
        ctx.save();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 1, 0, TAU); ctx.clip();
        const surfaceSpin = ((p.pulse * p.r * .62 + p.seed * 13) % (p.r * 2.8)) - p.r * 1.4;
        ctx.globalAlpha = .2; ctx.strokeStyle = tint(p.color, 72); ctx.lineWidth = Math.max(2, p.r * .11);
        for (let band = -1; band <= 1; band++) {
          ctx.beginPath();
          ctx.ellipse(p.x + surfaceSpin + band * p.r * 1.4, p.y, p.r * .4, p.r * 1.08, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = .12; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, p.r * .045);
        ctx.beginPath(); ctx.ellipse(p.x, p.y - p.r * .28, p.r * .94, p.r * .18, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * .3, p.r * .9, p.r * .16, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      } else if (p.style === 3) {
        ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 1, 0, TAU); ctx.clip();
        ctx.globalAlpha = .32; ctx.fillStyle = '#85f0c0';
        for (let i = 0; i < 4; i++) {
          const a = p.seed + i * 1.8 + p.pulse * .18;
          ctx.beginPath(); ctx.ellipse(p.x + Math.cos(a) * p.r * .48, p.y + Math.sin(a * 1.3) * p.r * .32, p.r * .3, p.r * .15, a, 0, TAU); ctx.fill();
        }
        ctx.restore();
      } else if (p.style === 4) {
        ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 1, 0, TAU); ctx.clip();
        ctx.globalAlpha = .75; ctx.strokeStyle = '#ffb24d'; ctx.lineWidth = Math.max(1, p.r * .055);
        for (let i = 0; i < 4; i++) {
          const a = p.seed * .3 + i * 1.55;
          ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * p.r * .12, p.y + Math.sin(a) * p.r * .12); ctx.lineTo(p.x + Math.cos(a + .25) * p.r * .52, p.y + Math.sin(a + .25) * p.r * .52); ctx.lineTo(p.x + Math.cos(a - .08) * p.r, p.y + Math.sin(a - .08) * p.r); ctx.stroke();
        }
        ctx.restore();
      } else if (p.style === 5) {
        ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 1, 0, TAU); ctx.clip();
        ctx.globalAlpha = .55; ctx.strokeStyle = '#e9fbff'; ctx.lineWidth = Math.max(1, p.r * .045);
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6 + p.seed; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r); ctx.stroke();
        }
        ctx.restore();
      } else if (p.style === 6) {
        ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 1, 0, TAU); ctx.clip();
        ctx.globalAlpha = .28; ctx.fillStyle = '#ffdb72';
        for (let i = 0; i < 7; i++) {
          const a = p.seed + i * .94 + p.pulse * .1, rr = p.r * (.2 + (i % 3) * .18);
          ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * rr, p.y + Math.sin(a * 1.2) * rr, p.r * .12, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = p.style < 2 ? .18 : .24; ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) {
        const surfaceTurn = p.style < 2 ? 0 : p.pulse * .72;
        const a = ((p.seed * .17 + i * 2.1 + surfaceTurn) % TAU), rr = p.r * (.12 + (i % 2) * .08);
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * p.r * .45, p.y + Math.sin(a) * p.r * .4, rr, 0, TAU); ctx.fill();
      }
    } else if (p.hazardType === 'pulsar') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.pulse * .9); ctx.strokeStyle = '#9cf4ffbb'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-p.r * 4.5, 0); ctx.lineTo(p.r * 4.5, 0); ctx.stroke();
      ctx.globalAlpha = .4; ctx.beginPath(); ctx.arc(0, 0, p.r * (1.8 + Math.sin(p.pulse * 2) * .2), 0, TAU); ctx.stroke(); ctx.restore();
    } else {
      for (let ring = 0; ring < 3; ring++) {
        ctx.globalAlpha = .65 - ring * .16; ctx.strokeStyle = ring === 1 ? '#6ee7ff' : '#c081ff'; ctx.lineWidth = 2 - ring * .35;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * (1.65 + ring * .38), p.r * (.36 + ring * .1), p.pulse * .22 - .35, 0, TAU); ctx.stroke();
      }
    }
    if (p.target) {
      ctx.globalAlpha = .55; ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 9 + Math.sin(p.pulse * 3) * 3, 0, TAU); ctx.stroke();
    }
    if (!p.hazard && p.style === 0) {
      const moonA = p.pulse * .55 + p.seed;
      const mx = p.x + Math.cos(moonA) * p.r * 1.65, my = p.y + Math.sin(moonA) * p.r * .7;
      ctx.globalAlpha = .85; ctx.fillStyle = '#dbe2ff'; drawGlow(mx, my, Math.max(2.5, p.r * .11), '#9eb3ff', 8);
      ctx.beginPath(); ctx.arc(mx, my, Math.max(2.5, p.r * .11), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawAsteroid(a) {
    if (!inCamera(a, a.r + 2)) return;
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rotation); ctx.fillStyle = '#5e6178'; ctx.strokeStyle = '#949ab7'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * TAU, rr = a.r * (.72 + .28 * Math.sin(a.seed + i * 2.3));
      const px = Math.cos(angle) * rr, py = Math.sin(angle) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = .35; ctx.fillStyle = '#111522'; ctx.beginPath(); ctx.arc(-a.r * .18, -a.r * .12, a.r * .22, 0, TAU); ctx.fill(); ctx.restore();
  }

  function drawCollectible(c) {
    if (c.collected || !inCamera(c, c.r * 1.2 + 64)) return;
    const pulse = 1 + Math.sin(c.pulse) * .18;
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(pulse, pulse); ctx.rotate(c.pulse * .18); drawGlow(0, 0, c.r, '#ffcf5c', 18); ctx.fillStyle = '#ffcf5c';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 4, r = i % 2 ? c.r * .42 : c.r;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function drawPhenomenon(f) {
    if (f.used || !inCamera(f, f.r * 1.4 + 64)) return;
    ctx.save(); ctx.translate(f.x, f.y);
    if (f.type === 'nebula') {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, f.r);
      g.addColorStop(0, '#7c5cff38'); g.addColorStop(.55, '#4a3fa925'); g.addColorStop(1, '#35206a00');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, f.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = .2; ctx.strokeStyle = '#b49cff'; ctx.setLineDash([3, 8]); ctx.beginPath(); ctx.arc(0, 0, f.r * .82, 0, TAU); ctx.stroke();
    } else if (f.type === 'shieldOrb') {
      const scale = 1 + Math.sin(f.pulse) * .08; ctx.scale(scale, scale);
      drawGlow(0, 0, f.r, '#6ee7ff', 18); ctx.fillStyle = '#6ee7ff35'; ctx.strokeStyle = '#9cf4ff'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * TAU / 6; i ? ctx.lineTo(Math.cos(a) * f.r, Math.sin(a) * f.r) : ctx.moveTo(Math.cos(a) * f.r, Math.sin(a) * f.r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, f.r * .38, 0, TAU); ctx.stroke();
    } else if (f.type === 'boostGate') {
      ctx.rotate(f.pulse * .35); drawGlow(0, 0, f.r, '#ffcf5c', 16); ctx.strokeStyle = '#ffcf5c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, f.r, -.3, Math.PI + .3); ctx.stroke();
      ctx.globalAlpha = .45; ctx.beginPath(); ctx.arc(0, 0, f.r * .65, Math.PI - .3, TAU + .3); ctx.stroke();
    } else if (f.type === 'phaseOrb') {
      ctx.rotate(-f.pulse * .28); drawGlow(0, 0, f.r, '#c894ff', 20); ctx.strokeStyle = '#e6c8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, f.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(0, 0, f.r * .48, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-f.r * .8, 0); ctx.lineTo(f.r * .8, 0); ctx.stroke();
    } else if (f.type === 'starCache') {
      ctx.rotate(f.pulse * .22); drawGlow(0, 0, f.r, '#ffcf5c', 22); ctx.fillStyle = '#ffcf5c';
      ctx.beginPath();
      for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + i * TAU / 12, r = i % 2 ? f.r * .42 : f.r; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
    } else if (f.type === 'gravityRift') {
      ctx.rotate(f.pulse * .18 * f.direction); ctx.globalAlpha = .72; ctx.strokeStyle = '#c081ff'; drawGlow(0, 0, f.r, '#7c5cff', 18);
      for (let i = 0; i < 3; i++) {
        ctx.lineWidth = 2 - i * .4; ctx.beginPath(); ctx.arc(0, 0, f.r * (.34 + i * .24), i * 1.1, i * 1.1 + Math.PI * 1.45); ctx.stroke();
      }
      ctx.globalAlpha = .18; ctx.fillStyle = '#7c5cff'; ctx.beginPath(); ctx.arc(0, 0, f.r, 0, TAU); ctx.fill();
    } else if (f.type === 'solarWind') {
      ctx.globalAlpha = .16; ctx.fillStyle = '#ffb45c'; ctx.beginPath(); ctx.arc(0, 0, f.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = .75; ctx.strokeStyle = '#ffd58a'; ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) {
        const y = i * f.r * .34 + Math.sin(f.pulse + i) * 3;
        ctx.beginPath(); ctx.moveTo(-f.r * f.direction, y); ctx.quadraticCurveTo(0, y - 7 * f.direction, f.r * f.direction, y); ctx.stroke();
      }
    } else if (f.type === 'mine') {
      ctx.rotate(f.pulse * .18); drawGlow(0, 0, f.r, '#ff4f91', 18); ctx.fillStyle = '#ff4f91'; ctx.strokeStyle = '#ff9fc1';
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * TAU / 16, r = i % 2 ? f.r * .55 : f.r * (1.25 + Math.sin(f.pulse) * .12); i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawShip() {
    if (ship.mode === 'flight') {
      ctx.save();
      for (let i = 0; i < trail.length; i++) {
        const t = trail[i]; ctx.globalAlpha = Math.max(0, t.life) * (i / trail.length) * .55;
        ctx.fillStyle = trailColor(i); ctx.beginPath(); ctx.arc(t.x, t.y, 1 + i / trail.length * 3, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    const angle = ship.mode === 'flight' ? Math.atan2(ship.vy, ship.vx) + Math.PI / 2 : ship.aimAngle + Math.PI / 2;
    ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(angle); drawGlow(0, 0, 12, skinColor(), 14); ctx.fillStyle = skinColor();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(2, 6); ctx.lineTo(0, 12); ctx.lineTo(-2, 6); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#151933'; ctx.beginPath(); ctx.arc(0, -2, 2.8, 0, TAU); ctx.fill();
    if (phaseCharges > 0) {
      ctx.globalAlpha = .72; ctx.strokeStyle = '#d9adff'; ctx.lineWidth = 1.6; drawGlow(0, 0, 15, '#c894ff', 12);
      ctx.beginPath(); ctx.arc(0, 0, 15 + Math.sin(performance.now() * .008) * 1.5, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    if (ship.mode === 'orbit') drawPrediction();
  }

  function tracePrediction() {
    if (perfSample) perfSample.predictions++;
    const speed = (255 + charge * 290) * (save.boosters > 0 ? 1.15 : 1);
    const body = { x: ship.x, y: ship.y, vx: Math.cos(ship.aimAngle) * speed, vy: Math.sin(ship.aimAngle) * speed };
    const previewBoosts = new Set();
    prediction.count = 0; prediction.outcome = 'open';
    for (let i = 0; i < 184; i++) {
      const seconds = (i + 1) * STEP;
      advanceFlight(body, STEP, seconds);
      prediction.points[i * 2] = body.x; prediction.points[i * 2 + 1] = body.y;
      prediction.count++;
      for (const p of planets) {
        const future = futurePlanetPosition(p, seconds, positionScratch);
        if (Math.hypot(body.x - future.x, body.y - future.y) < p.r + 8) {
          prediction.outcome = p.target ? 'safe' : 'danger'; break;
        }
      }
      if (prediction.outcome === 'open') for (const a of asteroids) {
        if (Math.hypot(body.x - a.x, body.y - a.y) < a.r + 7) { prediction.outcome = 'danger'; break; }
      }
      if (prediction.outcome !== 'open') break;
      for (const f of phenomena) {
        if (f.used || Math.hypot(body.x - f.x, body.y - f.y) >= f.r + 8) continue;
        if (f.type === 'mine') { prediction.outcome = 'danger'; break; }
        if (f.type === 'boostGate' && !previewBoosts.has(f)) {
          previewBoosts.add(f); body.vx *= 1.18; body.vy *= 1.18;
        }
      }
      if (prediction.outcome !== 'open') break;
    }
    prediction.path = typeof Path2D === 'function' ? new Path2D() : null;
    if (prediction.path) buildPredictionPath(prediction.path);
    prediction.stamp = performance.now();
    return prediction;
  }

  function buildPredictionPath(target) {
    target.moveTo(ship.x, ship.y);
    // Physics still checks every 1/120 s; the visual polyline samples every 1/30 s.
    for (let i = 3; i < prediction.count; i += 4) target.lineTo(prediction.points[i * 2], prediction.points[i * 2 + 1]);
    if (prediction.count && prediction.count % 4) {
      const lastPoint = (prediction.count - 1) * 2;
      target.lineTo(prediction.points[lastPoint], prediction.points[lastPoint + 1]);
    }
  }

  function drawPrediction() {
    // Input invalidates immediately; moving targets refresh at most 20 times/s.
    if (performance.now() - prediction.stamp >= 50) tracePrediction();
    const routeColor = prediction.outcome === 'safe' ? '#70f0aa' : prediction.outcome === 'danger' ? '#c081ff' : '#6ee7ff';
    ctx.save();
    ctx.strokeStyle = routeColor; ctx.lineWidth = holding ? 2 : 1.3; ctx.setLineDash([3, 7]); ctx.globalAlpha = holding ? .9 : .48;
    if (prediction.path) ctx.stroke(prediction.path);
    else { ctx.beginPath(); buildPredictionPath(ctx); ctx.stroke(); }
    ctx.setLineDash([]);
    for (let i = 0; i < prediction.count; i += 16) {
      ctx.globalAlpha = (1 - i / prediction.count) * (holding ? .9 : .52); ctx.fillStyle = routeColor;
      ctx.beginPath(); ctx.arc(prediction.points[i * 2], prediction.points[i * 2 + 1], 2.8, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save(); particles.forEach(p => { if (!inCamera(p, p.r + 1)) return; ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }); ctx.restore();
  }

  function drawCharge() {
    const w = Math.min(220, W * .54), x = (W - w) / 2, y = H - Math.max(38, safeBottom + 22);
    ctx.save(); ctx.fillStyle = '#11152fd9'; roundRect(x, y, w, 10, 5); ctx.fill();
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#6ee7ff'); g.addColorStop(.7, '#7c5cff'); g.addColorStop(1, '#ffcf5c');
    ctx.fillStyle = g; roundRect(x + 2, y + 2, (w - 4) * charge, 6, 3); ctx.fill(); ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, w), h, r); }

  function popCombo(n) {
    ui.combo.textContent = `${n >= 4 ? 'IMPECÁVEL' : 'PERFEITO'} ×${n}`;
    ui.combo.classList.remove('pop'); void ui.combo.offsetWidth; ui.combo.classList.add('pop');
  }
  function toast(message) {
    ui.toast.textContent = message; ui.toast.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => ui.toast.classList.remove('show'), 1800);
  }
  function skinColor() { return skins.find(s => s.id === save.selected)?.color || '#fff'; }
  function trailColor(index = 0) {
    if (save.selectedTrail === 'aurora') return ['#70f0aa', '#6ee7ff', '#d9adff'][index % 3];
    return trails.find(t => t.id === save.selectedTrail)?.color || skinColor();
  }
  function tint(hex, amount) {
    const n = parseInt(hex.slice(1), 16), r = Math.max(0, Math.min(255, (n >> 16) + amount)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount)), b = Math.max(0, Math.min(255, (n & 255) + amount));
    return `rgb(${r},${g},${b})`;
  }
  function ensureAudio() {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch {}
  }
  function tone(freq, duration, type = 'sine', volume = .02, delay = 0) {
    if (!save.sound) return;
    try {
      ensureAudio();
      const startAt = audioCtx.currentTime + delay, o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, startAt);
      gain.gain.setValueAtTime(.0001, startAt); gain.gain.exponentialRampToValueAtTime(volume, startAt + .018); gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
      o.connect(gain).connect(audioCtx.destination); o.start(startAt); o.stop(startAt + duration + .02);
    } catch {}
  }
  function ping(freq, duration, type) { tone(freq, duration, type, .055); }
  function musicBeat() {
    if (!save.sound || state !== 'playing') return;
    const roots = [110, 123.47, 98, 130.81], root = roots[Math.floor(score / 6) % roots.length];
    const scale = [1, 1.1892, 1.3348, 1.4983, 1.7818, 2];
    const bpm = 68 + Math.min(72, score * 1.45), beatMs = 60000 / bpm;
    if (musicStep % 4 === 0) tone(root, beatMs * .0034, 'sine', .012);
    if (musicStep % 2 === 0) tone(root / 2, beatMs * .0015, 'triangle', .018);
    if (score >= 4) tone(root * scale[(musicStep + Math.floor(score / 3)) % scale.length], beatMs * .0011, 'sine', .009);
    if (score >= 10 && musicStep % 2) tone(root * 4, .035, 'square', .0045);
    if (score >= 18 && musicStep % 4 === 2) tone(root * 1.4983, beatMs * .0022, 'triangle', .007);
    if (score >= 30) tone(root * scale[(musicStep * 2 + 1) % scale.length] * 2, .06, 'sine', .005, beatMs * .00035);
    musicStep = (musicStep + 1) % 32;
    musicTimer = setTimeout(musicBeat, beatMs);
  }
  function startMusic() {
    stopMusic(); musicStep = 0;
    if (!save.sound || state !== 'playing') return;
    ensureAudio(); musicTimer = setTimeout(musicBeat, 120);
  }
  function stopMusic() { clearTimeout(musicTimer); musicTimer = null; }
  function mulberry32(a) { return () => { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function renderSkins() {
    ui.skins.innerHTML = '';
    skins.forEach(s => {
      const owned = save.owned.includes(s.id), selected = save.selected === s.id;
      const button = document.createElement('button');
      button.className = `skin ${selected ? 'selected' : ''} ${owned ? '' : 'locked'}`;
      button.innerHTML = `<span class="ship-preview" style="--ship:${s.color}"></span><b>${s.name}</b><small>${selected ? 'EM USO' : owned ? 'USAR' : `✦ ${s.cost}`}</small>`;
      button.addEventListener('click', () => {
        if (owned) save.selected = s.id;
        else if (save.coins >= s.cost) { save.coins -= s.cost; save.owned.push(s.id); save.selected = s.id; ping(860, .1, 'sine'); }
        else return toast(`Faltam ${s.cost - save.coins} de poeira estelar.`);
        persist(); renderSkins();
      });
      ui.skins.appendChild(button);
    });
  }

  function renderTrails() {
    ui.trails.innerHTML = '';
    trails.forEach(t => {
      const owned = save.ownedTrails.includes(t.id), selected = save.selectedTrail === t.id;
      const button = document.createElement('button'); button.className = `trail-card ${selected ? 'selected' : ''}`;
      button.innerHTML = `<span class="trail-line" style="--trail:${t.color}"></span><b>${t.name}</b><small>${selected ? 'EM USO' : owned ? 'USAR' : `✦ ${t.cost}`}</small>`;
      button.addEventListener('click', () => {
        if (owned) save.selectedTrail = t.id;
        else if (save.coins >= t.cost) { save.coins -= t.cost; save.ownedTrails.push(t.id); save.selectedTrail = t.id; }
        else return toast(`Faltam ${t.cost - save.coins} de poeira estelar.`);
        persist(); renderTrails();
      });
      ui.trails.appendChild(button);
    });
  }

  function renderItems() {
    ui.items.innerHTML = '';
    [
      { id: 'shield', name: 'Escudo de emergência', copy: `Salva uma viagem · Você tem ${save.shields}`, cost: 250 },
      { id: 'booster', name: 'Impulso quântico', copy: `+15% no próximo salto · Você tem ${save.boosters}`, cost: 180 }
    ].forEach(item => {
      const button = document.createElement('button'); button.className = 'item-card';
      button.innerHTML = `<span>✦ ${item.cost}</span><b>${item.name}</b><small>${item.copy}</small>`;
      button.addEventListener('click', () => {
        if (save.coins < item.cost) return toast(`Faltam ${item.cost - save.coins} de poeira estelar.`);
        save.coins -= item.cost; if (item.id === 'shield') save.shields += 1; else save.boosters += 1;
        persist(); renderItems(); toast(`${item.name} adquirido.`);
      });
      ui.items.appendChild(button);
    });
  }

  function renderMissions() {
    ui.missionList.innerHTML = '';
    for (const mission of dailyMissions()) {
      const progress = Math.min(mission.target, save.missionProgress[mission.id] || 0);
      const complete = progress >= mission.target, claimed = save.missionClaimed.includes(mission.id);
      const card = document.createElement('article');
      card.className = `mission-card ${complete ? 'complete' : ''}`;
      card.innerHTML = `<div><h3>${mission.title}</h3><p>${mission.copy} · ${progress}/${mission.target}</p></div><button class="mission-reward ${claimed ? 'claimed' : ''}" ${complete && !claimed ? '' : 'disabled'}>${claimed ? 'COLETADA' : `✦ ${mission.reward}`}</button><div class="mission-progress"><span style="width:${progress / mission.target * 100}%"></span></div>`;
      card.querySelector('button').addEventListener('click', () => {
        if (!complete || claimed || save.missionClaimed.includes(mission.id)) return;
        save.missionClaimed.push(mission.id); save.coins += mission.reward; persist(); renderMissions();
        ping(1080, .12, 'sine'); toast(`MISSÃO CONCLUÍDA · +${mission.reward} POEIRA`);
      });
      ui.missionList.appendChild(card);
    }
  }

  function renderShop() { renderSkins(); renderTrails(); renderItems(); }
  function openShop() { pauseRun(); renderShop(); ui.shop.classList.add('open'); ui.shopCoins.textContent = save.coins; document.querySelector('#close-shop').focus(); }
  function closeShop() { ui.shop.classList.remove('open'); document.querySelector(state === 'suspended' ? '#resume-button' : '#shop-button').focus(); }
  function openMissions() { renderMissions(); ui.shop.classList.remove('open'); ui.missions.classList.add('open'); }
  function closeMissions() { ui.missions.classList.remove('open'); }

  function cancelAim(e) {
    if (e && pointerKey(e) !== activePointer) return;
    const pointer = activePointer;
    holding = false; activePointer = null;
    if (typeof pointer === 'number' && canvas.hasPointerCapture?.(pointer)) canvas.releasePointerCapture(pointer);
  }

  function pauseRun() {
    cancelAim(); stopMusic();
    stopLoop();
    if (audioCtx?.state === 'running') audioCtx.suspend().catch(() => {});
    if (state === 'playing') {
      state = 'suspended';
      document.querySelector('#pause-screen').hidden = false;
      ui.quitButton.hidden = true;
      if (!document.hidden) document.querySelector('#resume-button').focus();
    }
    requestFrame();
  }

  function resumeRun() {
    if (state !== 'suspended' || document.hidden || appBackground || ui.shop.classList.contains('open')) return;
    document.querySelector('#pause-screen').hidden = true;
    state = 'playing';
    ui.quitButton.hidden = false;
    document.activeElement?.blur(); startMusic(); wakeLoop();
  }

  function rewardFailure(ad) {
    if (ad.unavailable) return 'Recompensa disponível no app Android.';
    if (ad.error || !ad.shown) return 'Anúncio indisponível agora. Tente novamente em instantes.';
    return 'Anúncio encerrado sem recompensa. Assista até o fim para receber.';
  }

  async function rewardedAd(placement) {
    try { return await window.OrbitaAds.showRewarded(placement); }
    catch { return { shown: false, rewarded: false, error: 'request-failed' }; }
  }

  window.OrbitaHandleBack = () => {
    if (ui.missions.classList.contains('open')) { closeMissions(); return true; }
    if (ui.shop.classList.contains('open')) { closeShop(); return true; }
    if (!ui.quitConfirm.hidden) { cancelQuit(); return true; }
    if (ui.over.classList.contains('active')) {
      state = 'menu'; cameraY = cameraTargetY = 0; stopMusic(); ui.quitButton.hidden = true;
      ui.over.classList.remove('active'); ui.start.classList.add('active'); resize(); seedMenuWorld(); wakeLoop(); return true;
    }
    if (state === 'playing') { openQuitConfirm(); return true; }
    if (state === 'suspended') { document.querySelector('#resume-button').focus(); return true; }
    return false;
  };

  document.querySelector('#play-button').addEventListener('click', begin);
  document.querySelector('#retry-button').addEventListener('click', restart);
  document.querySelector('#continue-button').addEventListener('click', continueRun);
  document.querySelector('#home-button').addEventListener('click', () => { state = 'menu'; cameraY = cameraTargetY = 0; stopMusic(); ui.quitButton.hidden = true; ui.over.classList.remove('active'); ui.start.classList.add('active'); resize(); seedMenuWorld(); wakeLoop(); });
  document.querySelector('#shop-button').addEventListener('click', openShop);
  document.querySelector('#close-shop').addEventListener('click', closeShop);
  document.querySelector('#missions-button').addEventListener('click', openMissions);
  document.querySelector('#close-missions').addEventListener('click', closeMissions);
  document.querySelector('#resume-button').addEventListener('click', resumeRun);
  document.querySelector('#sound-button').addEventListener('click', e => {
    save.sound = !save.sound; e.currentTarget.textContent = save.sound ? 'SOM LIGADO' : 'SOM DESLIGADO'; e.currentTarget.setAttribute('aria-pressed', save.sound); persist();
    save.sound && state === 'playing' ? startMusic() : stopMusic();
  });
  ui.quitButton.addEventListener('click', openQuitConfirm);
  document.querySelector('#cancel-quit').addEventListener('click', cancelQuit);
  document.querySelector('#confirm-quit').addEventListener('click', confirmQuit);
  const privacyButton = document.querySelector('#privacy-options');
  const nativePrivacy = window.OrbitaNativePrivacy;
  const updatePrivacyButton = required => { privacyButton.hidden = !required; };
  if (nativePrivacy?.isPrivacyOptionsRequired) {
    try { updatePrivacyButton(nativePrivacy.isPrivacyOptionsRequired()); } catch {}
  }
  window.addEventListener('orbita-privacy-ready', e => updatePrivacyButton(Boolean(e.detail?.required)));
  privacyButton.addEventListener('click', () => {
    if (nativePrivacy?.openPrivacyOptions) nativePrivacy.openPrivacyOptions();
  });
  ui.rewardDust.addEventListener('click', async () => {
    ui.rewardDust.disabled = true;
    const ad = await rewardedAd('dust-150');
    ui.rewardDust.disabled = false;
    if (!ad.rewarded) return toast(rewardFailure(ad));
    save.coins += 150; persist(); renderShop(); toast('+150 POEIRA ESTELAR');
  });

  canvas.addEventListener('pointerdown', press);
  canvas.addEventListener('pointermove', aim);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', cancelAim);
  canvas.addEventListener('lostpointercapture', cancelAim);
  let resizeFrame = 0;
  const scheduleResize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resize);
  };
  window.addEventListener('resize', scheduleResize);
  window.visualViewport?.addEventListener('resize', scheduleResize);
  shell.addEventListener('scroll', () => shell.scrollTo(0, 0), { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(scheduleResize).observe(shell);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseRun();
    else wakeLoop();
  });
  window.addEventListener('orbita-app-pause', () => { appBackground = true; pauseRun(); });
  window.addEventListener('orbita-app-resume', () => { appBackground = false; wakeLoop(); });
  window.addEventListener('blur', pauseRun);
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') { window.OrbitaHandleBack(); return; }
    if (e.code === 'Space' && (e.target === document.body || e.target === canvas)) {
      e.preventDefault(); if (!e.repeat) press(e);
    }
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') release(e); });

  function requestFrame() {
    if (!frameId && !document.hidden && !appBackground) frameId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    cancelAnimationFrame(frameId); frameId = 0; last = 0; accumulator = 0;
    resetPerformanceWindow();
  }

  function wakeLoop() {
    last = performance.now(); accumulator = 0; prediction.stamp = -Infinity; requestFrame();
    resetPerformanceWindow();
  }

  function advanceFrame(elapsed) {
    if (state === 'paused' || state === 'suspended') return;
    // A long stall is an interruption, not a reason to fast-forward into a collision.
    if (state === 'playing' && elapsed > 1) { pauseRun(); return; }
    accumulator = Math.min(MAX_FRAME_TIME, accumulator + elapsed);
    while (accumulator + 1e-10 >= STEP) {
      if (state === 'playing') updateSpecialEvent(STEP);
      update(STEP); accumulator = Math.max(0, accumulator - STEP);
      if (state === 'paused' || state === 'suspended') { accumulator = 0; break; }
    }
  }

  function loop(t) {
    frameId = 0;
    if (document.hidden || appBackground) { stopLoop(); return; }
    const elapsed = Math.max(0, (t - last) / 1000); last = t;
    const measureStart = perfSample ? performance.now() : 0;
    advanceFrame(elapsed);
    const afterUpdate = perfSample ? performance.now() : 0;
    draw(t);
    if (perfSample) recordPerformance(elapsed, afterUpdate - measureStart, performance.now() - afterUpdate, t);
    if (state !== 'paused' && state !== 'suspended') requestFrame();
    else { cancelAnimationFrame(frameId); frameId = 0; }
  }

  resize(); syncUI(); wakeLoop();
})();
