package com.jcs.tnme;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class BibleHtml {
    private BibleHtml() {}

    /** Referências marginais (class="m") e notas de rodapé (class="fn") → superscript azul. */
    private static final Pattern MARGINAL_MARKER =
        Pattern.compile(
            "<span\\s+data-mid=\"\\d+\"\\s+class=\"m\">([^<]{1,4})<span\\s+class=\"tt m\"[^>]*></span></span>",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern FOOTNOTE_MARKER =
        Pattern.compile(
            "<span\\s+data-fnid=\"\\d+\"\\s+class=\"fn(?:\\s+pr)?\">([^<]{1,4})<span\\s+(?:id=\"footnotesource\\d+\"\\s+)?class=\"tt fn\"[^>]*></span></span>",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern EMPTY_TT =
        Pattern.compile(
            "<span\\s+(?:id=\"footnotesource\\d+\"\\s+)?class=\"tt (?:m|fn|vl|cl)\"[^>]*></span>",
            Pattern.CASE_INSENSITIVE);

    public static String normalizeMarkers(String html) {
        if (html == null || html.length() == 0) {
            return "";
        }
        String out = html;
        out = replaceAll(MARGINAL_MARKER, out, "<sup class=\"tnme-marker\">$1</sup>");
        out = replaceAll(FOOTNOTE_MARKER, out, "<sup class=\"tnme-marker\">$1</sup>");
        out = replaceAll(EMPTY_TT, out, "");
        return out;
    }

    /**
     * Marca cada segmento do versículo (v24-15-16-1, -2, -3…) com tnme-highlight.
     * Um wrapper &lt;span&gt; em torno de &lt;p&gt; quebra no primeiro parágrafo — por isso segmento a segmento.
     */
    public static String applyVerseHighlights(String html, int book, int chapter, int[] verses) {
        if (html == null || html.length() == 0 || verses == null || verses.length == 0) {
            return html;
        }

        int scrollVerse = verses[0];
        String out = html;
        for (int verse : verses) {
            out = highlightVerseSegments(out, book, chapter, verse, verse == scrollVerse);
        }
        return out;
    }

    private static String highlightVerseSegments(
        String html, int book, int chapter, int verse, boolean scrollTarget) {
        Pattern spanOpen =
            Pattern.compile(
                "(<span id=\"v" + book + "-" + chapter + "-" + verse + "-\\d+\")([^>]*)(>)",
                Pattern.CASE_INSENSITIVE);
        Matcher matcher = spanOpen.matcher(html);
        StringBuffer buffer = new StringBuffer();
        boolean markedScroll = false;
        boolean found = false;
        while (matcher.find()) {
            found = true;
            String attrs = matcher.group(2) != null ? matcher.group(2) : "";
            attrs = appendHtmlClass(attrs, "tnme-highlight");
            String prefix = "";
            if (scrollTarget && !markedScroll) {
                prefix = "<span id=\"tnme-verse-scroll\"></span>";
                markedScroll = true;
            }
            matcher.appendReplacement(
                buffer,
                Matcher.quoteReplacement(prefix + matcher.group(1) + attrs + matcher.group(3)));
        }
        if (!found) {
            return html;
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }

    private static String appendHtmlClass(String attrs, String className) {
        if (attrs.contains("class=\"")) {
            if (attrs.contains(className)) {
                return attrs;
            }
            return attrs.replaceFirst("class=\"", "class=\"" + className + " ");
        }
        return attrs + " class=\"" + className + "\"";
    }

    private static String replaceAll(Pattern pattern, String input, String replacement) {
        Matcher matcher = pattern.matcher(input);
        StringBuffer buffer = new StringBuffer();
        boolean found = false;
        while (matcher.find()) {
            found = true;
            String repl =
                replacement.contains("$1") && matcher.groupCount() >= 1
                    ? replacement.replace("$1", matcher.group(1))
                    : replacement;
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(repl));
        }
        if (!found) {
            return input;
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }

    public static String wrapChapter(
        String bookTitle,
        int bookNumber,
        int chapterNumber,
        String bodyHtml,
        String publicationCss,
        int[] highlightVerses) {
        String normalizedBody = normalizeMarkers(bodyHtml);
        String highlightedBody =
            applyVerseHighlights(normalizedBody, bookNumber, chapterNumber, highlightVerses);
        boolean shouldScroll = highlightVerses != null && highlightVerses.length > 0;

        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>");
        sb.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no\"/>");
        sb.append("<style>");
        sb.append("html{font-size:18px;-webkit-text-size-adjust:100%;}");
        sb.append("@media (min-width:540px){html{font-size:21px;}}");
        sb.append("@media (min-width:800px){html{font-size:23px;}}");
        sb.append("body{margin:0;padding:0;color:#ececf1;background:#121212;");
        sb.append("font-family:Georgia,'Noto Serif','Times New Roman',serif;line-height:1.68;}");
        sb.append(".tnme-wrap{max-width:42rem;margin:0 auto;padding:1.25rem 1.1rem 3rem;}");
        sb.append("@media (min-width:540px){.tnme-wrap{padding:1.6rem 1.4rem 3.5rem;}}");
        if (publicationCss != null && publicationCss.length() > 0) {
            sb.append(publicationCss);
        }
        sb.append(".jwpub-content{color:#ececf1;font-size:1rem;}");
        sb.append(".jwpub-content img{max-width:100%;height:auto;}");
        sb.append(".jwpub-content a{color:#c4b5fd;text-decoration:none;}");
        sb.append(".jwpub-content p{margin:0 0 0.95em;}");
        sb.append(".jwpub-content h1,.jwpub-content h2,.jwpub-content h3{font-family:'Segoe UI',Roboto,sans-serif;color:#f4f4f5;}");
        sb.append(".prose-bible .vl,.prose-bible .cl,.prose-bible .vn,.jwpub-content .vl,.jwpub-content .cl,.jwpub-content .vn{color:#c4b5fd;font-weight:700;}");
        sb.append(".prose-bible .cl,.jwpub-content .cl{font-size:2rem;line-height:1;margin-right:0.15em;}");
        sb.append(".jwpub-content sup,.prose-bible sup,.jwpub-content sup.tnme-marker,.jwpub-content .tnme-marker,");
        sb.append(".jwpub-content .tt,.jwpub-content .ts,.jwpub-content .m,.jwpub-content .fn,");
        sb.append(".jwpub-content .ref,.jwpub-content a.b,.jwpub-content span.b,");
        sb.append(".jwpub-content a.footnote,.jwpub-content span.footnote{");
        sb.append("font-size:0.58em!important;line-height:0!important;");
        sb.append("vertical-align:super!important;color:#8ec5ff!important;");
        sb.append("font-weight:400!important;text-decoration:none!important;}");
        sb.append(".jwpub-content sup a,.jwpub-content .tt a,.jwpub-content .ts a{color:#8ec5ff!important;}");
        sb.append(".jwpub-content span.m>span.tt,.jwpub-content span.fn>span.tt{display:none!important;}");
        sb.append(".tnme-highlight{background:rgba(155,138,196,0.22);outline:2px solid rgba(196,181,232,0.55);border-radius:6px;padding:0.05em 0.1em;display:inline;}");
        sb.append("</style></head><body><div class=\"tnme-wrap\">");
        sb.append("<div class=\"jwpub-content prose-bible\">").append(highlightedBody).append("</div>");
        sb.append("</div>");
        if (shouldScroll) {
            sb.append("<script>");
            sb.append("(function(){");
            sb.append("function scrollToTarget(){");
            sb.append("var el=document.getElementById('tnme-verse-scroll');");
            sb.append("if(!el){el=document.querySelector('.tnme-highlight');}");
            sb.append("if(!el)return;");
            sb.append("var y=(el.offsetTop||0)-28;");
            sb.append("window.scrollTo(0,Math.max(0,y));}");
            sb.append("scrollToTarget();");
            sb.append("setTimeout(scrollToTarget,0);");
            sb.append("setTimeout(scrollToTarget,120);");
            sb.append("setTimeout(scrollToTarget,400);");
            sb.append("setTimeout(scrollToTarget,800);");
            sb.append("setTimeout(scrollToTarget,1500);");
            sb.append("})();");
            sb.append("</script>");
        }
        sb.append("</body></html>");
        return sb.toString();
    }
}
