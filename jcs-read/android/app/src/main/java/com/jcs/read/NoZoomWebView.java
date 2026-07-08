package com.jcs.read;

import android.content.Context;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.webkit.WebView;

/** WebView de leitura — bloqueia pinch/double-touch zoom (Tab E / API 19). */
public class NoZoomWebView extends WebView {
    public NoZoomWebView(Context context) {
        super(context);
    }

    public NoZoomWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public NoZoomWebView(Context context, AttributeSet attrs, int defStyle) {
        super(context, attrs, defStyle);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (event.getPointerCount() > 1) {
            return true;
        }
        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_POINTER_DOWN || action == MotionEvent.ACTION_POINTER_UP) {
            return true;
        }
        return super.onTouchEvent(event);
    }
}
