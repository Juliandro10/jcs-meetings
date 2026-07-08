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
    private TnmeTopBar topBar;
    private int bookNumber;
    private int chapterNumber;
    private String bookTitle;
    private String editionLabel;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_chapter);

        progress = (ProgressBar) findViewById(R.id.progress);
        webView = (WebView) findViewById(R.id.webView);
        topBar =
            TnmeTopBar.bind(
                this,
                findViewById(R.id.tnmeTopBar),
                new TnmeTopBar.Actions() {
                    @Override
                    public void onBack() {
                        finish();
                    }

                    @Override
                    public void onSearch() {
                        startActivity(new Intent(ChapterActivity.this, SearchActivity.class));
                    }

                    @Override
                    public void onBooks() {
                        int count = getIntent().getIntExtra("chapterCount", 0);
                        if (count > 0 && bookNumber > 0) {
                            Intent intent = new Intent(ChapterActivity.this, BookActivity.class);
                            intent.putExtra("bookNumber", bookNumber);
                            intent.putExtra("bookTitle", bookTitle);
                            intent.putExtra("chapterCount", count);
                            startActivity(intent);
                        } else {
                            Intent intent = new Intent(ChapterActivity.this, MainActivity.class);
                            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                            startActivity(intent);
                        }
                    }

                    @Override
                    public void onMenu() {
                        startActivity(new Intent(ChapterActivity.this, SettingsActivity.class));
                    }
                });
        topBar.setShowBooksButton(true);
        topBar.setShowMenuButton(true);

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

        if (!BiblePrefs.hasJwpub(this)) {
            showError(getString(R.string.jwpub_missing));
            Toast.makeText(this, R.string.pick_jwpub_first, Toast.LENGTH_LONG).show();
            startActivity(new Intent(this, MainActivity.class));
            finish();
            return;
        }

        applyIntent(getIntent());
    }

    private void applyIntent(Intent intent) {
        BibleLinkParser.Target target = BibleLinkParser.parseIntent(intent);
        if (target == null) {
            showError(getString(R.string.invalid_reference));
            return;
        }

        bookNumber = target.bookNumber;
        chapterNumber = target.chapterNumber;
        bookTitle = intent.getStringExtra("bookTitle");
        if (bookTitle == null || bookTitle.trim().length() == 0) {
            bookTitle = getString(R.string.chapter_title);
        }

        if (bookNumber <= 0 || chapterNumber <= 0) {
            showError(getString(R.string.invalid_reference));
            return;
        }

        updateTopBar();
        loadChapter(bookNumber, chapterNumber, target.verses);
    }

    private void updateTopBar() {
        topBar.setTitle(bookTitle + " " + chapterNumber);
        if (editionLabel == null || editionLabel.length() == 0) {
            editionLabel = TnmeTopBar.editionSubtitle(this);
        }
        topBar.setSubtitle(editionLabel);
    }

    private boolean openBibleLink(String url) {
        BibleLinkParser.Target target = BibleLinkParser.parse(url);
        if (target == null) {
            return false;
        }
        Intent intent = BibleLinkParser.toChapterIntent(this, target);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        return true;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyIntent(intent);
    }

    private void loadChapter(final int bookNumber, final int chapterNumber, final int[] highlightVerses) {
        progress.setVisibility(View.VISIBLE);
        final File jwpub = BiblePrefs.getJwpubFile(this);

        new Thread(
                new Runnable() {
                    @Override
                    public void run() {
                        try {
                            final JwpubReader reader = JwpubReader.open(jwpub, getCacheDir());
                            editionLabel = reader.getEditionLabel();
                            final JwpubReader.ChapterContent chapter =
                                reader.loadChapter(bookNumber, chapterNumber);
                            if (bookTitle == null || bookTitle.trim().length() == 0) {
                                bookTitle = chapter.bookTitle;
                            }
                            final String wrapped =
                                BibleHtml.wrapChapter(
                                    chapter.bookTitle,
                                    bookNumber,
                                    chapter.chapterNumber,
                                    chapter.html,
                                    chapter.publicationCss,
                                    highlightVerses);
                            final String resolvedTitle = bookTitle;

                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        bookTitle = resolvedTitle;
                                        updateTopBar();
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
            "<html><body style='background:#121212;color:#fff;font-family:sans-serif;padding:16px;'><p>"
                + safe
                + "</p></body></html>",
            "text/html",
            "UTF-8");
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
