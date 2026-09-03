package com.jcs.read;

import android.os.Build;
import android.webkit.WebView;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class PageJumpHelper {
    private static final Pattern JUMP =
        Pattern.compile(
            "(?:jcs-page://|#jcs-page-)(\\d+)(?:\\?y=(\\d{1,3}))?",
            Pattern.CASE_INSENSITIVE);

    private PageJumpHelper() {}

    static boolean isPageJump(String url) {
        return parse(url) != null;
    }

    static Jump parse(String url) {
        if (url == null || url.length() == 0) return null;
        Matcher match = JUMP.matcher(url);
        if (!match.find()) return null;
        try {
            int page = Integer.parseInt(match.group(1));
            if (page < 1 || page > 999) return null;
            int topPct = 0;
            if (match.group(2) != null) {
                topPct = Integer.parseInt(match.group(2));
                if (topPct < 0) topPct = 0;
                if (topPct > 95) topPct = 95;
            }
            return new Jump(page, topPct);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static String rewriteHtmlLinks(String html) {
        if (html == null || html.length() == 0) return html;

        Matcher dataHref =
            Pattern.compile(
                    "<a\\b([^>]*?)\\bdata-href=(['\"])((?:jcs-page://|#jcs-page-)[^'\"]+)\\2([^>]*)>",
                    Pattern.CASE_INSENSITIVE)
                .matcher(html);
        StringBuffer sb = new StringBuffer();
        while (dataHref.find()) {
            String href = toHref(dataHref.group(3));
            if (href == null) {
                dataHref.appendReplacement(sb, Matcher.quoteReplacement(dataHref.group(0)));
                continue;
            }
            String replacement =
                "<a"
                    + stripHrefAttr(dataHref.group(1))
                    + " href=\""
                    + href
                    + "\""
                    + stripHrefAttr(dataHref.group(4))
                    + ">";
            dataHref.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        dataHref.appendTail(sb);
        return sb.toString();
    }

    static void scrollTo(WebView webView, String url) {
        if (webView == null) return;
        Jump jump = parse(url);
        if (jump == null) return;
        String js =
            "(function(){"
                + "var el=document.getElementById('jcs-page-"
                + jump.pageNumber
                + "');"
                + "if(!el)return;"
                + "try{el.scrollIntoView(true);}catch(e){}"
                + "var y="
                + jump.topPct
                + ";"
                + "if(y>8){var extra=Math.round(el.offsetHeight*y/100.0);"
                + "if(window.scrollBy)window.scrollBy(0,extra);}"
                + "})()";
        if (Build.VERSION.SDK_INT >= 19) {
            webView.evaluateJavascript(js, null);
        } else {
            webView.loadUrl("javascript:" + js);
        }
    }

    private static String toHref(String raw) {
        Jump jump = parse(raw);
        if (jump == null) return null;
        if (jump.topPct > 8) return "jcs-page://" + jump.pageNumber + "?y=" + jump.topPct;
        return "jcs-page://" + jump.pageNumber;
    }

    private static String stripHrefAttr(String attrs) {
        if (attrs == null || attrs.length() == 0) return "";
        return attrs.replaceAll("(?i)(?:^|\\s)href\\s*=\\s*(['\"]).*?\\1", " ");
    }

    static final class Jump {
        final int pageNumber;
        final int topPct;

        Jump(int pageNumber, int topPct) {
            this.pageNumber = pageNumber;
            this.topPct = topPct;
        }
    }
}
