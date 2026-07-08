package com.jcs.read;

import android.content.Context;
import android.net.Uri;
import android.provider.OpenableColumns;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public final class JcsZipHelper {
    private JcsZipHelper() {}

    /** Copia o zip, extrai em filesDir/jcs_read_package e retorna a pasta raiz do pacote. */
    public static File importZip(Context context, Uri uri) {
        String displayName = queryDisplayName(context, uri);
        if (displayName == null || displayName.length() == 0) {
            displayName = "jcs-read.zip";
        }

        File zipDir = new File(context.getFilesDir(), "jcs_read_zip");
        zipDir.mkdirs();
        File zipFile = new File(zipDir, "package.zip");

        if (!copyUriToFile(context, uri, zipFile)) {
            return null;
        }

        File extractRoot = new File(context.getFilesDir(), "jcs_read_package");
        deleteRecursive(extractRoot);
        extractRoot.mkdirs();

        if (!extractZip(zipFile, extractRoot)) {
            deleteRecursive(extractRoot);
            return null;
        }

        File packageRoot = resolvePackageRoot(extractRoot);
        if (packageRoot == null || !JcsRootAccess.looksLikeJcsFolder(packageRoot)) {
            deleteRecursive(extractRoot);
            return null;
        }

        JcsPrefs.setFileRootFromZip(context, packageRoot, displayName);
        return packageRoot;
    }

    private static File resolvePackageRoot(File extractRoot) {
        if (JcsRootAccess.looksLikeJcsFolder(extractRoot)) {
            return extractRoot;
        }
        File[] children = extractRoot.listFiles();
        if (children == null) return null;
        for (File child : children) {
            if (child.isDirectory() && JcsRootAccess.looksLikeJcsFolder(child)) {
                return child;
            }
        }
        return null;
    }

    private static boolean extractZip(File zipFile, File destDir) {
        ZipInputStream zis = null;
        try {
            zis = new ZipInputStream(new BufferedInputStream(new java.io.FileInputStream(zipFile)));
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName();
                if (name == null || name.length() == 0) {
                    zis.closeEntry();
                    continue;
                }
                name = name.replace('\\', '/');
                if (name.contains("..")) {
                    zis.closeEntry();
                    continue;
                }
                File out = new File(destDir, name);
                if (entry.isDirectory()) {
                    out.mkdirs();
                } else {
                    File parent = out.getParentFile();
                    if (parent != null) parent.mkdirs();
                    FileOutputStream fos = new FileOutputStream(out);
                    try {
                        int read;
                        while ((read = zis.read(buffer)) != -1) {
                            fos.write(buffer, 0, read);
                        }
                        fos.flush();
                    } finally {
                        fos.close();
                    }
                }
                zis.closeEntry();
            }
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            try {
                if (zis != null) zis.close();
            } catch (Exception ignored) {
            }
        }
    }

    private static boolean copyUriToFile(Context context, Uri uri, File out) {
        InputStream input = null;
        FileOutputStream output = null;
        try {
            input = context.getContentResolver().openInputStream(uri);
            if (input == null) return false;
            output = new FileOutputStream(out);
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            output.flush();
            return true;
        } catch (Exception e) {
            return false;
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
        android.database.Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(uri, null, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    return cursor.getString(index);
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return null;
    }

    private static void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        file.delete();
    }
}
