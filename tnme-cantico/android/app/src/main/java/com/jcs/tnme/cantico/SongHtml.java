package com.jcs.tnme.cantico;

public final class SongHtml {
    private SongHtml() {}

    public static String wrapSong(int songNumber, String title, String bodyHtml, String publicationCss) {
        String normalizedBody = BibleLinkHelper.rewriteHtmlLinks(bodyHtml != null ? bodyHtml : "");

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
        sb.append(".jwpub-content h1,.jwpub-content h2{color:#f4f4f5;font-weight:700;}");
        sb.append(".jwpub-content .contextTtl{color:#a1a1aa;font-size:0.85rem;letter-spacing:0.08em;}");
        sb.append(".jwpub-content ol.source{padding-left:1.2rem;}");
        sb.append(".jwpub-content .sl{margin-top:0.8em;}");
        sb.append(".jwpub-content .themeScrp{color:#a1a1aa;font-style:italic;}");
        sb.append("</style></head><body><div class=\"tnme-wrap jwpub-content\">");
        sb.append(normalizedBody);
        sb.append("</div></body></html>");
        return sb.toString();
    }
}
