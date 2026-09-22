package com.orbita.infinita;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

import org.json.JSONObject;

public final class AdMobBridge {
    private final Activity activity;
    private final WebView webView;
    private RewardedAd rewardedAd;
    private InterstitialAd interstitialAd;
    private boolean ready;

    public AdMobBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    public void startLoading() {
        activity.runOnUiThread(() -> {
            if (ready) return;
            ready = true;
            loadRewarded();
            loadInterstitial();
        });
    }

    @JavascriptInterface
    public void requestAd(String type, String placement, String requestId) {
        activity.runOnUiThread(() -> {
            if (!ready) {
                respond(requestId, false, false, "consent-or-sdk-not-ready", placement);
                return;
            }
            if ("rewarded".equals(type)) showRewarded(requestId, placement);
            else if ("interstitial".equals(type)) showInterstitial(requestId, placement);
            else respond(requestId, false, false, "unknown-ad-type", placement);
        });
    }

    private String rewardedUnitId() {
        return BuildConfig.ADMOB_USE_TEST_ADS
            ? BuildConfig.ADMOB_TEST_REWARDED_AD_UNIT_ID
            : BuildConfig.ADMOB_REWARDED_AD_UNIT_ID;
    }

    private String interstitialUnitId() {
        return BuildConfig.ADMOB_USE_TEST_ADS
            ? BuildConfig.ADMOB_TEST_INTERSTITIAL_AD_UNIT_ID
            : BuildConfig.ADMOB_INTERSTITIAL_AD_UNIT_ID;
    }

    private void loadRewarded() {
        RewardedAd.load(activity, rewardedUnitId(), new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override public void onAdLoaded(RewardedAd ad) { rewardedAd = ad; }
            @Override public void onAdFailedToLoad(LoadAdError error) { rewardedAd = null; }
        });
    }

    private void loadInterstitial() {
        InterstitialAd.load(activity, interstitialUnitId(), new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override public void onAdLoaded(InterstitialAd ad) { interstitialAd = ad; }
            @Override public void onAdFailedToLoad(LoadAdError error) { interstitialAd = null; }
        });
    }

    private void showRewarded(String requestId, String placement) {
        RewardedAd ad = rewardedAd;
        if (ad == null) {
            loadRewarded();
            respond(requestId, false, false, "not-loaded", placement);
            return;
        }
        rewardedAd = null;
        final boolean[] rewardSent = {false};
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() {
                if (!rewardSent[0]) respond(requestId, true, false, null, placement);
                loadRewarded();
            }

            @Override public void onAdFailedToShowFullScreenContent(AdError error) {
                respond(requestId, false, false, error.getMessage(), placement);
                loadRewarded();
            }
        });
        ad.show(activity, reward -> {
            rewardSent[0] = true;
            respond(requestId, true, true, null, placement);
        });
    }

    private void showInterstitial(String requestId, String placement) {
        InterstitialAd ad = interstitialAd;
        if (ad == null) {
            loadInterstitial();
            respond(requestId, false, false, "not-loaded", placement);
            return;
        }
        interstitialAd = null;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() {
                respond(requestId, true, false, null, placement);
                loadInterstitial();
            }

            @Override public void onAdFailedToShowFullScreenContent(AdError error) {
                respond(requestId, false, false, error.getMessage(), placement);
                loadInterstitial();
            }
        });
        ad.show(activity);
    }

    private void respond(String requestId, boolean shown, boolean rewarded, String error, String placement) {
        JSONObject result = new JSONObject();
        try {
            result.put("shown", shown);
            result.put("rewarded", rewarded);
            result.put("error", error == null ? JSONObject.NULL : error);
            result.put("placement", placement);
        } catch (Exception ignored) {}
        String script = "window.OrbitaAdsNativeResult(" + JSONObject.quote(requestId) + ", "
            + JSONObject.quote(result.toString()) + ")";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }
}
