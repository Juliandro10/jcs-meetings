package com.jcs.read2;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.PorterDuff;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import com.jcs.read2.bible.BibleLinkParser;
import com.jcs.read2.bible.BiblePanel;
import com.jcs.read2.bible.BiblePrefs;

public class ReaderActivity extends Activity implements BiblePanel.Host {
    private static final int TAB_VERSE = 0;
    private static final int TAB_NOTES = 1;

    private WebView outlineWebView;
    private WebView bibleWebView;
    private WebView notesWebView;
    private TextView textSizeLabel;
    private TextView bibleReference;
    private TextView bibleEmpty;
    private ProgressBar bibleProgress;
    private View sidePane;
    private View splitDivider;
    private View outlinePane;
    private LinearLayout splitContainer;
    private Button togglePanelButton;
    private Button tabVerseButton;
    private Button tabNotesButton;
    private View verseStack;

    private boolean panelVisible = true;
    private int panelTab = TAB_VERSE;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_reader);

        final ProgressBar outlineProgress = (ProgressBar) findViewById(R.id.outlineProgress);
        outlineWebView = (WebView) findViewById(R.id.outlineWebView);
        bibleWebView = (WebView) findViewById(R.id.bibleWebView);
        notesWebView = (WebView) findViewById(R.id.notesWebView);
        textSizeLabel = (TextView) findViewById(R.id.textSizeLabel);
        bibleReference = (TextView) findViewById(R.id.bibleReference);
        bibleEmpty = (TextView) findViewById(R.id.bibleEmpty);
        bibleProgress = (ProgressBar) findViewById(R.id.bibleProgress);
        sidePane = findViewById(R.id.sidePane);
        splitDivider = findViewById(R.id.splitDivider);
        outlinePane = findViewById(R.id.outlinePane);
        splitContainer = (LinearLayout) findViewById(R.id.splitContainer);
        togglePanelButton = (Button) findViewById(R.id.togglePanelButton);
        tabVerseButton = (Button) findViewById(R.id.tabVerseButton);
        tabNotesButton = (Button) findViewById(R.id.tabNotesButton);
        verseStack = findViewById(R.id.verseStack);
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
                    JcsPrefs.adjustTextZoomIndex(ReaderActivity.this, -1);
                    refreshTextSizeUi();
                }
            });
        textLargerButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    JcsPrefs.adjustTextZoomIndex(ReaderActivity.this, 1);
                    refreshTextSizeUi();
                }
            });
        togglePanelButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    panelVisible = !panelVisible;
                    applyLayoutForOrientation(getResources().getConfiguration().orientation);
                }
            });
        tabVerseButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showPanelTab(TAB_VERSE);
                }
            });
        tabNotesButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showPanelTab(TAB_NOTES);
                }
            });

        refreshTextSizeUi();
        ReadingWebViewHelper.configure(outlineWebView, true);
        ReadingWebViewHelper.configure(bibleWebView, true);
        ReadingWebViewHelper.configure(notesWebView, true);
        outlineWebView.setWebViewClient(createLinkClient(outlineProgress));
        notesWebView.setWebViewClient(createLinkClient(null));
        bibleWebView.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    BiblePanel.scrollToHighlightedVerse(view);
                    view.postDelayed(
                        new Runnable() {
                            @Override
                            public void run() {
                                BiblePanel.scrollToHighlightedVerse(view);
                            }
                        },
                        250);
                }
            });

        BiblePanel.showEmpty(this, getString(R.string.bible_empty));
        applyLayoutForOrientation(getResources().getConfiguration().orientation);

        if (weekFolder != null && htmlFile != null) {
            HtmlLoader.loadSplitDocument(
                this,
                weekFolder,
                htmlFile,
                pkg,
                outlineProgress,
                new HtmlLoader.SplitCallback() {
                    @Override
                    public void onLoaded(
                        String outlineHtml, String fileUrl, String notesHtml, boolean notesPresent) {
                        if (fileUrl != null) {
                            outlineWebView.loadUrl(fileUrl);
                        } else {
                            outlineWebView.loadDataWithBaseURL(
                                "about:blank",
                                outlineHtml != null ? outlineHtml : "",
                                "text/html",
                                "UTF-8",
                                null);
                        }
                        if (notesPresent) {
                            notesWebView.loadDataWithBaseURL(
                                "about:blank", notesHtml, "text/html", "UTF-8", null);
                            showPanelTab(TAB_NOTES);
                        } else {
                            notesWebView.loadDataWithBaseURL(
                                "about:blank",
                                NotesSplit.emptyNotesHtml(getString(R.string.notes_empty)),
                                "text/html",
                                "UTF-8",
                                null);
                            showPanelTab(TAB_VERSE);
                        }
                    }

                    @Override
                    public void onError(String message) {
                        outlineWebView.loadData(
                            "<html><body style=\"font-family:sans-serif;padding:16px;\"><p>"
                                + message
                                + "</p></body></html>",
                            "text/html",
                            "UTF-8");
                    }
                });
        }
    }

    private WebViewClient createLinkClient(final ProgressBar progress) {
        return new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (progress != null) progress.setVisibility(View.GONE);
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
        };
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyLayoutForOrientation(newConfig.orientation);
    }

    private void applyLayoutForOrientation(int orientation) {
        boolean landscape = orientation == Configuration.ORIENTATION_LANDSCAPE;
        splitContainer.setOrientation(landscape ? LinearLayout.HORIZONTAL : LinearLayout.VERTICAL);

        if (splitDivider != null) {
            ViewGroup.LayoutParams dividerParams = splitDivider.getLayoutParams();
            if (dividerParams instanceof LinearLayout.LayoutParams) {
                LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) dividerParams;
                if (landscape) {
                    lp.width = 1;
                    lp.height = ViewGroup.LayoutParams.MATCH_PARENT;
                } else {
                    lp.width = ViewGroup.LayoutParams.MATCH_PARENT;
                    lp.height = 1;
                }
                splitDivider.setLayoutParams(lp);
            }
        }

        if (outlinePane != null && outlinePane.getLayoutParams() instanceof LinearLayout.LayoutParams) {
            LinearLayout.LayoutParams outlineLp = (LinearLayout.LayoutParams) outlinePane.getLayoutParams();
            LinearLayout.LayoutParams panelLp = (LinearLayout.LayoutParams) sidePane.getLayoutParams();
            if (landscape) {
                outlineLp.width = 0;
                outlineLp.height = ViewGroup.LayoutParams.MATCH_PARENT;
                outlineLp.weight = panelVisible ? 7f : 10f;
                panelLp.width = 0;
                panelLp.height = ViewGroup.LayoutParams.MATCH_PARENT;
                panelLp.weight = 3f;
            } else {
                outlineLp.width = ViewGroup.LayoutParams.MATCH_PARENT;
                outlineLp.height = 0;
                outlineLp.weight = panelVisible ? 6f : 10f;
                panelLp.width = ViewGroup.LayoutParams.MATCH_PARENT;
                panelLp.height = 0;
                panelLp.weight = 4f;
            }
            outlinePane.setLayoutParams(outlineLp);
            sidePane.setLayoutParams(panelLp);
        }

        sidePane.setVisibility(panelVisible ? View.VISIBLE : View.GONE);
        splitDivider.setVisibility(panelVisible ? View.VISIBLE : View.GONE);
        togglePanelButton.setText(panelVisible ? R.string.panel_hide : R.string.panel_show);
    }

    private void showPanelTab(int tab) {
        panelTab = tab;
        boolean verse = tab == TAB_VERSE;
        verseStack.setVisibility(verse ? View.VISIBLE : View.GONE);
        notesWebView.setVisibility(verse ? View.GONE : View.VISIBLE);
        styleTab(tabVerseButton, verse);
        styleTab(tabNotesButton, !verse);
    }

    private void styleTab(Button tab, boolean selected) {
        tab.setBackgroundResource(selected ? R.drawable.tab_selected : R.drawable.tab_unselected);
        tab.setTextColor(getResources().getColor(selected ? R.color.jcs_white : R.color.jcs_muted));
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
                Toast.makeText(this, R.string.bible_jwpub_missing, Toast.LENGTH_LONG).show();
                startActivity(new Intent(this, BibleSettingsActivity.class));
                return true;
            }
            panelVisible = true;
            applyLayoutForOrientation(getResources().getConfiguration().orientation);
            showPanelTab(TAB_VERSE);
            BiblePanel.loadReference(this, bibleTarget);
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
}
