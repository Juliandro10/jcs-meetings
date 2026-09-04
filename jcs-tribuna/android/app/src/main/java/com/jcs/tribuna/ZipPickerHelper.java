package com.jcs.tribuna;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;

/**
 * Seletor de ZIP com navegação em pastas (Drive, Arquivos, Downloads).
 * Evita filtro application/zip, que em alguns aparelhos abre o Drive vazio, sem pastas.
 */
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

    public static void retainReadPermission(Activity activity, Intent data) {
        if (activity == null || data == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) {
            return;
        }
        android.net.Uri uri = data.getData();
        if (uri == null) return;
        try {
            int takeFlags = data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
            if (takeFlags != 0) {
                activity.getContentResolver().takePersistableUriPermission(uri, takeFlags);
            }
        } catch (Exception ignored) {
        }
    }
}
