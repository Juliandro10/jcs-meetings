package com.jcs.read;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

public class ReadActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_read);

        final ProgressBar progress = (ProgressBar) findViewById(R.id.progress);
        webView = (WebView) findViewById(R.id.webView);

        String title = getIntent().getStringExtra("title");
        String weekFolder = getIntent().getStringExtra("weekFolder");
        String htmlFile = getIntent().getStringExtra("htmlFile");
        if (title != null) {
            setTitle(title);
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(false);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
        }

        webView.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    progress.setVisibility(View.GONE);
                }

                @Override
                @SuppressWarnings("deprecation")
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    return handleLink(url);
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request == null || !request.isForMainFrame()) {
                        return false;
                    }
                    Uri uri = request.getUrl();
                    return handleLink(uri != null ? uri.toString() : null);
                }
            });

        if (weekFolder != null && htmlFile != null) {
            HtmlLoader.loadWeekDocument(this, weekFolder, htmlFile, webView);
        } else {
            showMissing(progress);
        }
    }

    private void showMissing(ProgressBar progress) {
        progress.setVisibility(View.GONE);
        webView.loadData(
            "<html><body><p>Arquivo não encontrado.</p></body></html>", "text/html", "UTF-8");
    }

    private boolean handleLink(String url) {
        if (!BibleLinkHelper.isBibleLink(url)) {
            return false;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
            return true;
        } catch (Exception e) {
            Toast.makeText(
                    this,
                    "Instale o TNME Bíblia para abrir referências bíblicas.",
                    Toast.LENGTH_LONG)
                .show();
            return true;
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
