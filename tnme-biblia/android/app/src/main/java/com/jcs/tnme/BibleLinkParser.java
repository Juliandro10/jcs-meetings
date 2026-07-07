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
    }

    private static final Pattern JW_PUB =
        Pattern.compile(
            "jwpub://b/[^/]+/(\\d+):(\\d+):([\\d,]+)(?:-(\\d+):(\\d+):(\\d+))?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TNME =
        Pattern.compile(
            "tnme-bible://(\\d+)/(\\d+)/(\\d+)(?:-(\\d+))?",
            Pattern.CASE_INSENSITIVE);

    private BibleLinkParser() {}

    public static boolean isBibleLink(String url) {
        if (url == null) return false;
        return JW_PUB.matcher(url).find() || TNME.matcher(url).find();
    }

    public static Target parse(String url) {
        if (url == null) return null;

        Matcher jw = JW_PUB.matcher(url);
        if (jw.find()) {
            Target target = new Target();
            target.bookNumber = Integer.parseInt(jw.group(1));
            target.chapterNumber = Integer.parseInt(jw.group(2));
            target.verseStart = parseVerseToken(jw.group(3));
            if (jw.group(6) != null) {
                target.verseEnd = Integer.parseInt(jw.group(6));
            } else {
                target.verseEnd = target.verseStart;
            }
            return target;
        }

        Matcher tnme = TNME.matcher(url);
        if (tnme.find()) {
            Target target = new Target();
            target.bookNumber = Integer.parseInt(tnme.group(1));
            target.chapterNumber = Integer.parseInt(tnme.group(2));
            target.verseStart = Integer.parseInt(tnme.group(3));
            if (tnme.group(4) != null) {
                target.verseEnd = Integer.parseInt(tnme.group(4));
            } else {
                target.verseEnd = target.verseStart;
            }
            return target;
        }

        return null;
    }

    public static Target parseIntent(Intent intent) {
        if (intent == null) return null;

        if (intent.getData() != null) {
            Target fromUri = parse(intent.getData().toString());
            if (fromUri != null) return fromUri;
        }

        if (intent.hasExtra("bookNumber")) {
            Target target = new Target();
            target.bookNumber = intent.getIntExtra("bookNumber", 0);
            target.chapterNumber = intent.getIntExtra("chapterNumber", 0);
            target.verseStart = intent.getIntExtra("verseStart", 1);
            target.verseEnd = intent.getIntExtra("verseEnd", target.verseStart);
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
        if (target == null) return null;
        Intent intent = toChapterIntent(context, target);
        intent.setData(uri);
        return intent;
    }

    private static int parseVerseToken(String raw) {
        if (raw == null || raw.length() == 0) return 1;
        int comma = raw.indexOf(',');
        String token = comma >= 0 ? raw.substring(0, comma) : raw;
        return Integer.parseInt(token.trim());
    }
}
