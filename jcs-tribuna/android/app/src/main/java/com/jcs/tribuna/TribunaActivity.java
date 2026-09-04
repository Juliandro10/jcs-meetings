package com.jcs.tribuna;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
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
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import com.jcs.tribuna.bible.BibleLinkParser;
import com.jcs.tribuna.bible.BiblePrefs;
import com.jcs.tribuna.bible.TribunaBiblePanel;

public class TribunaActivity extends Activity implements TribunaBiblePanel.Host {
    private WebView outlineWebView;
    private WebView bibleWebView;
    private TextView textSizeLabel;
    private TextView bibleReference;
    private TextView bibleEmpty;
    private ProgressBar bibleProgress;
    private View biblePane;
    private View splitDivider;
    private TextView rotateHint;
    private Button toggleBibleButton;
    private boolean biblePanelVisible = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_tribuna);

        final ProgressBar outlineProgress = (ProgressBar) findViewById(R.id.outlineProgress);
        outlineWebView = (WebView) findViewById(R.id.outlineWebView);
        bibleWebView = (WebView) findViewById(R.id.bibleWebView);
        textSizeLabel = (TextView) findViewById(R.id.textSizeLabel);
        bibleReference = (TextView) findViewById(R.id.bibleReference);
        bibleEmpty = (TextView) findViewById(R.id.bibleEmpty);
        bibleProgress = (ProgressBar) findViewById(R.id.bibleProgress);
        biblePane = findViewById(R.id.biblePane);
        splitDivider = findViewById(R.id.splitDivider);
        rotateHint = (TextView) findViewById(R.id.rotateHint);
        toggleBibleButton = (Button) findViewById(R.id.toggleBibleButton);
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
                    JcsPrefs.adjustTextZoomIndex(TribunaActivity.this, -1);
                    refreshTextSizeUi();
                }
            });
        textLargerButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    JcsPrefs.adjustTextZoomIndex(TribunaActivity.this, 1);
                    refreshTextSizeUi();
                }
            });

        toggleBibleButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    biblePanelVisible = !biblePanelVisible;
                    applyLayoutForOrientation(getResources().getConfiguration().orientation);
                }
            });

        refreshTextSizeUi();
        ReadingWebViewHelper.configure(outlineWebView, true);
        ReadingWebViewHelper.configure(bibleWebView, true);
        bibleWebView.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    TribunaBiblePanel.scrollToHighlightedVerse(view);
                    view.postDelayed(
                        new Runnable() {
                            @Override
                            public void run() {
                                TribunaBiblePanel.scrollToHighlightedVerse(view);
                            }
                        },
                        250);
                }
            });

        outlineWebView.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    outlineProgress.setVisibility(View.GONE);
                    ReadingWebViewHelper.applyTextZoom(view);
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

        TribunaBiblePanel.showEmpty(this, getString(R.string.tribuna_bible_empty));
        applyLayoutForOrientation(getResources().getConfiguration().orientation);

        if (weekFolder != null && htmlFile != null) {
            HtmlLoader.loadWeekDocument(this, weekFolder, htmlFile, pkg, outlineWebView, outlineProgress);
        } else {
            outlineProgress.setVisibility(View.GONE);
            outlineWebView.loadData(
                "<html><body><p>Arquivo não encontrado.</p></body></html>", "text/html", "UTF-8");
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyLayoutForOrientation(newConfig.orientation);
    }

    private void applyLayoutForOrientation(int orientation) {
        boolean landscape = orientation == Configuration.ORIENTATION_LANDSCAPE;
        if (rotateHint != null) {
            rotateHint.setVisibility(landscape ? View.GONE : View.VISIBLE);
        }
        if (biblePane != null) {
            biblePane.setVisibility(landscape && biblePanelVisible ? View.VISIBLE : View.GONE);
        }
        if (splitDivider != null) {
            splitDivider.setVisibility(landscape && biblePanelVisible ? View.VISIBLE : View.GONE);
        }
        if (toggleBibleButton != null) {
            toggleBibleButton.setVisibility(landscape ? View.VISIBLE : View.GONE);
            toggleBibleButton.setText(
                biblePanelVisible
                    ? getString(R.string.tribuna_hide_bible)
                    : getString(R.string.tribuna_show_bible));
        }

        LinearLayout splitContainer = (LinearLayout) findViewById(R.id.splitContainer);
        if (splitContainer != null && splitContainer.getChildCount() > 0) {
            View outlinePane = splitContainer.getChildAt(0);
            if (outlinePane != null && outlinePane.getLayoutParams() instanceof LinearLayout.LayoutParams) {
                LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) outlinePane.getLayoutParams();
                params.weight = landscape && biblePanelVisible ? 7f : 10f;
                outlinePane.setLayoutParams(params);
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (outlineWebView != null) {
            ReadingWebViewHelper.applyTextZoom(outlineWebView);
            refreshTextSizeUi();
        }
    }

    private void refreshTextSizeUi() {
        textSizeLabel.setText(JcsPrefs.getTextZoomLabel(this));
        if (outlineWebView != null) {
            ReadingWebViewHelper.applyTextZoom(outlineWebView);
        }
    }

    private boolean handleLink(String url) {
        if (PageJumpHelper.isPageJump(url)) {
            PageJumpHelper.scrollTo(outlineWebView, url);
            return true;
        }

        BibleLinkParser.Target bibleTarget = BibleLinkParser.parse(url);
        if (bibleTarget != null) {
            if (!BiblePrefs.hasJwpub(this)) {
                Toast.makeText(this, R.string.tribuna_jwpub_missing, Toast.LENGTH_LONG).show();
                startActivity(new Intent(this, TribunaSettingsActivity.class));
                return true;
            }
            if (getResources().getConfiguration().orientation != Configuration.ORIENTATION_LANDSCAPE) {
                Toast.makeText(this, R.string.tribuna_rotate_hint, Toast.LENGTH_LONG).show();
                return true;
            }
            biblePanelVisible = true;
            applyLayoutForOrientation(Configuration.ORIENTATION_LANDSCAPE);
            TribunaBiblePanel.loadReference(this, bibleTarget);
            return true;
        }

        if (SongLinkHelper.isSongLink(url)) {
            String tnmeUri = SongLinkHelper.toTnmeUri(url);
            if (tnmeUri == null) return false;
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(tnmeUri));
                intent.setPackage("com.jcs.tnme.cantico");
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(intent);
                return true;
            } catch (Exception e) {
                Toast.makeText(this, R.string.cantico_app_missing, Toast.LENGTH_LONG).show();
                return true;
            }
        }

        return false;
    }

    @Override
    public Activity getActivity() {
        return this;
    }

    @Override
    public WebView getBibleWebView() {
        return bibleWebView;
    }

    @Override
    public ProgressBar getBibleProgress() {
        return bibleProgress;
    }

    @Override
    public TextView getBibleReference() {
        return bibleReference;
    }

    @Override
    public TextView getBibleEmpty() {
        return bibleEmpty;
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && outlineWebView != null && outlineWebView.canGoBack()) {
            outlineWebView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
