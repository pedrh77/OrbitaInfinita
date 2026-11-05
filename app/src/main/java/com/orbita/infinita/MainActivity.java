package com.orbita.infinita;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.ViewGroup;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.ComponentActivity;
import androidx.core.view.WindowCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import com.google.android.gms.ads.MobileAds;
import org.json.JSONObject;

public final class MainActivity extends ComponentActivity {
    private static final String GAME_URL = "file:///android_asset/index.html";

    private WebView webView;
    private AdMobBridge adMobBridge;
    private PrivacyBridge privacyBridge;
    private boolean adsInitialized;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.rgb(7, 9, 26));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 9, 26));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false);
        }
        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        if (BuildConfig.DEBUG) {
            webView.setWebChromeClient(new WebChromeClient() {
                @Override public boolean onConsoleMessage(ConsoleMessage message) {
                    if (message.message().startsWith("[OrbitaPerf] ") || message.message().startsWith("[OrbitaBench] ")) {
                        String tag = message.message().startsWith("[OrbitaPerf] ") ? "OrbitaPerf" : "OrbitaBench";
                        Log.i(tag, message.message().substring(tag.length() + 3));
                        return true;
                    }
                    if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                        Log.e("OrbitaJS", message.message() + " @ " + message.sourceId() + ":" + message.lineNumber());
                    }
                    return super.onConsoleMessage(message);
                }
            });
        }

        adMobBridge = new AdMobBridge(this, webView);
        privacyBridge = new PrivacyBridge(this, webView, this::initializeAds);
        webView.addJavascriptInterface(adMobBridge, "OrbitaNativeAds");
        webView.addJavascriptInterface(privacyBridge, "OrbitaNativePrivacy");

        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                if (!BuildConfig.DEBUG || !GAME_URL.equals(url)) return;
                String scenario = getIntent().getStringExtra("orbita.benchmark");
                if (scenario != null) {
                    try {
                        JSONObject options = new JSONObject();
                        options.put("scenario", scenario);
                        options.put("renderer", getIntent().getStringExtra("orbita.renderer") == null ? "canvas" : getIntent().getStringExtra("orbita.renderer"));
                        options.put("quality", getIntent().getStringExtra("orbita.quality") == null ? "balanced" : getIntent().getStringExtra("orbita.quality"));
                        options.put("seconds", Math.max(5, Math.min(180, getIntent().getIntExtra("orbita.seconds", 20))));
                        options.put("seed", getIntent().getIntExtra("orbita.seed", 12345));
                        view.evaluateJavascript("window.OrbitaBenchmark?.(" + options.toString() + ")", null);
                    } catch (Exception error) {
                        Log.e("OrbitaBench", "Invalid benchmark options", error);
                    }
                } else if (getIntent().getBooleanExtra("orbita.profile", false)) {
                    view.evaluateJavascript("window.OrbitaMeasurePerformance?.()", null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri.toString().startsWith("file:///android_asset/")) {
                    return false;
                }
                openExternal(uri);
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (url.startsWith("file:///android_asset/")) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view.getParent() instanceof ViewGroup) {
                    ((ViewGroup) view.getParent()).removeView(view);
                }
                view.destroy();
                recreate();
                return true;
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                webView.evaluateJavascript("Boolean(window.OrbitaHandleBack && window.OrbitaHandleBack())", value -> {
                    if (!"true".equals(value)) {
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                });
            }
        });

        webView.loadUrl(GAME_URL);
        privacyBridge.requestConsent();
    }

    private void initializeAds() {
        if (adsInitialized || !privacyBridge.canRequestAds()) return;
        adsInitialized = true;
        new Thread(() -> MobileAds.initialize(getApplicationContext(), status -> runOnUiThread(() -> {
            if (!isFinishing() && !isDestroyed()) adMobBridge.startLoading();
        })), "orbita-ads-init").start();
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"mailto".equals(scheme)) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // O jogo continua funcional mesmo sem um app capaz de abrir o link.
        }
    }

    @Override
    protected void onPause() {
        webView.evaluateJavascript("window.dispatchEvent(new Event('orbita-app-pause'))", null);
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        webView.evaluateJavascript("window.dispatchEvent(new Event('orbita-app-resume'))", null);
    }

    @Override
    protected void onDestroy() {
        webView.removeJavascriptInterface("OrbitaNativeAds");
        webView.removeJavascriptInterface("OrbitaNativePrivacy");
        webView.destroy();
        super.onDestroy();
    }
}
