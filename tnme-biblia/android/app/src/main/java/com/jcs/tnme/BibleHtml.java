package com.jcs.tnme;

public final class BibleHtml {
    private BibleHtml() {}

    public static String wrapChapter(
        String bookTitle,
        int chapterNumber,
        String bodyHtml,
        String publicationCss,
        int verseStart,
        int verseEnd) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>");
        sb.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>");
        sb.append("<style>");
        sb.append("body{margin:0;padding:16px;font-family:sans-serif;font-size:17px;line-height:1.55;color:#e5e7eb;background:#111827;}");
        sb.append(".tnme-head{margin-bottom:12px;color:#c4b5fd;font-weight:700;font-size:13px;text-transform:uppercase;}");
        sb.append(".jwpub-content{color:#e5e7eb;}");
        sb.append(".jwpub-content img{max-width:100%;height:auto;}");
        sb.append(".jwpub-content a{color:#a78bfa;}");
        sb.append(".prose-bible .vl,.prose-bible .cl,.jwpub-content .vl,.jwpub-content .cl{color:#c4b5fd;font-weight:600;}");
        sb.append(".tnme-highlight{background:rgba(167,139,250,0.18);outline:2px solid rgba(167,139,250,0.45);}");
        if (publicationCss != null && publicationCss.length() > 0) {
            sb.append(publicationCss);
        }
        sb.append("</style></head><body>");
        sb.append("<div class=\"tnme-head\">").append(escape(bookTitle)).append(" ").append(chapterNumber).append("</div>");
        sb.append("<div class=\"jwpub-content prose-bible\">").append(bodyHtml).append("</div>");
        sb.append("<script>");
        sb.append("(function(){");
        sb.append("var start=").append(verseStart).append(", end=").append(verseEnd).append(";");
        sb.append("function highlightVerse(n){");
        sb.append("var el=document.getElementById('verse'+n);");
        sb.append("if(!el){var spans=document.querySelectorAll('span.v');");
        sb.append("for(var i=0;i<spans.length;i++){var t=spans[i].textContent||'';if(parseInt(t,10)===n){el=spans[i];break;}}}");
        sb.append("if(el){el.className=(el.className||'')+' tnme-highlight';");
        sb.append("var y=el.offsetTop;window.scrollTo(0,Math.max(0,y-24));return true;}");
        sb.append("return false;}");
        sb.append("if(!highlightVerse(start)){window.scrollTo(0,0);}");
        sb.append("})();");
        sb.append("</script></body></html>");
        return sb.toString();
    }

    private static String escape(String value) {
        if (value == null) return "";
        return value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;");
    }
}
