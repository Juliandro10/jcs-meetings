package com.jcs.tribuna;

import android.webkit.WebView;

/**
 * A+/A− do WebView só altera texto. Páginas importadas são imagens — este helper
 * aumenta a largura da página (KitKat, sem flex/grid).
 */
final class PageZoomHelper {
    private PageZoomHelper() {}

    static boolean hasImportedPages(String html) {
        return html != null && html.contains("jcs-imported-page-stack");
    }

    static String injectIntoHtml(String html, int percent) {
        if (html == null || html.length() == 0 || !hasImportedPages(html)) {
            return html;
        }
        String style = "<style id=\"jcs-page-zoom\">" + cssRules(percent) + "</style>";
        int idAt = html.indexOf("id=\"jcs-page-zoom\"");
        if (idAt < 0) idAt = html.indexOf("id='jcs-page-zoom'");
        if (idAt >= 0) {
            int start = html.lastIndexOf("<style", idAt);
            int relEnd = indexOfIgnoreCase(html.substring(idAt), "</style>");
            if (start >= 0 && relEnd >= 0) {
                int end = idAt + relEnd + 8;
                return html.substring(0, start) + style + html.substring(end);
            }
        }
        int headClose = indexOfIgnoreCase(html, "</head>");
        if (headClose >= 0) {
            return html.substring(0, headClose) + style + html.substring(headClose);
        }
        return style + html;
    }

    static void applyToWebView(WebView webView, int percent) {
        if (webView == null) return;
        String css = cssRules(percent).replace("\\", "\\\\").replace("'", "\\'");
        String js =
            "javascript:(function(){"
                + "var has=document.getElementsByClassName('jcs-imported-page-stack');"
                + "var s=document.getElementById('jcs-page-zoom');"
                + "if(!has||has.length===0){if(s)s.innerHTML='';return;}"
                + "if(!s){s=document.createElement('style');s.id='jcs-page-zoom';"
                + "(document.getElementsByTagName('head')[0]||document.documentElement).appendChild(s);}"
                + "s.innerHTML='"
                + css
                + "';"
                + "})()";
        webView.loadUrl(js);
        webView.setHorizontalScrollBarEnabled(percent > 100);
    }

    private static String cssRules(int percent) {
        int width = percent < 70 ? 70 : percent;
        return ".jcs-read-shell{max-width:none !important;padding:8px !important;}"
            + ".jcs-imported-page,.jcs-imported-page-stack{width:"
            + width
            + "% !important;max-width:none !important;}"
            + ".jcs-imported-page-stack img,.jcs-read-body figure.jcs-imported-page img{"
            + "width:100% !important;max-width:none !important;height:auto !important;}";
    }

    private static int indexOfIgnoreCase(String html, String token) {
        String lower = html.toLowerCase();
        return lower.indexOf(token.toLowerCase());
    }
}
