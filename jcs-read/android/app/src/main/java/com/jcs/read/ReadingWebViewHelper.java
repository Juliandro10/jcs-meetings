package com.jcs.read;

import android.os.Build;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

public final class ReadingWebViewHelper {
    private ReadingWebViewHelper() {}

    public static void configure(WebView webView, boolean javascript) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(javascript);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.HONEYCOMB) {
            settings.setDisplayZoomControls(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
        }
        webView.setHorizontalScrollBarEnabled(false);
        webView.setBackgroundColor(0xFFFFFFFF);
        webView.setOnTouchListener(
            new View.OnTouchListener() {
                @Override
                public boolean onTouch(View v, MotionEvent event) {
                    return event.getPointerCount() > 1;
                }
            });
        applyTextZoom(webView);
    }

    public static void applyTextZoom(WebView webView) {
        webView.getSettings().setTextZoom(JcsPrefs.getTextZoomPercent(webView.getContext()));
    }
}
