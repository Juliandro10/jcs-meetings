package com.jcs.read;

import android.content.Context;

public final class DocumentUi {
    private DocumentUi() {}

    public static String resolveKind(JcsStorage.DocumentEntry doc) {
        if (doc.kind != null && doc.kind.length() > 0) {
            return doc.kind;
        }
        if (doc.id != null) {
            if ("mwb".equals(doc.id)) return "mwb";
            if ("w".equals(doc.id)) return "w";
            if ("chairman".equals(doc.id)) return "chairman";
            if ("public-talk".equals(doc.id)) return "public-talk";
            if (doc.id.startsWith("discourse-outline")) return "discourse-outline";
        }
        if (doc.file != null) {
            if ("mwb.html".equals(doc.file)) return "mwb";
            if ("w.html".equals(doc.file)) return "w";
            if ("chairman.html".equals(doc.file)) return "chairman";
            if ("public-talk.html".equals(doc.file)) return "public-talk";
        }
        return "other";
    }

    public static int thumbDrawableForKind(String kind) {
        if ("mwb".equals(kind)) {
            return R.drawable.thumb_placeholder_mwb;
        }
        if ("w".equals(kind)) {
            return R.drawable.thumb_placeholder_w;
        }
        return R.drawable.thumb_placeholder_default;
    }

    public static String sectionTitleForKind(Context context, String kind) {
        if ("mwb".equals(kind)) {
            return context.getString(R.string.section_mwb);
        }
        if ("w".equals(kind)) {
            return context.getString(R.string.section_watchtower);
        }
        return context.getString(R.string.section_other);
    }

    public static int sectionOrder(String kind) {
        if ("mwb".equals(kind)) return 0;
        if ("w".equals(kind)) return 1;
        return 2;
    }

    public static String displayTitle(Context context, JcsStorage.DocumentEntry doc, String weekLabel) {
        String kind = resolveKind(doc);
        if ("mwb".equals(kind)) {
            return weekLabel != null && weekLabel.length() > 0 ? weekLabel : doc.title;
        }
        if ("w".equals(kind) && doc.title != null && doc.title.length() > 0) {
            return doc.title;
        }
        return doc.title != null ? doc.title : "";
    }

    public static String displaySubtitle(
        Context context,
        JcsStorage.DocumentEntry doc,
        String weekLabel,
        String bibleReading
    ) {
        String kind = resolveKind(doc);
        if ("w".equals(kind) && weekLabel != null && weekLabel.length() > 0) {
            return weekLabel.toUpperCase();
        }
        if ("mwb".equals(kind) && bibleReading != null && bibleReading.length() > 0) {
            return bibleReading;
        }
        return null;
    }
}
