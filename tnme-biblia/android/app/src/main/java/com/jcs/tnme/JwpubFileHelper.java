package com.jcs.tnme;

import android.content.Context;
import android.net.Uri;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public final class JwpubFileHelper {
    private JwpubFileHelper() {}

    public static File copyToAppStorage(Context context, Uri uri) {
        String name = queryDisplayName(context, uri);
        if (name == null || !name.toLowerCase().endsWith(".jwpub")) {
            name = "bible.jwpub";
        }

        File dir = new File(context.getFilesDir(), "jwpub");
        dir.mkdirs();
        File out = new File(dir, name);

        InputStream input = null;
        FileOutputStream output = null;
        try {
            input = context.getContentResolver().openInputStream(uri);
            if (input == null) return null;
            output = new FileOutputStream(out);
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            output.flush();
            return out;
        } catch (Exception e) {
            return null;
        } finally {
            try {
                if (input != null) input.close();
            } catch (Exception ignored) {
            }
            try {
                if (output != null) output.close();
            } catch (Exception ignored) {
            }
        }
    }

    private static String queryDisplayName(Context context, Uri uri) {
        InputStream probe = null;
        try {
            android.database.Cursor cursor =
                context.getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (index >= 0) {
                            return cursor.getString(index);
                        }
                    }
                } finally {
                    cursor.close();
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }
}
