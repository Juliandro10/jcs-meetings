package com.jcs.read;

import android.app.Activity;
import android.view.View;
import android.webkit.WebView;
import android.widget.ProgressBar;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.Charset;

public final class HtmlLoader {
    /** KitKat WebView trava com loadData muito grande — usar arquivo acima disso. */
    private static final int MAX_INLINE_CHARS = 180_000;
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private HtmlLoader() {}

    public static void loadWeekDocument(
        final Activity activity,
        final String weekFolder,
        final String htmlFileName,
        final WebView webView,
        final ProgressBar progress) {
        loadWeekDocument(activity, weekFolder, htmlFileName, JcsPackage.MEETINGS, webView, progress);
    }

    public static void loadWeekDocument(
        final Activity activity,
        final String weekFolder,
        final String htmlFileName,
        final String pkg,
        final WebView webView,
        final ProgressBar progress) {
        if (progress != null) {
            progress.setVisibility(View.VISIBLE);
        }

        new Thread(
                new Runnable() {
                    @Override
                    public void run() {
                        try {
                            final String html = prepareHtml(activity, weekFolder, htmlFileName, pkg);
                            final LoadTarget target = buildLoadTarget(activity, html);
                            activity.runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        if (activity.isFinishing()) return;
                                        deliver(webView, progress, target, null);
                                    }
                                });
                        } catch (final Exception e) {
                            activity.runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        if (activity.isFinishing()) return;
                                        deliver(
                                            webView,
                                            progress,
                                            null,
                                            "Não foi possível abrir o documento.");
                                    }
                                });
                        }
                    }
                })
            .start();
    }

    private static String prepareHtml(
        android.content.Context context, String weekFolder, String htmlFileName, String pkg)
        throws Exception {
        JcsRootAccess access = JcsRootAccess.from(context);
        String html = access.readWeekHtml(weekFolder, htmlFileName, pkg);
        html = access.rewriteAssetUrls(weekFolder, html, pkg);
        html = BibleLinkHelper.rewriteHtmlLinks(html);
        html = SongLinkHelper.rewriteHtmlLinks(html);
        return HtmlViewportHelper.lockViewport(html);
    }

    private static final class LoadTarget {
        final String inlineHtml;
        final String fileUrl;

        LoadTarget(String inlineHtml, String fileUrl) {
            this.inlineHtml = inlineHtml;
            this.fileUrl = fileUrl;
        }
    }

    private static LoadTarget buildLoadTarget(android.content.Context context, String html)
        throws Exception {
        if (html == null) {
            throw new Exception("HTML vazio");
        }
        if (html.length() <= MAX_INLINE_CHARS) {
            return new LoadTarget(html, null);
        }

        File cacheDir = context.getCacheDir();
        if (cacheDir == null) {
            throw new Exception("Cache indisponível");
        }
        File out = new File(cacheDir, "jcs-read-open.html");
        OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(out), UTF8);
        try {
            writer.write(html);
            writer.flush();
        } finally {
            writer.close();
        }
        return new LoadTarget(null, "file://" + out.getAbsolutePath());
    }

    private static void deliver(
        WebView webView,
        ProgressBar progress,
        LoadTarget target,
        String errorMessage) {
        if (progress != null) {
            progress.setVisibility(View.GONE);
        }

        if (errorMessage != null || target == null) {
            webView.loadData(
                "<html><body style=\"font-family:sans-serif;padding:16px;\"><p>"
                    + escapeHtml(errorMessage != null ? errorMessage : "Erro ao abrir.")
                    + "</p></body></html>",
                "text/html",
                "UTF-8");
            return;
        }

        if (target.fileUrl != null) {
            webView.loadUrl(target.fileUrl);
        } else {
            webView.loadDataWithBaseURL(
                "about:blank", target.inlineHtml, "text/html", "UTF-8", null);
        }
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;");
    }
}
