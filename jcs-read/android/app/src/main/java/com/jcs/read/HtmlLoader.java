package com.jcs.read;

import android.content.Context;
import android.webkit.WebView;

public final class HtmlLoader {
    private HtmlLoader() {}

    public static void loadWeekDocument(
        Context context, String weekFolder, String htmlFileName, WebView webView) {
        try {
            JcsRootAccess access = JcsRootAccess.from(context);
            String html = access.readWeekHtml(weekFolder, htmlFileName);
            html = access.rewriteAssetUrls(weekFolder, html);
            html = BibleLinkHelper.rewriteHtmlLinks(html);
            webView.loadDataWithBaseURL("about:blank", html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            webView.loadData(
                "<html><body><p>Não foi possível abrir o documento.</p></body></html>",
                "text/html",
                "UTF-8");
        }
    }
}
