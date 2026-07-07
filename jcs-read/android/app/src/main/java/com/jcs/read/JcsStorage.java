package com.jcs.read;

import android.content.Context;

import org.json.JSONObject;

import java.util.List;

public final class JcsStorage {
    private JcsStorage() {}

    public static List<WeekEntry> loadWeeks(Context context) {
        return JcsRootAccess.from(context).loadWeeks();
    }

    public static WeekDetail loadWeekDetail(Context context, WeekEntry entry) throws Exception {
        return JcsRootAccess.from(context).loadWeekDetail(entry);
    }

    public static class WeekEntry {
        public String weekId;
        public String label;
        public String bibleReading;
        public String dateIso;
        public String folder;

        static WeekEntry fromCatalog(JSONObject json) {
            WeekEntry entry = new WeekEntry();
            entry.weekId = json.optString("weekId");
            entry.label = json.optString("label");
            entry.bibleReading = json.optString("bibleReading");
            entry.dateIso = json.optString("dateIso", "");
            entry.folder = json.optString("folder", entry.weekId);
            return entry;
        }

        static WeekEntry fromWeekManifest(JSONObject json, String folder) {
            WeekEntry entry = new WeekEntry();
            entry.weekId = json.optString("weekId", folder);
            entry.label = json.optString("label", folder);
            entry.bibleReading = json.optString("bibleReading", "");
            entry.dateIso = json.optString("dateIso", "");
            entry.folder = folder;
            return entry;
        }
    }

    public static class WeekDetail {
        public String label;
        public String bibleReading;
        public String folder;
        public List<DocumentEntry> documents;
    }

    public static class DocumentEntry {
        public String id;
        public String title;
        public String file;
        public String htmlUri;
    }
}
