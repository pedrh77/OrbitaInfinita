(() => {
  'use strict';

  const pending = new Map();
  let sequence = 0;

  function finish(requestId, payload) {
    const request = pending.get(requestId);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(requestId);
    request.resolve(payload);
  }

  // Chamado pela camada Android depois que o anúncio termina, falha ou é fechado.
  window.OrbitaAdsNativeResult = (requestId, json) => {
    try { finish(requestId, JSON.parse(json)); }
    catch { finish(requestId, { shown: false, rewarded: false, error: 'invalid-native-result' }); }
  };

  function request(type, placement) {
    const bridge = window.OrbitaNativeAds;
    if (!bridge || typeof bridge.requestAd !== 'function') {
      return Promise.resolve({ shown: false, rewarded: false, unavailable: true });
    }

    const requestId = `ad-${Date.now()}-${++sequence}`;
    return new Promise(resolve => {
      const timer = setTimeout(() => finish(requestId, {
        shown: false, rewarded: false, error: 'native-timeout'
      }), 120000);
      pending.set(requestId, { resolve, timer });
      bridge.requestAd(type, placement, requestId);
    });
  }

  window.OrbitaAds = {
    isAvailable: () => Boolean(window.OrbitaNativeAds?.requestAd),
    showRewarded: placement => request('rewarded', placement),
    showInterstitial: placement => request('interstitial', placement)
  };
})();
