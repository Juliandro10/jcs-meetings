package com.jcs.tnme;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;

public class ChapterActivity extends Activity {
    private WebView webView;
    private ProgressBar progress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_chapter);

        progress = (ProgressBar) findViewById(R.id.progress);
        webView = (WebView) findViewById(R.id.webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        webView.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    progress.setVisibility(View.GONE);
                }

                @Override
                @SuppressWarnings("deprecation")
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    return openBibleLink(url);
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request == null || !request.isForMainFrame()) {
                        return false;
                    }
                    Uri uri = request.getUrl();
                    return openBibleLink(uri != null ? uri.toString() : null);
                }
            });

        BibleLinkParser.Target target = BibleLinkParser.parseIntent(getIntent());
        if (target == null) {
            showError(getString(R.string.invalid_reference));
            return;
        }

        final int bookNumber = target.bookNumber;
        final int chapterNumber = target.chapterNumber;
        final int verseStart = target.verseStart;
        final int verseEnd = target.verseEnd;

        if (bookNumber <= 0 || chapterNumber <= 0) {
            showError(getString(R.string.invalid_reference));
            return;
        }

        if (!BiblePrefs.hasJwpub(this)) {
            showError(getString(R.string.jwpub_missing));
            Toast.makeText(this, R.string.pick_jwpub_first, Toast.LENGTH_LONG).show();
            startActivity(new Intent(this, MainActivity.class));
            finish();
            return;
        }

        loadChapter(bookNumber, chapterNumber, verseStart, verseEnd);
    }

    private boolean openBibleLink(String url) {
        BibleLinkParser.Target target = BibleLinkParser.parse(url);
        if (target == null) {
            return false;
        }
        Intent intent = BibleLinkParser.toChapterIntent(this, target);
        startActivity(intent);
        return true;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        BibleLinkParser.Target target = BibleLinkParser.parseIntent(intent);
        if (target != null && target.bookNumber > 0 && target.chapterNumber > 0) {
            loadChapter(target.bookNumber, target.chapterNumber, target.verseStart, target.verseEnd);
        }
    }

    private void loadChapter(
        final int bookNumber, final int chapterNumber, final int verseStart, final int verseEnd) {
        progress.setVisibility(View.VISIBLE);
        final File jwpub = BiblePrefs.getJwpubFile(this);

        new Thread(
                new Runnable() {
                    @Override
                    public void run() {
                        try {
                            final JwpubReader reader = JwpubReader.open(jwpub, getCacheDir());
                            final JwpubReader.ChapterContent chapter =
                                reader.loadChapter(bookNumber, chapterNumber);
                            final String wrapped =
                                BibleHtml.wrapChapter(
                                    chapter.bookTitle,
                                    chapter.chapterNumber,
                                    chapter.html,
                                    chapter.publicationCss,
                                    verseStart,
                                    verseEnd);

                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        setTitle(chapter.bookTitle + " " + chapter.chapterNumber);
                                        webView.loadDataWithBaseURL(
                                            "file:///android_asset/", wrapped, "text/html", "UTF-8", null);
                                    }
                                });
                        } catch (final Exception e) {
                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        showError(e.getMessage());
                                    }
                                });
                        }
                    }
                })
            .start();
    }

    private void showError(String message) {
        progress.setVisibility(View.GONE);
        String safe = message != null ? message : getString(R.string.chapter_load_failed);
        webView.loadData(
            "<html><body><p>" + safe + "</p></body></html>", "text/html", "UTF-8");
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
