// Chrome DevTools CPU sampling of this game's debug WebView only. Not a GPU benchmark.
const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const adb = join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const args = process.argv.slice(2), renderer = args[0], label = args[1];
if (!['canvas', 'pixi'].includes(renderer) || !/^[a-zA-Z0-9_-]+$/.test(label || '')) throw new Error('Usage: node scripts/profile-webview.cjs canvas|pixi LABEL [SERIAL]');
const serial = args[2] || '4ZHBB25506200120', pkg = 'com.orbita.infinita.debug';
const command = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 30000 });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const directory = resolve(__dirname, '../docs/profiles');
mkdirSync(directory, { recursive: true });
let socket, forwarded = false, nextID = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextID;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('DevTools timed out: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
const inspect = async () => (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
  const c = document.querySelector('#orbita-pixi'), base = document.querySelector('#game');
  const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
  const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const rect = base.getBoundingClientRect();
  const saved = localStorage.getItem('orbita-infinita-v1') || '';
  let hash = 2166136261;
  for (let i=0;i<saved.length;i++) { hash ^= saved.charCodeAt(i); hash = Math.imul(hash,16777619); }
  return { url: location.href, pixiVersion: window.PIXI?.VERSION, renderer: c ? 'pixi' : 'canvas',
    width: base.width, height: base.height, cssWidth: rect.width, cssHeight: rect.height,
    antialias: gl?.getContextAttributes()?.antialias, rendererInfo: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null,
    gameSaveDigest: { length:saved.length, checksum:(hash >>> 0).toString(16) },
    jsHeap: performance.memory ? { used:performance.memory.usedJSHeapSize, total:performance.memory.totalJSHeapSize } : null };
})()` })).result.value;
(async () => {
  command('shell', 'am', 'force-stop', pkg);
  command('shell', 'am', 'start', '-W', '--windowingMode', '1', '-n', pkg + '/com.orbita.infinita.MainActivity',
    '--es', 'orbita.benchmark', 'stress', '--es', 'orbita.renderer', renderer, '--es', 'orbita.quality', 'balanced', '--ei', 'orbita.seconds', '30');
  const pid = command('shell', 'pidof', pkg).trim();
  command('forward', 'tcp:9223', 'localabstract:webview_devtools_remote_' + pid); forwarded = true;
  let target;
  for (let i = 0; i < 20 && !target; i++) {
    try {
      const targets = await (await fetch('http://127.0.0.1:9223/json/list', { signal: AbortSignal.timeout(1500) })).json();
      target = targets.find(target => /^file:\/\/\/android_asset\/index\.html(?:\?|$)/.test(target.url));
    } catch {}
    if (!target) await delay(500);
  }
  if (!target) throw new Error('Game WebView target unavailable');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data), request = pending.get(value.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(value.id);
    if (value.error) request.reject(new Error(JSON.stringify(value.error))); else request.resolve(value.result);
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once:true }); socket.addEventListener('error', reject, { once:true }); });
  await delay(8000); // Exclude startup from this steady-state CPU sample.
  const before = await inspect();
  if (before.renderer !== renderer) throw new Error('Requested renderer did not initialize');
  await send('Profiler.enable'); await send('Profiler.start'); await delay(8000);
  const { profile } = await send('Profiler.stop');
  const after = await inspect();
  writeFileSync(join(directory, label + '.cpuprofile'), JSON.stringify(profile));
  // Huawei WebView's CDP screenshot can omit its external WebGL surface.
  const screenshot = execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout:15000, maxBuffer:16 * 1024 * 1024 });
  writeFileSync(join(directory, label + '.png'), screenshot);
  await send('Runtime.evaluate', { expression:'window.OrbitaHandleBack?.()' });
  await delay(250);
  const restored = await inspect();
  const savePreserved = JSON.stringify(before.gameSaveDigest) === JSON.stringify(after.gameSaveDigest)
    && JSON.stringify(before.gameSaveDigest) === JSON.stringify(restored.gameSaveDigest);
  const result = { renderer, before, after, restored, savePreserved, sampleWallMs:(profile.endTime - profile.startTime) / 1000,
    scope:'Game WebView DevTools CPU sampler; not GPU time or physical touch-to-photon latency. This run includes profiling/readback and is excluded from performance A/B.' };
  writeFileSync(join(directory, label + '.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!savePreserved) throw new Error('Game save changed during the diagnostic');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => {
  socket?.close();
  for (const request of pending.values()) clearTimeout(request.timer);
  if (forwarded) { try { command('forward', '--remove', 'tcp:9223'); } catch {} }
});
