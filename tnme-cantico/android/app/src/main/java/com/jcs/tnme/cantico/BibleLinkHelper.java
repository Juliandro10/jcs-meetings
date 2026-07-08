package com.jcs.tnme.cantico;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class BibleLinkHelper {
    private static final Pattern JW_PUB =
        Pattern.compile(
            "jwpub://b/[^/]+/(\\d+):(\\d+):([\\d,]+)(?:-(\\d+):(\\d+):(\\d+))?",
            Pattern.CASE_INSENSITIVE);

    private BibleLinkHelper() {}

    static boolean isBibleLink(String url) {
        if (url == null || url.length() == 0) return false;
        return url.startsWith("jwpub://b/") || url.startsWith("tnme-bible://");
    }

    static String rewriteHtmlLinks(String html) {
        if (html == null || html.length() == 0) return html;

        String out = html;

        Matcher dataHref =
            Pattern.compile(
                    "<a\\b([^>]*?)\\bdata-href=(['\"])(jwpub://b/[^'\"]+)\\2([^>]*)>",
                    Pattern.CASE_INSENSITIVE)
                .matcher(out);
        StringBuffer sb = new StringBuffer();
        while (dataHref.find()) {
            String bibleUrl = dataHref.group(3);
            String tnme = toTnmeUri(bibleUrl);
            String replacement =
                "<a"
                    + dataHref.group(1)
                    + "href=\""
                    + (tnme != null ? tnme : bibleUrl)
                    + "\""
                    + dataHref.group(4)
                    + ">";
            dataHref.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        dataHref.appendTail(sb);
        out = sb.toString();

        Matcher href =
            Pattern.compile("href=(['\"])(jwpub://b/[^'\"]+)\\1", Pattern.CASE_INSENSITIVE)
                .matcher(out);
        sb = new StringBuffer();
        while (href.find()) {
            String bibleUrl = href.group(2);
            String tnme = toTnmeUri(bibleUrl);
            String replacement =
                "href=" + href.group(1) + (tnme != null ? tnme : bibleUrl) + href.group(1);
            href.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        href.appendTail(sb);
        return sb.toString();
    }

    private static String toTnmeUri(String jwpubUrl) {
        Matcher match = JW_PUB.matcher(jwpubUrl);
        if (!match.find()) return null;
        int book = Integer.parseInt(match.group(1));
        int chapter = Integer.parseInt(match.group(2));
        String verseToken = match.group(3);
        if (verseToken == null || verseToken.length() == 0) return null;
        if (verseToken.indexOf(',') >= 0) {
            return "tnme-bible://" + book + "/" + chapter + "/" + verseToken;
        }
        int verseStart = parseVerseToken(verseToken);
        int verseEnd = match.group(6) != null ? Integer.parseInt(match.group(6)) : verseStart;
        if (verseEnd != verseStart) {
            return "tnme-bible://" + book + "/" + chapter + "/" + verseStart + "-" + verseEnd;
        }
        return "tnme-bible://" + book + "/" + chapter + "/" + verseStart;
    }

    private static int parseVerseToken(String raw) {
        if (raw == null || raw.length() == 0) return 1;
        int comma = raw.indexOf(',');
        String token = comma >= 0 ? raw.substring(0, comma) : raw;
        return Integer.parseInt(token.trim());
    }
}
