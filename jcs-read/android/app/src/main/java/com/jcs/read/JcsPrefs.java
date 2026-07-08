package com.jcs.read;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Environment;

import java.io.File;

public final class JcsPrefs {
    private static final String PREFS = "jcs_read_prefs";
    private static final String KEY_MODE = "root_mode";
    private static final String KEY_FILE_PATH = "root_file_path";
    private static final String KEY_TREE_URI = "root_tree_uri";
    private static final String KEY_SOURCE_LABEL = "root_source_label";

    public static final String MODE_FILE = "file";
    public static final String MODE_TREE = "tree";

    private JcsPrefs() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static File defaultFileRoot() {
        return new File(Environment.getExternalStorageDirectory(), "JCS");
    }

    public static void setFileRoot(Context context, File folder) {
        prefs(context)
            .edit()
            .putString(KEY_MODE, MODE_FILE)
            .putString(KEY_FILE_PATH, folder.getAbsolutePath())
            .putString(KEY_SOURCE_LABEL, folder.getAbsolutePath())
            .remove(KEY_TREE_URI)
            .apply();
    }

    public static void setFileRootFromZip(Context context, File folder, String zipDisplayName) {
        prefs(context)
            .edit()
            .putString(KEY_MODE, MODE_FILE)
            .putString(KEY_FILE_PATH, folder.getAbsolutePath())
            .putString(KEY_SOURCE_LABEL, "ZIP: " + zipDisplayName)
            .remove(KEY_TREE_URI)
            .apply();
    }

    public static void setTreeRoot(Context context, Uri treeUri) {
        prefs(context)
            .edit()
            .putString(KEY_MODE, MODE_TREE)
            .putString(KEY_TREE_URI, treeUri.toString())
            .putString(KEY_SOURCE_LABEL, treeUri.toString())
            .remove(KEY_FILE_PATH)
            .apply();
    }

    public static String getMode(Context context) {
        return prefs(context).getString(KEY_MODE, MODE_FILE);
    }

    public static File getFileRoot(Context context) {
        String saved = prefs(context).getString(KEY_FILE_PATH, null);
        if (saved != null && saved.length() > 0) {
            return new File(saved);
        }
        return defaultFileRoot();
    }

    public static Uri getTreeRoot(Context context) {
        String saved = prefs(context).getString(KEY_TREE_URI, null);
        if (saved == null || saved.length() == 0) return null;
        return Uri.parse(saved);
    }

    public static String getRootLabel(Context context) {
        String label = prefs(context).getString(KEY_SOURCE_LABEL, null);
        if (label != null && label.length() > 0) return label;
        if (MODE_TREE.equals(getMode(context))) {
            Uri uri = getTreeRoot(context);
            return uri != null ? uri.toString() : "Pasta não definida";
        }
        return getFileRoot(context).getAbsolutePath();
    }

    public static boolean hasCustomRoot(Context context) {
        SharedPreferences p = prefs(context);
        return p.contains(KEY_FILE_PATH) || p.contains(KEY_TREE_URI);
    }
}
