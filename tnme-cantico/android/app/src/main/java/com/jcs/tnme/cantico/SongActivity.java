package com.jcs.tnme.cantico;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;

public class SongActivity extends Activity {
    private WebView webView;
    private ProgressBar progress;
    private TnmeTopBar topBar;
    private int documentId;
    private int songNumber;
    private String songTitle;
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
                        startActivity(new Intent(SongActivity.this, SearchActivity.class));
                    }

                    @Override
                    public void onBooks() {
                        Intent intent = new Intent(SongActivity.this, MainActivity.class);
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        startActivity(intent);
                    }

                    @Override
                    public void onMenu() {
                        startActivity(new Intent(SongActivity.this, SettingsActivity.class));
                    }
                });
        topBar.setShowBooksButton(true);
        topBar.setShowMenuButton(true);

        ReadingWebViewHelper.configure(webView, true);
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
                    return openLink(url);
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request == null || !request.isForMainFrame()) {
                        return false;
                    }
                    Uri uri = request.getUrl();
                    return openLink(uri != null ? uri.toString() : null);
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

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            ReadingWebViewHelper.applyTextZoom(webView);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyIntent(intent);
    }

    private void applyIntent(Intent intent) {
        SongLinkParser.Target target = SongLinkParser.parseIntent(intent);
        if (target == null) {
            showError(getString(R.string.invalid_reference));
            return;
        }

        songTitle = intent.getStringExtra("songTitle");
        resolveTarget(target);
    }

    private void resolveTarget(final SongLinkParser.Target target) {
        progress.setVisibility(View.VISIBLE);
        final File jwpub = BiblePrefs.getJwpubFile(this);

        new Thread(
                new Runnable() {
                    @Override
                    public void run() {
                        try {
                            final JwpubReader reader = JwpubReader.open(jwpub, getCacheDir());
                            editionLabel = reader.getEditionLabel();

                            JwpubReader.SongInfo info = null;
                            if (target.documentId > 0) {
                                info = reader.findByDocumentId(target.documentId);
                            } else if (target.songNumber > 0) {
                                info = reader.findBySongNumber(target.songNumber);
                            } else if (target.mepsDocumentId > 0) {
                                info = reader.findByMepsDocumentId(target.mepsDocumentId);
                            }

                            if (info == null) {
                                throw new IllegalStateException("Cântico não encontrado.");
                            }

                            final JwpubReader.SongContent song = reader.loadSong(info.documentId);
                            documentId = song.documentId;
                            songNumber = song.songNumber;
                            if (songTitle == null || songTitle.trim().length() == 0) {
                                songTitle = song.title;
                            }

                            final String wrapped =
                                SongHtml.wrapSong(song.songNumber, song.title, song.html, song.publicationCss);

                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
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

    private void updateTopBar() {
        if (songNumber > 0) {
            topBar.setTitle(getString(R.string.song_title_number, songNumber));
        } else {
            topBar.setTitle(getString(R.string.song_title));
        }
        if (editionLabel == null || editionLabel.length() == 0) {
            editionLabel = TnmeTopBar.editionSubtitle(this);
        }
        topBar.setSubtitle(songTitle != null ? songTitle : editionLabel);
    }

    private boolean openLink(String url) {
        if (url == null) return false;

        if (BibleLinkHelper.isBibleLink(url)) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.setPackage("com.jcs.tnme");
            if (intent.resolveActivity(getPackageManager()) != null) {
                startActivity(intent);
                return true;
            }
            Toast.makeText(this, R.string.bible_app_missing, Toast.LENGTH_LONG).show();
            return true;
        }

        SongLinkParser.Target target = SongLinkParser.parse(url);
        if (target != null) {
            Intent intent = SongLinkParser.toSongIntent(this, target);
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(intent);
            return true;
        }

        return false;
    }

    private void showError(String message) {
        progress.setVisibility(View.GONE);
        String safe = message != null ? message : getString(R.string.song_load_failed);
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
