package com.jcs.tnme;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.File;

public final class BiblePrefs {
    private static final String PREFS = "tnme_bible_prefs";
    private static final String KEY_JWPUB_PATH = "jwpub_path";

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
}
