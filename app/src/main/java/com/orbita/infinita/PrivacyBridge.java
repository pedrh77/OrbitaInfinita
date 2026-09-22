package com.orbita.infinita;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

public final class PrivacyBridge {
    private final Activity activity;
    private final WebView webView;
    private final Runnable onAdsAllowed;
    private final ConsentInformation consentInformation;

    public PrivacyBridge(Activity activity, WebView webView, Runnable onAdsAllowed) {
        this.activity = activity;
        this.webView = webView;
        this.onAdsAllowed = onAdsAllowed;
        this.consentInformation = UserMessagingPlatform.getConsentInformation(activity);
    }

    public void requestConsent() {
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        consentInformation.requestConsentInfoUpdate(
            activity,
            params,
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, error -> finishConsent()),
            error -> finishConsent()
        );
    }

    private void finishConsent() {
        if (consentInformation.canRequestAds()) onAdsAllowed.run();
        notifyAvailability();
    }

    public boolean canRequestAds() {
        return consentInformation.canRequestAds();
    }

    @JavascriptInterface
    public boolean isPrivacyOptionsRequired() {
        return consentInformation.getPrivacyOptionsRequirementStatus()
            == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
    }

    @JavascriptInterface
    public void openPrivacyOptions() {
        activity.runOnUiThread(() -> UserMessagingPlatform.showPrivacyOptionsForm(activity, error -> {
            if (consentInformation.canRequestAds()) onAdsAllowed.run();
            notifyAvailability();
        }));
    }

    private void notifyAvailability() {
        boolean required = isPrivacyOptionsRequired();
        String script = "window.dispatchEvent(new CustomEvent('orbita-privacy-ready',{detail:{required:"
            + required + "}}))";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }
}
