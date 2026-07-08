package com.jcs.read;

import android.net.Uri;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class SongLinkHelper {
    /** Faixa de MepsDocumentId do Cante de Coração (sjj) — 2024+. */
    private static final long SJJ_MEPS_MIN = 1_102_016_801L;
    private static final long SJJ_MEPS_MAX = 1_102_030_000L;
    private static final long SJJ_MEPS_BASE = 1_102_016_800L;

    private static final Pattern JW_PUB_SONG =
        Pattern.compile("jwpub://p/T:(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern FINDER_DOCID =
        Pattern.compile("[?&]docid=(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern TNME_CANTICO =
        Pattern.compile("tnme-cantico://(?:song/)?(\\d+)", Pattern.CASE_INSENSITIVE);

    private SongLinkHelper() {}

    static boolean isSongLink(String url) {
        return resolveMepsDocumentId(url) != null;
    }

    static String rewriteHtmlLinks(String html) {
        if (html == null || html.length() == 0) return html;

        String out = html;

        Matcher dataHref =
            Pattern.compile(
                    "<a\\b([^>]*?)\\bdata-href=(['\"])(jwpub://p/T:\\d+[^'\"]*)\\2([^>]*)>",
                    Pattern.CASE_INSENSITIVE)
                .matcher(out);
        StringBuffer sb = new StringBuffer();
        while (dataHref.find()) {
            String songUrl = dataHref.group(3);
            String tnme = toTnmeUri(songUrl);
            if (tnme == null) {
                dataHref.appendReplacement(sb, Matcher.quoteReplacement(dataHref.group(0)));
                continue;
            }
            String replacement =
                "<a"
                    + dataHref.group(1)
                    + "href=\""
                    + tnme
                    + "\""
                    + dataHref.group(4)
                    + ">";
            dataHref.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        dataHref.appendTail(sb);
        out = sb.toString();

        Matcher href =
            Pattern.compile("href=(['\"])(jwpub://p/T:\\d+[^'\"]*)\\1", Pattern.CASE_INSENSITIVE)
                .matcher(out);
        sb = new StringBuffer();
        while (href.find()) {
            String songUrl = href.group(2);
            String tnme = toTnmeUri(songUrl);
            if (tnme == null) {
                href.appendReplacement(sb, Matcher.quoteReplacement(href.group(0)));
                continue;
            }
            String replacement = "href=" + href.group(1) + tnme + href.group(1);
            href.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        href.appendTail(sb);
        return sb.toString();
    }

    static String toTnmeUri(String url) {
        Long mepsId = resolveMepsDocumentId(url);
        if (mepsId == null) return null;
        return "tnme-cantico://" + mepsId;
    }

    static Long resolveMepsDocumentId(String url) {
        if (url == null || url.length() == 0) return null;
        String decoded = Uri.decode(url);

        Matcher tnme = TNME_CANTICO.matcher(decoded);
        if (tnme.find()) {
            long value = Long.parseLong(tnme.group(1));
            if (isSongMepsId(value)) return value;
            if (value >= 1 && value <= 999) return SJJ_MEPS_BASE + value;
        }

        Matcher finder = FINDER_DOCID.matcher(decoded);
        while (finder.find()) {
            long id = Long.parseLong(finder.group(1));
            if (isSongMepsId(id)) return id;
        }

        Matcher jwpub = JW_PUB_SONG.matcher(decoded);
        long lastSongId = -1;
        while (jwpub.find()) {
            long id = Long.parseLong(jwpub.group(1));
            if (isSongMepsId(id)) lastSongId = id;
        }
        return lastSongId > 0 ? lastSongId : null;
    }

    private static boolean isSongMepsId(long id) {
        return id >= SJJ_MEPS_MIN && id <= SJJ_MEPS_MAX;
    }
}
