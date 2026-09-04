package com.jcs.read2;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;

/** Seletor de ZIP que permite navegar pastas (Drive/Arquivos). */
public final class ZipPickerHelper {
    private ZipPickerHelper() {}

    public static void open(Activity activity, int requestCode) {
        String title = activity.getString(R.string.pick_zip_hint);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            Intent documentIntent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            documentIntent.addCategory(Intent.CATEGORY_OPENABLE);
            documentIntent.setType("*/*");
            documentIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                activity.startActivityForResult(Intent.createChooser(documentIntent, title), requestCode);
                return;
            } catch (Exception ignored) {
            }
        }

        Intent contentIntent = new Intent(Intent.ACTION_GET_CONTENT);
        contentIntent.addCategory(Intent.CATEGORY_OPENABLE);
        contentIntent.setType("*/*");
        activity.startActivityForResult(Intent.createChooser(contentIntent, title), requestCode);
    }
}
