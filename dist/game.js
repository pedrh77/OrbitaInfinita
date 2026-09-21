(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const ui = {
    start: document.querySelector('#start-screen'), over: document.querySelector('#game-over'),
    shop: document.querySelector('#shop'), score: document.querySelector('#score'),
    best: document.querySelector('#best'), coins: document.querySelector('#coins'),
    shopCoins: document.querySelector('#shop-coins'), final: document.querySelector('#final-score'),
    result: document.querySelector('#result-copy'), combo: document.querySelector('#combo'),
    toast: document.querySelector('#toast'),
    continueButton: document.querySelector('#continue-button'), skins: document.querySelector('#skins'),
    trails: document.querySelector('#trails'), items: document.querySelector('#items'),
    sector: document.querySelector('#sector'), rewardDust: document.querySelector('#reward-dust')
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
  const defaults = { best: 0, coins: 0, selected: 'cometa', owned: ['cometa'], selectedTrail: 'classic', ownedTrails: ['classic'], shields: 0, boosters: 0, sound: true, runs: 0, noAds: false };
  let save = loadSave();
  let W = 0, H = 0, dpr = 1, last = 0, state = 'menu';
  let stars = [], nebulae = [], comets = [], planets = [], particles = [], trail = [], asteroids = [], collectibles = [];
  let ship, current, targets = [], score = 0, streak = 0, cameraY = 0, cameraTargetY = 0;
  let holding = false, charge = .35, aimStartX = 0, aimStartY = 0, continued = false;
  let runSeed = 0, random = Math.random;
  let audioCtx = null;

  window.OrbitaMonetization = window.OrbitaMonetization || {
    purchase: async product => ({ success: false, product, demo: true })
  };

  function loadSave() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; }
    catch { return { ...defaults }; }
  }
  function persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); syncUI(); }
  function syncUI() {
    ui.best.textContent = save.best;
    ui.coins.textContent = save.coins;
    ui.shopCoins.textContent = save.coins;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeStars();
    if (state === 'menu') seedMenuWorld();
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
    return { x, y, r, color, seed, pulse: Math.random() * TAU, visited: false, target: false };
  }

  function findFreePosition(r, yMin, yMax, padding = 24, xMin = 58, xMax = W - 58) {
    let best = { x: W / 2, y: (yMin + yMax) / 2 }, bestClearance = -Infinity;
    const lowY = Math.min(yMin, yMax), highY = Math.max(yMin, yMax);
    const lowX = Math.max(r + 8, Math.min(xMin, xMax)), highX = Math.min(W - r - 8, Math.max(xMin, xMax));
    for (let attempt = 0; attempt < 42; attempt++) {
      const candidate = { x: lowX + random() * Math.max(1, highX - lowX), y: lowY + random() * Math.max(1, highY - lowY) };
      let clearance = Infinity;
      for (const p of planets) clearance = Math.min(clearance, Math.hypot(candidate.x - p.x, candidate.y - p.y) - r - p.r);
      for (const a of asteroids) clearance = Math.min(clearance, Math.hypot(candidate.x - a.x, candidate.y - a.y) - r - a.r);
      for (const c of collectibles) if (!c.collected) clearance = Math.min(clearance, Math.hypot(candidate.x - c.x, candidate.y - c.y) - r - c.r);
      if (clearance > bestClearance) { best = candidate; bestClearance = clearance; }
      if (clearance >= padding) return candidate;
    }
    return best;
  }

  function begin() {
    score = 0; streak = 0; continued = false; holding = false; charge = .35;
    cameraY = 0; cameraTargetY = 0; trail = []; particles = []; asteroids = []; collectibles = [];
    runSeed = Math.floor(Math.random() * 900000) + 100000;
    random = mulberry32(runSeed);
    current = planet(W * .5, H * .72, 39, '#7c5cff', 10);
    current.visited = true;
    planets = [current];
    spawnTargets();
    ship = { x: 0, y: 0, vx: 0, vy: 0, aimAngle: -Math.PI / 2, orbitRadius: current.r + 19, mode: 'orbit' };
    placeOrbitShip();
    state = 'playing';
    ui.start.classList.remove('active'); ui.over.classList.remove('active'); ui.shop.classList.remove('open');
    ui.score.textContent = '0';
    ui.sector.textContent = 'SETOR 01';
    ping(380, .06, 'sine');
  }

  function spawnTargets() {
    const level = score + 1;
    const gapY = Math.min(H * .37, 205 + level * 2.4);
    const margin = 58;
    const choiceCount = level >= 5 ? 4 : 3;
    targets = [];
    for (let i = 0; i < choiceCount; i++) {
      const r = Math.max(20, 32 - level * .22 + random() * 9);
      const pos = findFreePosition(r, current.y - gapY * 1.62, current.y - gapY * .56, 34, margin, W - margin);
      const next = planet(pos.x, pos.y, r, palette[(level + i * 2) % palette.length], level * 37 + i * 11);
      next.target = true; planets.push(next); targets.push(next);
    }
    const collectibleTarget = targets[Math.floor(random() * targets.length)];
    const collectibleT = .38 + random() * .24;
    const routeX = current.x + (collectibleTarget.x - current.x) * collectibleT;
    const routeY = current.y + (collectibleTarget.y - current.y) * collectibleT;
    const collectiblePos = findFreePosition(7, routeY - 38, routeY + 38, 16, routeX - 62, routeX + 62);
    collectibles.push({ x: collectiblePos.x, y: collectiblePos.y, r: 7, pulse: random() * TAU, collected: false });
    const blackHoleCount = level < 3 ? 0 : Math.min(4, 2 + Math.floor((level - 3) / 5));
    for (let i = 0; i < blackHoleCount; i++) {
      if (level > 3 && random() < .22) continue;
      const r = 13 + random() * 7, pos = findFreePosition(r, current.y - gapY * 1.18, current.y - gapY * .24, 30);
      const hole = { ...planet(pos.x, pos.y, r, '#9b63ff', 100 + level * 7 + i), hazard: true, hazardType: 'blackHole', gravity: 470000 + level * 9000 };
      planets.push(hole);
    }
    const pulsarCount = level < 4 ? 0 : Math.min(2, 1 + Math.floor((level - 4) / 7));
    for (let i = 0; i < pulsarCount; i++) {
      const r = 11 + random() * 5, pos = findFreePosition(r, current.y - gapY * 1.24, current.y - gapY * .28, 30);
      planets.push({ ...planet(pos.x, pos.y, r, '#6ee7ff', 600 + level * 9 + i), hazard: true, hazardType: 'pulsar', gravity: -(300000 + level * 7000) });
    }
    const asteroidCount = level < 4 ? 0 : Math.min(5, 1 + Math.floor((level - 4) / 4));
    for (let i = 0; i < asteroidCount; i++) {
      const t = .2 + random() * .62;
      const routeTarget = targets[i % targets.length];
      const bx = current.x + (routeTarget.x - current.x) * t;
      const by = current.y + (routeTarget.y - current.y) * t;
      const r = 7 + random() * 6, pos = findFreePosition(r, by - 52, by + 52, 18, bx - W * .2, bx + W * .2);
      asteroids.push({ x: pos.x, y: pos.y, r, rotation: random() * TAU, spin: (random() - .5) * 1.4, seed: random() * 20 });
    }
    if (level === 3) toast('ANOMALIA: buracos negros alteram a rota.');
    if (level === 4) toast('CUIDADO: pulsares e asteroides à frente.');
  }

  function placeOrbitShip() {
    ship.x = current.x;
    ship.y = current.y - ship.orbitRadius;
  }

  function press(e) {
    if (state !== 'playing' || ship.mode !== 'orbit' || ui.shop.classList.contains('open')) return;
    if (e?.cancelable) e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    holding = true; charge = .25; ship.aimAngle = -Math.PI / 2;
    if (Number.isFinite(e?.pointerId)) canvas.setPointerCapture?.(e.pointerId);
    aimStartX = Number.isFinite(e?.clientX) ? e.clientX - rect.left : ship.x;
    aimStartY = Number.isFinite(e?.clientY) ? e.clientY - rect.top : ship.y - cameraY;
    ping(230, .025, 'sine');
  }
  function aim(e) {
    if (!holding || state !== 'playing' || ship.mode !== 'orbit') return;
    if (e?.cancelable) e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dx = x - aimStartX, dy = y - aimStartY, distance = Math.hypot(dx, dy);
    if (distance > 7) ship.aimAngle = Math.atan2(dy, dx);
    charge = Math.max(.2, Math.min(1, distance / Math.min(190, W * .42)));
  }
  function release(e) {
    if (!holding || state !== 'playing' || ship.mode !== 'orbit') return;
    if (e?.cancelable) e.preventDefault();
    holding = false;
    if (Number.isFinite(e?.pointerId) && canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture?.(e.pointerId);
    const tangent = ship.aimAngle;
    const boost = save.boosters > 0 ? 1.15 : 1;
    const speed = (255 + charge * 290) * boost;
    if (save.boosters > 0) { save.boosters -= 1; persist(); toast('IMPULSO +15% ATIVADO'); }
    ship.vx = Math.cos(tangent) * speed;
    ship.vy = Math.sin(tangent) * speed;
    ship.mode = 'flight'; trail = [];
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
    asteroids.forEach(a => a.rotation += a.spin * worldDt);
    collectibles.forEach(c => c.pulse += worldDt * 3);
    updateParticles(worldDt);
    if (ship.mode === 'orbit') {
      placeOrbitShip();
    } else if (ship.mode === 'flight') {
      let ax = 0, ay = 0;
      for (const p of planets) {
        if (p !== current || p.hazard) {
          const dx = p.x - ship.x, dy = p.y - ship.y;
          const d2 = Math.max(500, dx * dx + dy * dy);
          const planetGravity = 125000 * (.7 + p.r / 48);
          const g = (p.hazard ? p.gravity : planetGravity) / d2;
          const d = Math.sqrt(d2);
          ax += dx / d * g; ay += dy / d * g;
        }
      }
      ship.vx += ax * dt; ship.vy += ay * dt;
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      trail.push({ x: ship.x, y: ship.y, life: 1 });
      if (trail.length > 34) trail.shift();
      trail.forEach(t => t.life -= dt * 1.8);
      checkCollisions();
      const sy = ship.y - cameraY;
      if (sy > H + 90 || sy < -160 || ship.x < -120 || ship.x > W + 120) lose();
    }
  }

  function checkCollisions() {
    for (const p of planets) {
      if (p === current) continue;
      const dx = ship.x - p.x, dy = ship.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < p.r + 8) {
        if (p.target) land(p, d);
        else lose();
        return;
      }
    }
    for (const a of asteroids) {
      if (Math.hypot(ship.x - a.x, ship.y - a.y) < a.r + 7) { lose(); return; }
    }
    for (const c of collectibles) {
      if (!c.collected && Math.hypot(ship.x - c.x, ship.y - c.y) < c.r + 11) {
        c.collected = true; save.coins += 15; persist(); burst(c.x, c.y, '#ffcf5c', 18, 120); ping(980, .08, 'sine'); toast('+15 POEIRA ESTELAR');
      }
    }
  }

  function land(p) {
    const speed = Math.hypot(ship.vx, ship.vy);
    const centerHit = speed < 480;
    score += 1; streak = centerHit ? streak + 1 : 0;
    const reward = 3 + Math.min(12, streak * 2);
    save.coins += reward; save.best = Math.max(save.best, score); persist();
    ui.score.textContent = score;
    ui.sector.textContent = `SETOR ${String(score + 1).padStart(2, '0')}`;
    p.target = false; p.visited = true; current = p;
    ship.mode = 'orbit'; ship.orbitRadius = current.r + 19;
    ship.aimAngle = -Math.PI / 2;
    charge = .35;
    cameraTargetY = current.y - H * .66;
    burst(p.x, p.y, p.color, centerHit ? 24 : 14, 155);
    ping(700 + Math.min(score, 12) * 28, .1, 'sine');
    if (centerHit && streak >= 2) popCombo(streak);
    planets = planets.filter(q => q === current || (!q.target && q.y - cameraTargetY > -180 && q.y - cameraTargetY < H + 180));
    asteroids = asteroids.filter(a => a.y - cameraTargetY > -180 && a.y - cameraTargetY < H + 180);
    collectibles = collectibles.filter(c => !c.collected && c.y - cameraTargetY > -180 && c.y - cameraTargetY < H + 180);
    spawnTargets();
  }

  function lose() {
    if (state !== 'playing') return;
    if (save.shields > 0) {
      save.shields -= 1; persist(); holding = false; ship.mode = 'orbit'; ship.vx = ship.vy = 0; ship.aimAngle = -Math.PI / 2; placeOrbitShip();
      burst(current.x, current.y, '#6ee7ff', 26, 150); ping(820, .12, 'sine'); toast('ESCUDO DE EMERGÊNCIA ATIVADO'); return;
    }
    state = 'over'; holding = false; save.runs += 1; persist();
    burst(ship.x, ship.y, skinColor(), 30, 210);
    ping(110, .22, 'sawtooth');
    setTimeout(() => {
      ui.final.textContent = score;
      ui.result.textContent = score >= save.best && score > 0 ? 'Novo recorde. O próximo planeta espera.' : score < 3 ? 'A próxima órbita é sua.' : 'Você chegou mais longe desta vez.';
      ui.continueButton.style.display = continued ? 'none' : 'flex';
      ui.over.classList.add('active');
    }, 420);
    if (!save.noAds && save.runs % 4 === 0) {
      window.OrbitaAds.showInterstitial('game-over').catch(() => {});
    }
  }

  async function continueRun() {
    ui.continueButton.disabled = true;
    const ad = await window.OrbitaAds.showRewarded('continue-run');
    ui.continueButton.disabled = false;
    if (!ad.rewarded) return toast(ad.unavailable ? 'Recompensa disponível no app Android.' : 'Assista até o fim para receber a recompensa.');
    continued = true; ui.over.classList.remove('active'); state = 'playing';
    ship.mode = 'orbit'; ship.aimAngle = -Math.PI / 2; ship.vx = ship.vy = 0; placeOrbitShip();
    toast('Sinal recuperado!'); ping(620, .12, 'sine');
  }

  function restart() { begin(); }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = Math.random() * speed;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .5 + Math.random() * .6, max: 1, color, r: 1 + Math.random() * 2.5 });
    }
  }
  function updateParticles(dt) {
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.vy *= .985; p.life -= dt; });
    particles = particles.filter(p => p.life > 0);
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
    ctx.clearRect(0, 0, W, H);
    const grad = ctx.createRadialGradient(W * .5, H * .32, 0, W * .5, H * .35, H * .9);
    grad.addColorStop(0, '#171944'); grad.addColorStop(.58, '#090b23'); grad.addColorStop(1, '#050615');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    drawNebulae(time);
    drawStars(time);
    drawComets();
    ctx.save();
    ctx.translate(0, -cameraY);
    planets.forEach(drawPlanet);
    asteroids.forEach(drawAsteroid);
    collectibles.forEach(drawCollectible);
    drawParticles();
    if ((state === 'playing' || state === 'over') && ship) drawShip();
    ctx.restore();
    if (state === 'playing' && holding) drawCharge();
  }

  function drawStars(time) {
    ctx.save();
    for (const s of stars) {
      const y = ((s.y - cameraY * .12) % H + H) % H;
      ctx.globalAlpha = s.a * (.75 + Math.sin(time * .0015 + s.p) * .25);
      ctx.fillStyle = '#dfe5ff'; ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawNebulae(time) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const n of nebulae) {
      const x = n.x + Math.sin(time * n.drift * .001) * 28;
      const y = ((n.y - cameraY * .035) % (H + n.r * 2) + H + n.r * 2) % (H + n.r * 2) - n.r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, n.r);
      g.addColorStop(0, `${n.color}22`); g.addColorStop(.48, `${n.color}0d`); g.addColorStop(1, `${n.color}00`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, n.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
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

  function drawPlanet(p) {
    const glow = p.target ? 15 + Math.sin(p.pulse * 3) * 5 : p.hazard ? 24 : 8;
    ctx.save();
    if (!p.hazard && p.seed % 3 === 0) {
      ctx.globalAlpha = .55; ctx.strokeStyle = tint(p.color, 28); ctx.lineWidth = Math.max(2, p.r * .1);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.55, p.r * .36, -.32, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (!p.hazard) {
      ctx.globalAlpha = .12; ctx.strokeStyle = p.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 2.25, p.r * .68, -.18, 0, TAU); ctx.stroke();
      ctx.globalAlpha = .06; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 2.8, p.r * .92, -.18, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.shadowColor = p.color; ctx.shadowBlur = glow;
    const g = ctx.createRadialGradient(p.x - p.r * .34, p.y - p.r * .38, p.r * .05, p.x, p.y, p.r);
    if (p.hazardType === 'pulsar') { g.addColorStop(0, '#ffffff'); g.addColorStop(.22, '#9cf4ff'); g.addColorStop(.62, '#256fa8'); g.addColorStop(1, '#07152d'); }
    else if (p.hazard) { g.addColorStop(0, '#171a2f'); g.addColorStop(.75, '#03040b'); g.addColorStop(1, '#000'); }
    else { g.addColorStop(0, tint(p.color, 62)); g.addColorStop(.44, p.color); g.addColorStop(1, tint(p.color, -48)); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    if (!p.hazard) {
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
      ctx.globalAlpha = .24; ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) {
        const a = ((p.seed * .17 + i * 2.1 + p.pulse * .72) % TAU), rr = p.r * (.12 + (i % 2) * .08);
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
    if (!p.hazard && p.seed % 4 === 1) {
      const moonA = p.pulse * .55 + p.seed;
      const mx = p.x + Math.cos(moonA) * p.r * 1.65, my = p.y + Math.sin(moonA) * p.r * .7;
      ctx.globalAlpha = .85; ctx.fillStyle = '#dbe2ff'; ctx.shadowColor = '#9eb3ff'; ctx.shadowBlur = 7;
      ctx.beginPath(); ctx.arc(mx, my, Math.max(2.5, p.r * .11), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawAsteroid(a) {
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
    if (c.collected) return;
    const pulse = 1 + Math.sin(c.pulse) * .18;
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(pulse, pulse); ctx.rotate(c.pulse * .18); ctx.shadowColor = '#ffcf5c'; ctx.shadowBlur = 18; ctx.fillStyle = '#ffcf5c';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 4, r = i % 2 ? c.r * .42 : c.r;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
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
    ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(angle); ctx.shadowColor = skinColor(); ctx.shadowBlur = 14; ctx.fillStyle = skinColor();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(2, 6); ctx.lineTo(0, 12); ctx.lineTo(-2, 6); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#151933'; ctx.beginPath(); ctx.arc(0, -2, 2.8, 0, TAU); ctx.fill();
    ctx.restore();
    if (ship.mode === 'orbit') drawPrediction();
  }

  function drawPrediction() {
    const tangent = ship.aimAngle;
    const previewCharge = charge;
    const speed = (255 + previewCharge * 290) * (save.boosters > 0 ? 1.15 : 1);
    let x = ship.x, y = ship.y, vx = Math.cos(tangent) * speed, vy = Math.sin(tangent) * speed;
    const points = []; let outcome = 'open';
    for (let i = 0; i < 46; i++) {
      const step = .034; let ax = 0, ay = 0;
      for (const p of planets) if (p !== current || p.hazard) {
        const dx = p.x - x, dy = p.y - y, d2 = Math.max(500, dx * dx + dy * dy), d = Math.sqrt(d2);
        const planetGravity = 125000 * (.7 + p.r / 48), g = (p.hazard ? p.gravity : planetGravity) / d2;
        ax += dx / d * g; ay += dy / d * g;
      }
      vx += ax * step; vy += ay * step; x += vx * step; y += vy * step; points.push({ x, y });
      for (const p of planets) {
        if (p === current) continue;
        if (Math.hypot(x - p.x, y - p.y) < p.r + 7) { outcome = p.target ? 'safe' : 'danger'; break; }
      }
      if (outcome === 'open') for (const a of asteroids) {
        if (Math.hypot(x - a.x, y - a.y) < a.r + 7) { outcome = 'danger'; break; }
      }
      if (outcome !== 'open') break;
    }
    const routeColor = outcome === 'safe' ? '#70f0aa' : outcome === 'danger' ? '#c081ff' : '#6ee7ff';
    ctx.save();
    ctx.strokeStyle = routeColor; ctx.lineWidth = holding ? 2 : 1.3; ctx.setLineDash([3, 7]); ctx.globalAlpha = holding ? .9 : .48;
    ctx.beginPath(); ctx.moveTo(ship.x, ship.y); points.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
    ctx.setLineDash([]);
    points.forEach((p, i) => {
      if (i % 4) return;
      ctx.globalAlpha = (1 - i / Math.max(1, points.length)) * (holding ? .9 : .52); ctx.fillStyle = routeColor;
      ctx.beginPath(); ctx.arc(p.x, p.y, i % 8 === 0 ? 2.8 : 1.7, 0, TAU); ctx.fill();
    });
    ctx.restore();
  }

  function drawParticles() {
    ctx.save(); particles.forEach(p => { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }); ctx.restore();
  }

  function drawCharge() {
    const w = Math.min(220, W * .54), x = (W - w) / 2, y = H - 38;
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
  function ping(freq, duration, type) {
    if (!save.sound) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.type = type; o.frequency.value = freq; gain.gain.setValueAtTime(.055, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
      o.connect(gain).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + duration);
    } catch {}
  }
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
        persist(); renderItems(); toast(`${item.name} comprado.`);
      });
      ui.items.appendChild(button);
    });
  }

  function renderShop() { renderSkins(); renderTrails(); renderItems(); }
  function openShop() { renderShop(); ui.shop.classList.add('open'); ui.shopCoins.textContent = save.coins; }
  function closeShop() { ui.shop.classList.remove('open'); }

  document.querySelector('#play-button').addEventListener('click', begin);
  document.querySelector('#retry-button').addEventListener('click', restart);
  document.querySelector('#continue-button').addEventListener('click', continueRun);
  document.querySelector('#home-button').addEventListener('click', () => { state = 'menu'; cameraY = cameraTargetY = 0; ui.over.classList.remove('active'); ui.start.classList.add('active'); seedMenuWorld(); });
  document.querySelector('#shop-button').addEventListener('click', openShop);
  document.querySelector('#close-shop').addEventListener('click', closeShop);
  document.querySelector('#sound-button').addEventListener('click', e => { save.sound = !save.sound; e.currentTarget.textContent = save.sound ? 'SOM LIGADO' : 'SOM DESLIGADO'; e.currentTarget.setAttribute('aria-pressed', save.sound); persist(); });
  ui.rewardDust.addEventListener('click', async () => {
    ui.rewardDust.disabled = true;
    const ad = await window.OrbitaAds.showRewarded('dust-75');
    ui.rewardDust.disabled = false;
    if (!ad.rewarded) return toast(ad.unavailable ? 'Recompensa disponível no app Android.' : 'Assista até o fim para receber ✦ 75.');
    save.coins += 75; persist(); renderShop(); toast('+75 POEIRA ESTELAR');
  });
  document.querySelectorAll('[data-product]').forEach(b => b.addEventListener('click', async () => {
    const product = b.dataset.product, result = await window.OrbitaMonetization.purchase(product);
    if (result.success) {
      if (product === 'dust_500') save.coins += 500;
      if (product === 'starter_pack') save.coins += 1500;
      if (product === 'dust_5000') save.coins += 5000;
      if (product === 'remove_ads') save.noAds = true;
      persist(); renderShop();
    } else toast('Compra simulada — pronta para conectar à loja.');
  }));

  canvas.addEventListener('pointerdown', press);
  canvas.addEventListener('pointermove', aim);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) holding = false; });
  window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); if (e.repeat) return; press(e); } });
  window.addEventListener('keyup', e => { if (e.code === 'Space') release(e); });

  function loop(t) {
    const dt = Math.min(.034, (t - last) / 1000 || 0); last = t;
    update(dt); draw(t); requestAnimationFrame(loop);
  }

  resize(); syncUI(); requestAnimationFrame(loop);
})();
