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
            if ("prepared-parts".equals(doc.id)) return "prepared-parts";
            if (doc.id.startsWith("prepared-part-")) return "prepared-part";
            if ("cbs".equals(doc.id)) return "cbs";
            if ("w".equals(doc.id)) return "w";
            if ("chairman".equals(doc.id)) return "chairman";
            if ("public-talk".equals(doc.id)) return "public-talk";
            if (doc.id.startsWith("discourse-outline")) return "discourse-outline";
        }
        if (doc.file != null) {
            if ("mwb.html".equals(doc.file)) return "mwb";
            if ("prepared-parts.html".equals(doc.file)) return "prepared-parts";
            if (doc.file.startsWith("roteiro-") && doc.file.endsWith(".html")) return "prepared-part";
            if ("cbs.html".equals(doc.file)) return "cbs";
            if ("w.html".equals(doc.file)) return "w";
            if ("chairman.html".equals(doc.file)) return "chairman";
            if ("public-talk.html".equals(doc.file)) return "public-talk";
        }
        return "other";
    }

    public static String sectionKeyForKind(String kind) {
        if ("mwb".equals(kind) || "prepared-parts".equals(kind) || "prepared-part".equals(kind)) return "mwb";
        if ("cbs".equals(kind)) return "cbs";
        if ("w".equals(kind)) return "w";
        return "other";
    }

    public static int thumbDrawableForKind(String kind) {
        if ("mwb".equals(kind) || "prepared-parts".equals(kind) || "prepared-part".equals(kind)) {
            return R.drawable.thumb_placeholder_mwb;
        }
        if ("cbs".equals(kind)) {
            return R.drawable.thumb_placeholder_cbs;
        }
        if ("w".equals(kind)) {
            return R.drawable.thumb_placeholder_w;
        }
        return R.drawable.thumb_placeholder_default;
    }

    public static String sectionTitleForKey(Context context, String sectionKey) {
        if ("mwb".equals(sectionKey)) {
            return context.getString(R.string.section_mwb);
        }
        if ("cbs".equals(sectionKey)) {
            return context.getString(R.string.section_cbs);
        }
        if ("w".equals(sectionKey)) {
            return context.getString(R.string.section_watchtower);
        }
        return context.getString(R.string.section_other);
    }

    public static int sectionOrder(String sectionKey) {
        if ("mwb".equals(sectionKey)) return 0;
        if ("cbs".equals(sectionKey)) return 1;
        if ("w".equals(sectionKey)) return 2;
        return 3;
    }

    public static int documentOrder(String kind) {
        if ("mwb".equals(kind)) return 0;
        if ("prepared-parts".equals(kind) || "prepared-part".equals(kind)) return 1;
        if ("cbs".equals(kind)) return 2;
        if ("w".equals(kind)) return 3;
        return 4;
    }

    public static String displayTitle(Context context, JcsStorage.DocumentEntry doc, String weekLabel) {
        String kind = resolveKind(doc);
        if ("mwb".equals(kind)) {
            return weekLabel != null && weekLabel.length() > 0 ? weekLabel : doc.title;
        }
        if ("prepared-parts".equals(kind)) {
            return doc.title != null && doc.title.length() > 0
                ? doc.title
                : context.getString(R.string.doc_prepared_parts);
        }
        if ("prepared-part".equals(kind)) {
            return doc.title != null && doc.title.length() > 0 ? doc.title : "Roteiro";
        }
        if ("cbs".equals(kind)) {
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
        if ("cbs".equals(kind) && doc.title != null && doc.title.length() > 0) {
            return doc.title;
        }
        if ("prepared-parts".equals(kind) && bibleReading != null && bibleReading.length() > 0) {
            return bibleReading;
        }
        if ("prepared-part".equals(kind) && bibleReading != null && bibleReading.length() > 0) {
            return bibleReading;
        }
        return null;
    }
}
