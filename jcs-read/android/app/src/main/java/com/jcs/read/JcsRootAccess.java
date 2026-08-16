package com.jcs.read;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public final class JcsRootAccess {
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private final Context context;
    private final boolean treeMode;
    private final File fileRoot;
    private final Uri treeUri;

    private JcsRootAccess(Context context) {
        this.context = context.getApplicationContext();
        this.treeMode = JcsPrefs.MODE_TREE.equals(JcsPrefs.getMode(context));
        this.fileRoot = JcsPrefs.getFileRoot(context);
        this.treeUri = JcsPrefs.getTreeRoot(context);
    }

    public static JcsRootAccess from(Context context) {
        return new JcsRootAccess(context);
    }

    public static boolean looksLikeJcsFolder(File dir) {
        if (dir == null || !dir.isDirectory()) return false;
        if (new File(dir, "catalog.json").isFile()) return true;
        if (new File(dir, "preaching/catalog.json").isFile()) return true;
        File weeks = new File(dir, "weeks");
        if (weeks.isDirectory() && hasWeekManifest(weeks)) return true;
        File preachingWeeks = new File(dir, "preaching/weeks");
        return preachingWeeks.isDirectory() && hasWeekManifest(preachingWeeks);
    }

    private static boolean hasWeekManifest(File weeksDir) {
        File[] children = weeksDir.listFiles();
        if (children == null) return false;
        for (File child : children) {
            if (child.isDirectory() && new File(child, "week.json").isFile()) {
                return true;
            }
        }
        return false;
    }

    public List<JcsStorage.WeekEntry> loadWeeks() {
        return loadWeeks(JcsPackage.MEETINGS);
    }

    public List<JcsStorage.WeekEntry> loadWeeks(String pkg) {
        List<JcsStorage.WeekEntry> weeks = new ArrayList<JcsStorage.WeekEntry>();
        if (treeMode && treeUri != null) {
            weeks.addAll(loadWeeksFromTree(pkg));
        } else {
            weeks.addAll(loadWeeksFromFile(pkg));
        }

        Collections.sort(
            weeks,
            new Comparator<JcsStorage.WeekEntry>() {
                @Override
                public int compare(JcsStorage.WeekEntry a, JcsStorage.WeekEntry b) {
                    return a.dateIso.compareTo(b.dateIso);
                }
            });
        return weeks;
    }

    private List<JcsStorage.WeekEntry> loadWeeksFromFile(String pkg) {
        List<JcsStorage.WeekEntry> weeks = new ArrayList<JcsStorage.WeekEntry>();
        File catalogFile = new File(fileRoot, JcsPackage.catalogRelativePath(pkg));
        if (catalogFile.isFile()) {
            try {
                JSONObject catalog = new JSONObject(readTextFile(catalogFile));
                JSONArray array = catalog.optJSONArray("weeks");
                if (array != null) {
                    for (int i = 0; i < array.length(); i++) {
                        weeks.add(JcsStorage.WeekEntry.fromCatalog(array.getJSONObject(i)));
                    }
                }
            } catch (Exception ignored) {
                weeks.clear();
            }
        }

        if (weeks.isEmpty()) {
            weeks.addAll(scanWeekFoldersFile(pkg));
        }
        return weeks;
    }

    private List<JcsStorage.WeekEntry> scanWeekFoldersFile(String pkg) {
        List<JcsStorage.WeekEntry> weeks = new ArrayList<JcsStorage.WeekEntry>();
        File weeksDir = new File(fileRoot, JcsPackage.weeksRelativeDir(pkg));
        File[] folders = weeksDir.listFiles();
        if (folders == null) return weeks;

        for (File folder : folders) {
            if (!folder.isDirectory()) continue;
            File manifest = new File(folder, "week.json");
            if (!manifest.isFile()) continue;
            try {
                JSONObject json = new JSONObject(readTextFile(manifest));
                weeks.add(JcsStorage.WeekEntry.fromWeekManifest(json, folder.getName()));
            } catch (Exception ignored) {
                // skip
            }
        }
        return weeks;
    }

    private List<JcsStorage.WeekEntry> loadWeeksFromTree(String pkg) {
        List<JcsStorage.WeekEntry> weeks = new ArrayList<JcsStorage.WeekEntry>();
        try {
            String rootId = DocumentsContract.getTreeDocumentId(treeUri);
            TreeNode catalog = findRelativePath(rootId, JcsPackage.catalogRelativePath(pkg));
            if (catalog != null && catalog.isFile) {
                JSONObject catalogJson = new JSONObject(readTreeText(catalog.uri));
                JSONArray array = catalogJson.optJSONArray("weeks");
                if (array != null) {
                    for (int i = 0; i < array.length(); i++) {
                        weeks.add(JcsStorage.WeekEntry.fromCatalog(array.getJSONObject(i)));
                    }
                }
            }
        } catch (Exception ignored) {
            weeks.clear();
        }

        if (weeks.isEmpty()) {
            weeks.addAll(scanWeekFoldersTree(pkg));
        }
        return weeks;
    }

    private List<JcsStorage.WeekEntry> scanWeekFoldersTree(String pkg) {
        List<JcsStorage.WeekEntry> weeks = new ArrayList<JcsStorage.WeekEntry>();
        try {
            String rootId = DocumentsContract.getTreeDocumentId(treeUri);
            TreeNode weeksDir = findRelativePath(rootId, JcsPackage.weeksRelativeDir(pkg));
            if (weeksDir == null || !weeksDir.isDirectory) return weeks;

            for (TreeNode folder : listChildren(weeksDir.documentId)) {
                if (!folder.isDirectory) continue;
                TreeNode manifest = findChildByName(folder.documentId, "week.json");
                if (manifest == null || !manifest.isFile) continue;
                try {
                    JSONObject json = new JSONObject(readTreeText(manifest.uri));
                    weeks.add(JcsStorage.WeekEntry.fromWeekManifest(json, folder.displayName));
                } catch (Exception ignored) {
                    // skip
                }
            }
        } catch (Exception ignored) {
            // empty
        }
        return weeks;
    }

    public JcsStorage.WeekDetail loadWeekDetail(JcsStorage.WeekEntry entry) throws Exception {
        return loadWeekDetail(entry, JcsPackage.MEETINGS);
    }

    public JcsStorage.WeekDetail loadWeekDetail(JcsStorage.WeekEntry entry, String pkg) throws Exception {
        if (treeMode && treeUri != null) {
            return loadWeekDetailTree(entry, pkg);
        }
        return loadWeekDetailFile(entry, pkg);
    }

    private JcsStorage.WeekDetail loadWeekDetailFile(JcsStorage.WeekEntry entry, String pkg) throws Exception {
        File weekDir = getWeekDirFile(entry.folder, pkg);
        File manifest = new File(weekDir, "week.json");
        JSONObject json = new JSONObject(readTextFile(manifest));

        JcsStorage.WeekDetail detail = new JcsStorage.WeekDetail();
        detail.label = json.optString("label", entry.label);
        detail.bibleReading = json.optString("bibleReading", entry.bibleReading);
        detail.folder = entry.folder;
        detail.documents = new ArrayList<JcsStorage.DocumentEntry>();

        JSONArray docs = json.optJSONArray("documents");
        if (docs != null) {
            for (int i = 0; i < docs.length(); i++) {
                JSONObject doc = docs.getJSONObject(i);
                JcsStorage.DocumentEntry document = new JcsStorage.DocumentEntry();
                document.id = doc.optString("id");
                document.kind = doc.optString("kind");
                document.title = doc.optString("title");
                document.file = doc.optString("file");
                File htmlFile = new File(weekDir, document.file);
                document.htmlUri = "file://" + htmlFile.getAbsolutePath();
                detail.documents.add(document);
            }
        }
        return detail;
    }

    private JcsStorage.WeekDetail loadWeekDetailTree(JcsStorage.WeekEntry entry, String pkg) throws Exception {
        String rootId = DocumentsContract.getTreeDocumentId(treeUri);
        TreeNode weeksDir = findRelativePath(rootId, JcsPackage.weeksRelativeDir(pkg));
        if (weeksDir == null) throw new Exception("Pasta weeks não encontrada");

        TreeNode weekDir = findChildByName(weeksDir.documentId, entry.folder);
        if (weekDir == null) throw new Exception("Semana não encontrada");

        TreeNode manifestNode = findChildByName(weekDir.documentId, "week.json");
        if (manifestNode == null) throw new Exception("week.json ausente");

        JSONObject json = new JSONObject(readTreeText(manifestNode.uri));
        JcsStorage.WeekDetail detail = new JcsStorage.WeekDetail();
        detail.label = json.optString("label", entry.label);
        detail.bibleReading = json.optString("bibleReading", entry.bibleReading);
        detail.folder = entry.folder;
        detail.documents = new ArrayList<JcsStorage.DocumentEntry>();

        JSONArray docs = json.optJSONArray("documents");
        if (docs != null) {
            for (int i = 0; i < docs.length(); i++) {
                JSONObject doc = docs.getJSONObject(i);
                JcsStorage.DocumentEntry document = new JcsStorage.DocumentEntry();
                document.id = doc.optString("id");
                document.kind = doc.optString("kind");
                document.title = doc.optString("title");
                document.file = doc.optString("file");
                TreeNode htmlNode = findChildByName(weekDir.documentId, document.file);
                if (htmlNode != null) {
                    document.htmlUri = htmlNode.uri.toString();
                }
                detail.documents.add(document);
            }
        }
        return detail;
    }

    public String readWeekHtml(String weekFolder, String htmlFileName) throws Exception {
        return readWeekHtml(weekFolder, htmlFileName, JcsPackage.MEETINGS);
    }

    public String readWeekHtml(String weekFolder, String htmlFileName, String pkg) throws Exception {
        if (treeMode && treeUri != null) {
            TreeNode weekDir = findWeekDirInTree(weekFolder, pkg);
            TreeNode htmlNode = findChildByName(weekDir.documentId, htmlFileName);
            if (htmlNode == null) throw new Exception("HTML não encontrado");
            return readTreeText(htmlNode.uri);
        }
        File htmlFile = new File(getWeekDirFile(weekFolder, pkg), htmlFileName);
        return readTextFile(htmlFile);
    }

    public String rewriteAssetUrls(String weekFolder, String html) {
        return rewriteAssetUrls(weekFolder, html, JcsPackage.MEETINGS);
    }

    public String rewriteAssetUrls(String weekFolder, String html, String pkg) {
        if (html == null || html.length() == 0) return html;

        StringBuilder out = new StringBuilder();
        int cursor = 0;
        final String marker = "assets/";
        while (cursor < html.length()) {
            int idx = html.indexOf(marker, cursor);
            if (idx < 0) {
                out.append(html.substring(cursor));
                break;
            }
            out.append(html.substring(cursor, idx));
            int start = idx + marker.length();
            int end = start;
            while (end < html.length()) {
                char c = html.charAt(end);
                if (c == '"' || c == '\'' || c == ')' || c == ' ' || c == '<' || c == '?' || c == '&') {
                    break;
                }
                end++;
            }
            String assetName = html.substring(start, end);
            String resolved = resolveAssetUri(weekFolder, assetName, pkg);
            if (resolved != null) {
                out.append(resolved);
            } else {
                out.append(marker).append(assetName);
            }
            cursor = end;
        }
        return out.toString();
    }

    private String resolveAssetUri(String weekFolder, String assetFileName) {
        return resolveAssetUri(weekFolder, assetFileName, JcsPackage.MEETINGS);
    }

    private String resolveAssetUri(String weekFolder, String assetFileName, String pkg) {
        if (assetFileName == null || assetFileName.length() == 0) return null;
        try {
            if (treeMode && treeUri != null) {
                TreeNode weekDir = findWeekDirInTree(weekFolder, pkg);
                TreeNode assetsDir = findChildByName(weekDir.documentId, "assets");
                if (assetsDir == null) return null;
                TreeNode asset = findChildByName(assetsDir.documentId, assetFileName);
                if (asset == null) return null;
                return asset.uri.toString();
            }
            File asset = new File(new File(getWeekDirFile(weekFolder, pkg), "assets"), assetFileName);
            if (!asset.isFile()) return null;
            return "file://" + asset.getAbsolutePath();
        } catch (Exception ignored) {
            return null;
        }
    }

    private File getWeekDirFile(String weekFolder) {
        return getWeekDirFile(weekFolder, JcsPackage.MEETINGS);
    }

    private File getWeekDirFile(String weekFolder, String pkg) {
        return new File(new File(fileRoot, JcsPackage.weeksRelativeDir(pkg)), weekFolder);
    }

    private TreeNode findWeekDirInTree(String weekFolder) throws Exception {
        return findWeekDirInTree(weekFolder, JcsPackage.MEETINGS);
    }

    private TreeNode findWeekDirInTree(String weekFolder, String pkg) throws Exception {
        String rootId = DocumentsContract.getTreeDocumentId(treeUri);
        TreeNode weeksDir = findRelativePath(rootId, JcsPackage.weeksRelativeDir(pkg));
        if (weeksDir == null) throw new Exception("Pasta weeks não encontrada");
        TreeNode weekDir = findChildByName(weeksDir.documentId, weekFolder);
        if (weekDir == null) throw new Exception("Semana não encontrada");
        return weekDir;
    }

    private TreeNode findRelativePath(String rootDocumentId, String relativePath) throws Exception {
        if (relativePath == null || relativePath.length() == 0) return null;
        String[] segments = relativePath.split("/");
        String parentId = rootDocumentId;
        TreeNode node = null;
        for (int i = 0; i < segments.length; i++) {
            node = findChildByName(parentId, segments[i]);
            if (node == null) return null;
            parentId = node.documentId;
        }
        return node;
    }

    private String readTextFile(File file) throws Exception {
        FileInputStream stream = new FileInputStream(file);
        try {
            return readStream(stream);
        } finally {
            stream.close();
        }
    }

    private String readTreeText(Uri uri) throws Exception {
        InputStream stream = context.getContentResolver().openInputStream(uri);
        if (stream == null) throw new Exception("Não foi possível abrir arquivo");
        try {
            return readStream(stream);
        } finally {
            stream.close();
        }
    }

    private static String readStream(InputStream stream) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(stream, UTF8));
        StringBuilder builder = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            if (builder.length() > 0) builder.append('\n');
            builder.append(line);
        }
        return builder.toString();
    }

    private static final class TreeNode {
        String documentId;
        String displayName;
        Uri uri;
        boolean isDirectory;
        boolean isFile;
    }

    private List<TreeNode> listChildren(String parentDocumentId) throws Exception {
        List<TreeNode> nodes = new ArrayList<TreeNode>();
        ContentResolver resolver = context.getContentResolver();
        Uri childrenUri =
            DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId);
        Cursor cursor = null;
        try {
            cursor =
                resolver.query(
                    childrenUri,
                    new String[] {
                        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                        DocumentsContract.Document.COLUMN_MIME_TYPE,
                    },
                    null,
                    null,
                    null);
            if (cursor == null) return nodes;
            while (cursor.moveToNext()) {
                TreeNode node = new TreeNode();
                node.documentId = cursor.getString(0);
                node.displayName = cursor.getString(1);
                String mime = cursor.getString(2);
                node.isDirectory =
                    DocumentsContract.Document.MIME_TYPE_DIR.equals(mime);
                node.isFile = !node.isDirectory;
                node.uri =
                    DocumentsContract.buildDocumentUriUsingTree(treeUri, node.documentId);
                nodes.add(node);
            }
        } finally {
            if (cursor != null) cursor.close();
        }
        return nodes;
    }

    private TreeNode findChildByName(String parentDocumentId, String name) throws Exception {
        for (TreeNode node : listChildren(parentDocumentId)) {
            if (name.equals(node.displayName)) return node;
        }
        return null;
    }
}
