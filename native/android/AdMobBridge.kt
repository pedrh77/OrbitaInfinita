package dev.pesantos.orbitainfinita

import android.app.Activity
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import org.json.JSONObject

class AdMobBridge(
    private val activity: Activity,
    private val webView: WebView,
) {
    private var rewardedAd: RewardedAd? = null
    private var interstitialAd: InterstitialAd? = null

    init {
        activity.runOnUiThread {
            loadRewarded()
            loadInterstitial()
        }
    }

    @JavascriptInterface
    fun requestAd(type: String, placement: String, requestId: String) {
        activity.runOnUiThread {
            when (type) {
                "rewarded" -> showRewarded(requestId, placement)
                "interstitial" -> showInterstitial(requestId, placement)
                else -> respond(requestId, false, false, "unknown-ad-type")
            }
        }
    }

    private fun rewardedUnitId() = if (BuildConfig.ADMOB_USE_TEST_ADS) {
        BuildConfig.ADMOB_TEST_REWARDED_AD_UNIT_ID
    } else BuildConfig.ADMOB_REWARDED_AD_UNIT_ID

    private fun interstitialUnitId() = if (BuildConfig.ADMOB_USE_TEST_ADS) {
        BuildConfig.ADMOB_TEST_INTERSTITIAL_AD_UNIT_ID
    } else BuildConfig.ADMOB_INTERSTITIAL_AD_UNIT_ID

    private fun loadRewarded() {
        RewardedAd.load(
            activity,
            rewardedUnitId(),
            AdRequest.Builder().build(),
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) { rewardedAd = ad }
                override fun onAdFailedToLoad(error: LoadAdError) { rewardedAd = null }
            },
        )
    }

    private fun loadInterstitial() {
        InterstitialAd.load(
            activity,
            interstitialUnitId(),
            AdRequest.Builder().build(),
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) { interstitialAd = ad }
                override fun onAdFailedToLoad(error: LoadAdError) { interstitialAd = null }
            },
        )
    }

    private fun showRewarded(requestId: String, placement: String) {
        val ad = rewardedAd ?: return respond(requestId, false, false, "not-loaded", placement)
        rewardedAd = null
        var rewardSent = false
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                if (!rewardSent) respond(requestId, true, false, placement = placement)
                loadRewarded()
            }

            override fun onAdFailedToShowFullScreenContent(error: AdError) {
                respond(requestId, false, false, error.message, placement)
                loadRewarded()
            }
        }
        ad.show(activity) {
            rewardSent = true
            respond(requestId, true, true, placement = placement)
        }
    }

    private fun showInterstitial(requestId: String, placement: String) {
        val ad = interstitialAd ?: return respond(requestId, false, false, "not-loaded", placement)
        interstitialAd = null
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                respond(requestId, true, false, placement = placement)
                loadInterstitial()
            }

            override fun onAdFailedToShowFullScreenContent(error: AdError) {
                respond(requestId, false, false, error.message, placement)
                loadInterstitial()
            }
        }
        ad.show(activity)
    }

    private fun respond(
        requestId: String,
        shown: Boolean,
        rewarded: Boolean,
        error: String? = null,
        placement: String? = null,
    ) {
        val result = JSONObject()
            .put("shown", shown)
            .put("rewarded", rewarded)
            .put("error", error)
            .put("placement", placement)
        val script = "window.OrbitaAdsNativeResult(${JSONObject.quote(requestId)}, ${JSONObject.quote(result.toString())})"
        webView.post { webView.evaluateJavascript(script, null) }
    }
}
