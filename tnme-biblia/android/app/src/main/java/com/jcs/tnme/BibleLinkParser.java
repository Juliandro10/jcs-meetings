package com.jcs.tnme;

import android.content.Intent;
import android.net.Uri;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class BibleLinkParser {
    public static class Target {
        public int bookNumber;
        public int chapterNumber;
        public int verseStart;
        public int verseEnd;
        public int[] verses;
    }

    private static final Pattern JW_PUB =
        Pattern.compile(
            "jwpub://b/[^/]+/(\\d+):(\\d+):([\\d,]+)(?:-(\\d+):(\\d+):(\\d+))?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TNME =
        Pattern.compile(
            "tnme-bible://(\\d+)/(\\d+)/([\\d,]+)(?:-(\\d+))?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TNME_PATH =
        Pattern.compile("^/(\\d+)/([\\d,]+)(?:-(\\d+))?$", Pattern.CASE_INSENSITIVE);

    private BibleLinkParser() {}

    public static boolean isBibleLink(String url) {
        if (url == null) return false;
        String decoded = decode(url);
        return JW_PUB.matcher(decoded).find()
            || TNME.matcher(decoded).find()
            || decoded.startsWith("jwpub://b/")
            || decoded.startsWith("tnme-bible://");
    }

    public static Target parse(String url) {
        if (url == null) return null;
        String decoded = decode(url);

        Target target = parseJwPub(decoded);
        if (target != null) return target;

        target = parseTnmeString(decoded);
        if (target != null) return target;

        return parseUriParts(Uri.parse(decoded));
    }

    public static Target parseIntent(Intent intent) {
        if (intent == null) return null;

        if (intent.getData() != null) {
            Uri uri = intent.getData();
            Target fromUri = parse(uri.toString());
            if (fromUri == null) {
                fromUri = parseUriParts(uri);
            }
            if (fromUri != null) return fromUri;
        }

        if (intent.hasExtra("bookNumber")) {
            Target target = new Target();
            target.bookNumber = intent.getIntExtra("bookNumber", 0);
            target.chapterNumber = intent.getIntExtra("chapterNumber", 0);
            if (intent.hasExtra("verseStart")) {
                int start = intent.getIntExtra("verseStart", 0);
                int end = intent.getIntExtra("verseEnd", start);
                if (start > 0) {
                    applyVerses(target, String.valueOf(start), end > start ? String.valueOf(end) : null);
                } else {
                    target.verseStart = 0;
                    target.verseEnd = 0;
                    target.verses = new int[0];
                }
            } else {
                target.verseStart = 0;
                target.verseEnd = 0;
                target.verses = new int[0];
            }
            if (target.bookNumber > 0 && target.chapterNumber > 0) {
                return target;
            }
        }

        return null;
    }

    public static Intent toChapterIntent(android.content.Context context, Target target) {
        Intent intent = new Intent(context, ChapterActivity.class);
        intent.putExtra("bookNumber", target.bookNumber);
        intent.putExtra("chapterNumber", target.chapterNumber);
        intent.putExtra("verseStart", target.verseStart);
        intent.putExtra("verseEnd", target.verseEnd);
        return intent;
    }

    public static Intent toChapterIntent(android.content.Context context, Uri uri) {
        Target target = parse(uri.toString());
        if (target == null) {
            target = parseUriParts(uri);
        }
        if (target == null) return null;
        Intent intent = toChapterIntent(context, target);
        intent.setData(uri);
        return intent;
    }

    static int[] buildVerseList(String startRaw, String endRaw) {
        if (startRaw == null || startRaw.trim().length() == 0) {
            return new int[0];
        }
        String trimmed = decode(startRaw.trim());
        if (trimmed.indexOf(',') >= 0) {
            String[] parts = trimmed.split(",");
            int[] out = new int[parts.length];
            for (int i = 0; i < parts.length; i++) {
                out[i] = Integer.parseInt(parts[i].trim());
            }
            return out;
        }
        int start = Integer.parseInt(trimmed);
        int end = start;
        if (endRaw != null && endRaw.trim().length() > 0) {
            end = Integer.parseInt(decode(endRaw.trim()));
        }
        if (end < start) {
            end = start;
        }
        int[] out = new int[end - start + 1];
        for (int verse = start, index = 0; verse <= end; verse++, index++) {
            out[index] = verse;
        }
        return out;
    }

    private static Target parseJwPub(String url) {
        Matcher jw = JW_PUB.matcher(url);
        if (!jw.find()) return null;
        Target target = new Target();
        target.bookNumber = Integer.parseInt(jw.group(1));
        target.chapterNumber = Integer.parseInt(jw.group(2));
        applyVerses(target, jw.group(3), jw.group(6));
        return target;
    }

    private static Target parseTnmeString(String url) {
        Matcher tnme = TNME.matcher(url);
        if (!tnme.find()) return null;
        Target target = new Target();
        target.bookNumber = Integer.parseInt(tnme.group(1));
        target.chapterNumber = Integer.parseInt(tnme.group(2));
        applyVerses(target, tnme.group(3), tnme.group(4));
        return target;
    }

    private static Target parseUriParts(Uri uri) {
        if (uri == null) return null;
        String scheme = uri.getScheme();
        if (scheme == null) return null;

        if ("tnme-bible".equalsIgnoreCase(scheme)) {
            String host = uri.getHost();
            String path = uri.getPath();
            if (host != null && path != null) {
                Matcher pathMatch = TNME_PATH.matcher(decode(path));
                if (pathMatch.find()) {
                    Target target = new Target();
                    target.bookNumber = Integer.parseInt(host);
                    target.chapterNumber = Integer.parseInt(pathMatch.group(1));
                    applyVerses(target, pathMatch.group(2), pathMatch.group(3));
                    return target;
                }
            }
        }

        if ("jwpub".equalsIgnoreCase(scheme) && "b".equalsIgnoreCase(uri.getHost())) {
            String path = uri.getPath();
            if (path != null && path.length() > 0) {
                return parseJwPub("jwpub://b" + decode(path));
            }
        }

        return null;
    }

    private static void applyVerses(Target target, String startRaw, String endRaw) {
        target.verses = buildVerseList(startRaw, endRaw);
        if (target.verses.length > 0) {
            target.verseStart = target.verses[0];
            target.verseEnd = target.verses[target.verses.length - 1];
        } else {
            target.verseStart = 0;
            target.verseEnd = 0;
        }
    }

    private static String decode(String value) {
        if (value == null) return "";
        return Uri.decode(value);
    }
}
