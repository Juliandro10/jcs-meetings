package com.jcs.tnme.cantico;

import android.content.Intent;
import android.net.Uri;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class SongLinkParser {
    public static class Target {
        public int documentId;
        public int songNumber;
        public int mepsDocumentId;
    }

    private static final Pattern TNME_SONG =
        Pattern.compile("tnme-cantico://(?:song/)?(\\d+)(?:/.*)?", Pattern.CASE_INSENSITIVE);
    private static final Pattern JW_DOCID =
        Pattern.compile("[?&]docid=(\\d+)", Pattern.CASE_INSENSITIVE);

    private SongLinkParser() {}

    public static Target parse(String url) {
        if (url == null) return null;
        String decoded = Uri.decode(url);

        if (BibleLinkHelper.isBibleLink(decoded)) {
            return null;
        }

        Matcher tnme = TNME_SONG.matcher(decoded);
        if (tnme.find()) {
            Target target = new Target();
            int value = Integer.parseInt(tnme.group(1));
            if (value >= 1000000) {
                target.mepsDocumentId = value;
            } else if (value >= 200) {
                target.documentId = value;
            } else {
                target.songNumber = value;
            }
            return target;
        }

        if (decoded.contains("pub=sjj") || decoded.contains("pub=SJJ")) {
            Matcher doc = JW_DOCID.matcher(decoded);
            if (doc.find()) {
                Target target = new Target();
                target.mepsDocumentId = Integer.parseInt(doc.group(1));
                return target;
            }
        }

        Uri uri = Uri.parse(decoded);
        if (uri != null && "jwpub".equalsIgnoreCase(uri.getScheme())) {
            String host = uri.getHost();
            if ("p".equalsIgnoreCase(host)) {
                String path = uri.getPath();
                if (path != null && path.matches("/T:\\d+/?")) {
                    Target target = new Target();
                    target.mepsDocumentId = Integer.parseInt(path.replaceAll("[^0-9]", ""));
                    return target;
                }
            }
        }

        return parseIntentExtras(null, decoded);
    }

    public static Target parseIntent(Intent intent) {
        if (intent == null) return null;

        if (intent.getData() != null) {
            Target fromUri = parse(intent.getData().toString());
            if (fromUri != null) return fromUri;
        }

        if (intent.hasExtra("documentId")) {
            Target target = new Target();
            target.documentId = intent.getIntExtra("documentId", 0);
            if (target.documentId > 0) return target;
        }

        if (intent.hasExtra("songNumber")) {
            Target target = new Target();
            target.songNumber = intent.getIntExtra("songNumber", 0);
            if (target.songNumber > 0) return target;
        }

        if (intent.hasExtra("mepsDocumentId")) {
            Target target = new Target();
            target.mepsDocumentId = intent.getIntExtra("mepsDocumentId", 0);
            if (target.mepsDocumentId > 0) return target;
        }

        return null;
    }

    public static Intent toSongIntent(android.content.Context context, Target target) {
        Intent intent = new Intent(context, SongActivity.class);
        if (target.documentId > 0) {
            intent.putExtra("documentId", target.documentId);
        }
        if (target.songNumber > 0) {
            intent.putExtra("songNumber", target.songNumber);
        }
        if (target.mepsDocumentId > 0) {
            intent.putExtra("mepsDocumentId", target.mepsDocumentId);
        }
        return intent;
    }

    private static Target parseIntentExtras(Intent intent, String url) {
        return null;
    }
}
