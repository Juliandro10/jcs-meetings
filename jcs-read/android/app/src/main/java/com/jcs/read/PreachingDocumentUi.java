package com.jcs.read;

import android.content.Context;

public final class PreachingDocumentUi {
    private PreachingDocumentUi() {}

    public static String resolveKind(JcsStorage.DocumentEntry doc) {
        if (doc.kind != null && doc.kind.length() > 0) {
            return doc.kind;
        }
        if (doc.id != null) {
            if ("preaching".equals(doc.id)) return "preaching";
            if ("field-service".equals(doc.id)) return "field-service";
        }
        if (doc.file != null) {
            if ("preaching.html".equals(doc.file)) return "preaching";
            if ("field-service.html".equals(doc.file)) return "field-service";
        }
        return "other";
    }

    public static String sectionKeyForKind(String kind) {
        if ("preaching".equals(kind)) return "preaching";
        if ("field-service".equals(kind)) return "field-service";
        return "other";
    }

    public static int thumbDrawableForKind(String kind) {
        if ("preaching".equals(kind)) {
            return R.drawable.thumb_placeholder_default;
        }
        if ("field-service".equals(kind)) {
            return R.drawable.thumb_placeholder_default;
        }
        return R.drawable.thumb_placeholder_default;
    }

    public static String sectionTitleForKey(Context context, String sectionKey) {
        if ("preaching".equals(sectionKey)) {
            return context.getString(R.string.section_preaching);
        }
        if ("field-service".equals(sectionKey)) {
            return context.getString(R.string.section_field_service);
        }
        return context.getString(R.string.section_other);
    }

    public static int sectionOrder(String sectionKey) {
        if ("preaching".equals(sectionKey)) return 0;
        if ("field-service".equals(sectionKey)) return 1;
        return 2;
    }

    public static int documentOrder(String kind) {
        if ("preaching".equals(kind)) return 0;
        if ("field-service".equals(kind)) return 1;
        return 2;
    }

    public static String displayTitle(Context context, JcsStorage.DocumentEntry doc, String weekLabel) {
        if (doc.title != null && doc.title.length() > 0) {
            return doc.title;
        }
        String kind = resolveKind(doc);
        if ("preaching".equals(kind)) {
            return context.getString(R.string.doc_preaching);
        }
        if ("field-service".equals(kind)) {
            return context.getString(R.string.doc_field_service);
        }
        return weekLabel != null ? weekLabel : "";
    }

    public static String displaySubtitle(
        Context context,
        JcsStorage.DocumentEntry doc,
        String weekLabel,
        String bibleReading
    ) {
        if (bibleReading != null && bibleReading.length() > 0) {
            return bibleReading;
        }
        if (weekLabel != null && weekLabel.length() > 0) {
            return weekLabel;
        }
        return null;
    }
}
