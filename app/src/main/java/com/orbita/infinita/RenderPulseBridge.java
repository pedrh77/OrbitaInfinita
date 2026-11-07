package com.orbita.infinita;

import android.app.Activity;
import android.view.Choreographer;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/** Aligns WebGL updates with the host View's display cadence. All state lives on the UI thread. */
public final class RenderPulseBridge {
    private final Activity activity;
    private final boolean enabled;
    private final boolean forceProbe;
    private WebView webView;
    private boolean resumed;
    private boolean focused;
    private boolean posted;
    private int requestedRate;
    private long lastInvalidation;
    private final Choreographer.FrameCallback frame = new Choreographer.FrameCallback() {
        @Override public void doFrame(long timeNanos) {
            posted = false;
            int rate = effectiveRate();
            if (!resumed || !focused || webView == null || rate == 0) return;
            // Normal mode follows the display, including 90/120 Hz. Economic mode draws at 30.
            if (rate != 30 || lastInvalidation == 0 || timeNanos - lastInvalidation >= 32_833_333L) {
                webView.invalidate();
                lastInvalidation = timeNanos;
            }
            schedule();
        }
    };

    RenderPulseBridge(Activity activity, WebView webView, boolean enabled, boolean forceProbe) {
        this.activity = activity;
        this.webView = webView;
        this.enabled = enabled;
        this.forceProbe = forceProbe;
    }

    @JavascriptInterface public void setFrameRate(int fps) {
        final int rate = fps == 30 || fps == 60 ? fps : 0;
        activity.runOnUiThread(() -> {
            if (webView == null) return;
            if (requestedRate != rate) lastInvalidation = 0;
            requestedRate = rate;
            schedule();
        });
    }

    private int effectiveRate() { return enabled ? (forceProbe ? 60 : requestedRate) : 0; }
    private void schedule() {
        if (!resumed || !focused || webView == null || effectiveRate() == 0) {
            Choreographer.getInstance().removeFrameCallback(frame);
            posted = false;
        } else if (!posted) {
            posted = true;
            Choreographer.getInstance().postFrameCallback(frame);
        }
    }

    void resume() { resumed = true; schedule(); }
    void focus(boolean value) { focused = value; schedule(); }
    void pause() { resumed = false; lastInvalidation = 0; schedule(); }
    void destroy() { pause(); webView = null; requestedRate = 0; }
}
