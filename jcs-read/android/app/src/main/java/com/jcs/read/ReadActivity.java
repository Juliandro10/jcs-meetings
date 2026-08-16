package com.jcs.read;

import android.app.Activity;
import android.content.Intent;
import android.graphics.PorterDuff;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class ReadActivity extends Activity {
    private WebView webView;
    private TextView textSizeLabel;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_read);

        final ProgressBar progress = (ProgressBar) findViewById(R.id.progress);
        webView = (WebView) findViewById(R.id.webView);
        textSizeLabel = (TextView) findViewById(R.id.textSizeLabel);
        TextView readTitle = (TextView) findViewById(R.id.readTitle);
        ImageButton backButton = (ImageButton) findViewById(R.id.backButton);
        Button textSmallerButton = (Button) findViewById(R.id.textSmallerButton);
        Button textLargerButton = (Button) findViewById(R.id.textLargerButton);

        backButton.setColorFilter(0xFFFFFFFF, PorterDuff.Mode.SRC_ATOP);
        backButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    finish();
                }
            });

        String title = getIntent().getStringExtra("title");
        String weekFolder = getIntent().getStringExtra("weekFolder");
        String htmlFile = getIntent().getStringExtra("htmlFile");
        String pkg = getIntent().getStringExtra("pkg");
        if (pkg == null) pkg = JcsPackage.MEETINGS;
        if (title != null) {
            readTitle.setText(title);
            setTitle(title);
        }

        textSmallerButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    JcsPrefs.adjustTextZoomIndex(ReadActivity.this, -1);
                    refreshTextSizeUi();
                }
            });
        textLargerButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    JcsPrefs.adjustTextZoomIndex(ReadActivity.this, 1);
                    refreshTextSizeUi();
                }
            });
        refreshTextSizeUi();

        ReadingWebViewHelper.configure(webView, false);

        webView.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    progress.setVisibility(View.GONE);
                }

                @Override
                public void onScaleChanged(WebView view, float oldScale, float newScale) {
                    if (Math.abs(newScale - oldScale) > 0.001f) {
                        view.setInitialScale(0);
                    }
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
            HtmlLoader.loadWeekDocument(this, weekFolder, htmlFile, pkg, webView, progress);
        } else {
            showMissing(progress);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            ReadingWebViewHelper.applyTextZoom(webView);
            refreshTextSizeUi();
        }
    }

    private void refreshTextSizeUi() {
        textSizeLabel.setText(JcsPrefs.getTextZoomLabel(this));
        if (webView != null) {
            ReadingWebViewHelper.applyTextZoom(webView);
        }
    }

    private void showMissing(ProgressBar progress) {
        progress.setVisibility(View.GONE);
        webView.loadData(
            "<html><body><p>Arquivo não encontrado.</p></body></html>", "text/html", "UTF-8");
    }

    private boolean handleLink(String url) {
        if (BibleLinkHelper.isBibleLink(url)) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.setPackage("com.jcs.tnme");
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(intent);
                return true;
            } catch (Exception e) {
                Toast.makeText(
                        this,
                        getString(R.string.bible_app_missing),
                        Toast.LENGTH_LONG)
                    .show();
                return true;
            }
        }

        if (SongLinkHelper.isSongLink(url)) {
            String tnmeUri = SongLinkHelper.toTnmeUri(url);
            if (tnmeUri == null) {
                return false;
            }
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(tnmeUri));
                intent.setPackage("com.jcs.tnme.cantico");
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(intent);
                return true;
            } catch (Exception e) {
                Toast.makeText(
                        this,
                        getString(R.string.cantico_app_missing),
                        Toast.LENGTH_LONG)
                    .show();
                return true;
            }
        }

        return false;
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
