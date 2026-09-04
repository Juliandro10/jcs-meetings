package com.jcs.tribuna.bible;

import android.app.Activity;
import android.content.Context;
import android.view.View;
import android.webkit.WebView;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.File;

public final class TribunaBiblePanel {
    public interface Host {
        Activity getActivity();

        WebView getBibleWebView();

        ProgressBar getBibleProgress();

        TextView getBibleReference();

        TextView getBibleEmpty();
    }

    private TribunaBiblePanel() {}

    public static void showEmpty(Host host, String message) {
        if (host == null) return;
        ProgressBar progress = host.getBibleProgress();
        TextView empty = host.getBibleEmpty();
        WebView webView = host.getBibleWebView();
        if (progress != null) progress.setVisibility(View.GONE);
        if (webView != null) {
            webView.setVisibility(View.GONE);
            webView.loadUrl("about:blank");
        }
        if (empty != null) {
            empty.setVisibility(View.VISIBLE);
            empty.setText(message);
        }
    }

    public static void loadReference(final Host host, final BibleLinkParser.Target target) {
        if (host == null || target == null) return;
        final Activity activity = host.getActivity();
        final Context context = activity.getApplicationContext();
        if (!BiblePrefs.hasJwpub(context)) {
            showEmpty(host, activity.getString(com.jcs.tribuna.R.string.tribuna_jwpub_missing));
            return;
        }

        final ProgressBar progress = host.getBibleProgress();
        final TextView empty = host.getBibleEmpty();
        final TextView reference = host.getBibleReference();
        final WebView webView = host.getBibleWebView();

        if (progress != null) progress.setVisibility(View.VISIBLE);
        if (empty != null) empty.setVisibility(View.GONE);
        if (webView != null) webView.setVisibility(View.INVISIBLE);

        final String refLabel = formatReference(target);

        new Thread(
                new Runnable() {
                    @Override
                    public void run() {
                        try {
                            final File jwpub = BiblePrefs.getJwpubFile(context);
                            final JwpubReader reader = JwpubReader.open(jwpub, context.getCacheDir());
                            final JwpubReader.ChapterContent chapter =
                                reader.loadChapter(target.bookNumber, target.chapterNumber);
                            final String bookLabel =
                                BookAbbrev.forBook(target.bookNumber, chapter.bookTitle);
                            final String heading =
                                bookLabel + " " + target.chapterNumber + formatVerseSuffix(target);
                            final String wrapped =
                                BibleHtml.wrapTribunaPanel(
                                    chapter.html,
                                    chapter.publicationCss,
                                    target.bookNumber,
                                    target.chapterNumber,
                                    target.verses);

                            activity.runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        if (activity.isFinishing()) return;
                                        if (reference != null) reference.setText(heading);
                                        if (progress != null) progress.setVisibility(View.GONE);
                                        if (empty != null) empty.setVisibility(View.GONE);
                                        if (webView != null) {
                                            webView.setVisibility(View.VISIBLE);
                                            webView.loadDataWithBaseURL(
                                                "file:///android_asset/", wrapped, "text/html", "UTF-8", null);
                                            scrollToHighlightedVerse(webView);
                                        }
                                    }
                                });
                        } catch (final Exception e) {
                            activity.runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        if (reference != null) reference.setText(refLabel);
                                        showEmpty(
                                            host,
                                            activity.getString(com.jcs.tribuna.R.string.tribuna_bible_load_failed));
                                    }
                                });
                        }
                    }
                })
            .start();
    }

    private static String formatReference(BibleLinkParser.Target target) {
        return BookAbbrev.forBook(target.bookNumber, "")
            + " "
            + target.chapterNumber
            + formatVerseSuffix(target);
    }

    private static String formatVerseSuffix(BibleLinkParser.Target target) {
        if (target.verses == null || target.verses.length == 0) return "";
        if (target.verses.length == 1) return ":" + target.verses[0];
        StringBuilder suffix = new StringBuilder(":");
        for (int i = 0; i < target.verses.length; i++) {
            if (i > 0) suffix.append(", ");
            suffix.append(target.verses[i]);
        }
        return suffix.toString();
    }

    public static void scrollToHighlightedVerse(final WebView webView) {
        if (webView == null) return;
        webView.evaluateJavascript(
            "(function(){var el=document.getElementById('tnme-verse-scroll');"
                + "if(!el){el=document.querySelector('.tnme-highlight');}"
                + "if(!el)return -1;"
                + "var y=0,node=el;while(node){y+=node.offsetTop||0;node=node.offsetParent;}"
                + "return y;})();",
            new android.webkit.ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if (value == null || "null".equals(value) || "-1".equals(value)) return;
                    try {
                        int y = (int) Float.parseFloat(value.replace("\"", ""));
                        webView.scrollTo(0, Math.max(0, y - 24));
                    } catch (Exception ignored) {
                    }
                }
            });
    }
}
