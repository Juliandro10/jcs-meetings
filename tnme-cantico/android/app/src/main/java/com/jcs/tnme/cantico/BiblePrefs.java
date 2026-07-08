package com.jcs.tnme.cantico;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.File;

public final class BiblePrefs {
    private static final String PREFS = "tnme_cantico_prefs";
    private static final String KEY_JWPUB_PATH = "jwpub_path";
    private static final String KEY_TEXT_ZOOM_INDEX = "text_zoom_index";
    private static final int[] TEXT_ZOOM_LEVELS = {85, 100, 115, 130};
    private static final int DEFAULT_TEXT_ZOOM_INDEX = 1;

    private BiblePrefs() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void setJwpubPath(Context context, File file) {
        prefs(context).edit().putString(KEY_JWPUB_PATH, file.getAbsolutePath()).apply();
        JwpubReader.close();
    }

    public static File getJwpubFile(Context context) {
        String saved = prefs(context).getString(KEY_JWPUB_PATH, null);
        if (saved != null && saved.length() > 0) {
            File file = new File(saved);
            if (file.exists()) return file;
        }
        return null;
    }

    public static boolean hasJwpub(Context context) {
        File file = getJwpubFile(context);
        return file != null && file.exists();
    }

    public static int getTextZoomIndex(Context context) {
        int index = prefs(context).getInt(KEY_TEXT_ZOOM_INDEX, DEFAULT_TEXT_ZOOM_INDEX);
        if (index < 0) return 0;
        if (index >= TEXT_ZOOM_LEVELS.length) return TEXT_ZOOM_LEVELS.length - 1;
        return index;
    }

    public static int getTextZoomPercent(Context context) {
        return TEXT_ZOOM_LEVELS[getTextZoomIndex(context)];
    }

    public static int adjustTextZoomIndex(Context context, int delta) {
        int next = getTextZoomIndex(context) + delta;
        if (next < 0) next = 0;
        if (next >= TEXT_ZOOM_LEVELS.length) next = TEXT_ZOOM_LEVELS.length - 1;
        prefs(context).edit().putInt(KEY_TEXT_ZOOM_INDEX, next).apply();
        return TEXT_ZOOM_LEVELS[next];
    }

    public static String getTextZoomLabel(Context context) {
        switch (getTextZoomIndex(context)) {
            case 0:
                return context.getString(R.string.text_size_small);
            case 2:
                return context.getString(R.string.text_size_large);
            case 3:
                return context.getString(R.string.text_size_xlarge);
            default:
                return context.getString(R.string.text_size_normal);
        }
    }
}
