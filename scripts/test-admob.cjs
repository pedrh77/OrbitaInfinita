const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

async function main() {
  const timers = new Map();
  let timerId = 0, requestId;
  const window = {};
  vm.runInNewContext(readFileSync(join(__dirname, '../dist/admob.js'), 'utf8'), {
    window, setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  });
  assert.equal((await window.OrbitaAds.showRewarded('test')).unavailable, true);
  window.OrbitaNativeAds = { requestAd() { throw new Error('bridge disconnected'); } };
  assert.equal((await window.OrbitaAds.showRewarded('test')).error, 'native-request-failed');
  assert.equal(timers.size, 0, 'failed bridge request must release its timeout');
  window.OrbitaNativeAds.requestAd = (type, placement, id) => { requestId = id; };
  const success = window.OrbitaAds.showRewarded('test');
  window.OrbitaAdsNativeResult(requestId, '{"shown":true,"rewarded":true}');
  assert.equal((await success).rewarded, true);
  window.OrbitaAdsNativeResult(requestId, '{"shown":true,"rewarded":true}');
  assert.equal(timers.size, 0, 'duplicate result is ignored');
  const failure = window.OrbitaAds.showRewarded('test');
  window.OrbitaAdsNativeResult(requestId, '{"shown":false,"rewarded":false,"error":"not-loaded"}');
  assert.equal((await failure).rewarded, false);
  const timeout = window.OrbitaAds.showRewarded('test');
  [...timers.values()][0]();
  assert.equal((await timeout).error, 'native-timeout');
  assert.equal(timers.size, 0);
  console.log('PASS: ad availability, bridge error, reward, duplicate callback, not-loaded and timeout');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
