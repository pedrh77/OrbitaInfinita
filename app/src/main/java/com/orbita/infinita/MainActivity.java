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
import android.view.WindowManager;

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
    private RenderPulseBridge renderPulseBridge;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
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
        renderPulseBridge = new RenderPulseBridge(this, webView,
                !(BuildConfig.DEBUG && getIntent().getBooleanExtra("orbita.disable_pulse", false)),
                BuildConfig.DEBUG && getIntent().getBooleanExtra("orbita.force_redraw", false));
        webView.addJavascriptInterface(adMobBridge, "OrbitaNativeAds");
        webView.addJavascriptInterface(privacyBridge, "OrbitaNativePrivacy");
        webView.addJavascriptInterface(renderPulseBridge, "OrbitaNativeDisplay");

        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                  if (!BuildConfig.DEBUG || !(GAME_URL.equals(url) || (GAME_URL + "?benchmark=1").equals(url))) return;
                String scenario = getIntent().getStringExtra("orbita.benchmark");
                if (scenario != null) {
                    try {
                        JSONObject options = new JSONObject();
                        options.put("scenario", scenario);
                        options.put("renderer", getIntent().getStringExtra("orbita.renderer") == null ? "canvas" : getIntent().getStringExtra("orbita.renderer"));
                        options.put("quality", getIntent().getStringExtra("orbita.quality") == null ? "balanced" : getIntent().getStringExtra("orbita.quality"));
                        options.put("seconds", Math.max(5, Math.min(900, getIntent().getIntExtra("orbita.seconds", 20))));
                        options.put("seed", getIntent().getIntExtra("orbita.seed", 12345));
                        view.evaluateJavascript("window.OrbitaBenchmark?.(" + options.toString() + ")", null);
                    } catch (Exception error) {
                        Log.e("OrbitaBench", "Invalid benchmark options", error);
                    }
                } else if (getIntent().getBooleanExtra("orbita.profile", false)) {
                    view.evaluateJavascript("window.OrbitaMeasurePerformance?.()", null);
                }
                if (getIntent().getBooleanExtra("orbita.lose_context", false)) {
                    view.evaluateJavascript("setTimeout(() => { const c = document.querySelector('#orbita-pixi'); const gl = c && (c.getContext('webgl2') || c.getContext('webgl')); const e = gl && gl.getExtension('WEBGL_lose_context'); console.info('[OrbitaBench] ' + JSON.stringify({type:'context-loss-test', supported:!!e})); if(e) e.loseContext(); }, 8000)", null);
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
                renderPulseBridge.pause();
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

        boolean diagnostic = BuildConfig.DEBUG && getIntent().getStringExtra("orbita.benchmark") != null;
        webView.loadUrl(GAME_URL + (diagnostic ? "?benchmark=1" : ""));
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
        renderPulseBridge.pause();
        webView.evaluateJavascript("window.dispatchEvent(new Event('orbita-app-pause'))", null);
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        renderPulseBridge.focus(webView.hasWindowFocus());
        renderPulseBridge.resume();
        webView.onResume();
        webView.evaluateJavascript("window.dispatchEvent(new Event('orbita-app-resume'))", null);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (renderPulseBridge != null) renderPulseBridge.focus(hasFocus);
    }

    @Override
    protected void onDestroy() {
        renderPulseBridge.destroy();
        webView.removeJavascriptInterface("OrbitaNativeDisplay");
        webView.removeJavascriptInterface("OrbitaNativeAds");
        webView.removeJavascriptInterface("OrbitaNativePrivacy");
        webView.destroy();
        super.onDestroy();
    }
}
