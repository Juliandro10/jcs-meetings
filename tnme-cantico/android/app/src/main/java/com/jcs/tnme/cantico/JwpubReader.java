package com.jcs.tnme.cantico;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

public final class JwpubReader {
    public static class SongInfo {
        public int documentId;
        public int songNumber;
        public String title;
        public int mepsDocumentId;
    }

    public static class SongContent {
        public final int documentId;
        public final int songNumber;
        public final String title;
        public final String html;
        public final String publicationCss;

        SongContent(int documentId, int songNumber, String title, String html, String publicationCss) {
            this.documentId = documentId;
            this.songNumber = songNumber;
            this.title = title;
            this.html = html;
            this.publicationCss = publicationCss;
        }
    }

    public static class SearchHit {
        public int documentId;
        public int songNumber;
        public String title;
        public String snippet;
    }

    private static JwpubReader instance;

    private final File jwpubFile;
    private final File cacheDir;
    private final String pub;
    private final byte[] keyIv;
    private final SQLiteDatabase db;
    private final ZipFile outerZip;
    private final ZipFile innerZip;
    private final Map<String, File> mediaCache = new HashMap<String, File>();
    private List<SongInfo> cachedSongs;

    private JwpubReader(
        File jwpubFile,
        File cacheDir,
        String pub,
        byte[] keyIv,
        SQLiteDatabase db,
        ZipFile outerZip,
        ZipFile innerZip) {
        this.jwpubFile = jwpubFile;
        this.cacheDir = cacheDir;
        this.pub = pub;
        this.keyIv = keyIv;
        this.db = db;
        this.outerZip = outerZip;
        this.innerZip = innerZip;
    }

    public static synchronized JwpubReader open(File jwpubFile, File cacheDir) throws Exception {
        if (instance != null && instance.jwpubFile.equals(jwpubFile)) {
            return instance;
        }
        close();

        ParseName parsed = parseFileName(jwpubFile.getName());
        File workDir = new File(cacheDir, "jwpub-" + parsed.pub + "-" + parsed.lang);
        workDir.mkdirs();

        ZipFile outer = new ZipFile(jwpubFile);
        String manifestRaw = readZipText(outer, "manifest.json");
        JSONObject manifest = new JSONObject(manifestRaw);
        String dbName = manifest.getJSONObject("publication").getString("fileName");

        File innerZipFile = new File(workDir, "contents.zip");
        extractZipEntry(outer, "contents", innerZipFile);
        ZipFile inner = new ZipFile(innerZipFile);

        File dbFile = new File(workDir, dbName);
        if (!dbFile.exists() || dbFile.lastModified() < jwpubFile.lastModified()) {
            extractZipEntry(inner, dbName, dbFile);
        }

        SQLiteDatabase database = SQLiteDatabase.openDatabase(dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
        PublicationMeta meta = readPublication(database);
        byte[] keyIvBytes = JwpubCrypto.deriveKeyIv(meta.lang, meta.symbol, meta.year, meta.issue);

        instance = new JwpubReader(jwpubFile, cacheDir, parsed.pub, keyIvBytes, database, outer, inner);
        return instance;
    }

    public static synchronized void close() {
        if (instance == null) return;
        try {
            instance.db.close();
        } catch (Exception ignored) {
        }
        try {
            instance.outerZip.close();
        } catch (Exception ignored) {
        }
        try {
            instance.innerZip.close();
        } catch (Exception ignored) {
        }
        instance = null;
    }

    public String getEditionLabel() {
        Cursor cursor = db.rawQuery("SELECT Title FROM Publication LIMIT 1", null);
        try {
            if (cursor.moveToFirst()) {
                return stripHtml(cursor.getString(0));
            }
        } finally {
            cursor.close();
        }
        if ("sjj".equalsIgnoreCase(pub)) {
            return "Cante de Coração para Jeová";
        }
        return pub.toUpperCase();
    }

    public String getJwpubKey() {
        return jwpubFile.getAbsolutePath() + ":" + jwpubFile.lastModified();
    }

    ZipFile getInnerZip() {
        return innerZip;
    }

    String readInnerText(String entryName) throws Exception {
        ZipEntry entry = innerZip.getEntry(entryName);
        if (entry == null) {
            entry = innerZip.getEntry(entryName.replace("%20", " "));
        }
        if (entry == null) return null;
        InputStream input = innerZip.getInputStream(entry);
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int read;
        while ((read = input.read(chunk)) != -1) {
            buffer.write(chunk, 0, read);
        }
        input.close();
        return buffer.toString("UTF-8");
    }

    String rewriteMediaUrlsInCss(String css) {
        Matcher matcher = Pattern.compile("jwpub-media://([^\"'\\)\\s]+)").matcher(css);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String mediaPath = matcher.group(1);
            try {
                File file = resolveMediaFile(mediaPath);
                matcher.appendReplacement(sb, "file://" + file.getAbsolutePath().replace("\\", "/"));
            } catch (Exception e) {
                matcher.appendReplacement(sb, "");
            }
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    public synchronized List<SongInfo> listSongs() {
        if (cachedSongs != null) {
            return cachedSongs;
        }

        Map<Integer, SongInfo> unique = new HashMap<Integer, SongInfo>();
        Cursor cursor =
            db.rawQuery(
                "SELECT d.DocumentId, d.Title, d.MepsDocumentId, pvi.Title AS ViewTitle "
                    + "FROM Document d "
                    + "JOIN PublicationViewItemDocument pvid ON pvid.DocumentId = d.DocumentId "
                    + "JOIN PublicationViewItem pvi ON pvi.PublicationViewItemId = pvid.PublicationViewItemId "
                    + "WHERE d.Type = 0 "
                    + "ORDER BY d.MepsDocumentId ASC, pvi.PublicationViewItemId ASC",
                null);
        try {
            while (cursor.moveToNext()) {
                int documentId = cursor.getInt(0);
                if (unique.containsKey(documentId)) {
                    SongInfo existing = unique.get(documentId);
                    int altNumber = parseSongNumber(cursor.getString(3));
                    if (existing.songNumber <= 0 && altNumber > 0) {
                        existing.songNumber = altNumber;
                    }
                    continue;
                }
                SongInfo song = new SongInfo();
                song.documentId = documentId;
                song.title = stripHtml(cursor.getString(1));
                song.mepsDocumentId = cursor.getInt(2);
                song.songNumber = parseSongNumber(cursor.getString(3));
                unique.put(documentId, song);
            }
        } finally {
            cursor.close();
        }

        List<SongInfo> songs = new ArrayList<SongInfo>(unique.values());
        Collections.sort(
            songs,
            new Comparator<SongInfo>() {
                @Override
                public int compare(SongInfo a, SongInfo b) {
                    if (a.songNumber > 0 && b.songNumber > 0) {
                        return a.songNumber - b.songNumber;
                    }
                    if (a.songNumber > 0) return -1;
                    if (b.songNumber > 0) return 1;
                    return a.title.compareToIgnoreCase(b.title);
                }
            });
        cachedSongs = songs;
        return songs;
    }

    public SongInfo findBySongNumber(int songNumber) {
        if (songNumber <= 0) return null;
        for (SongInfo song : listSongs()) {
            if (song.songNumber == songNumber) {
                return song;
            }
        }
        return null;
    }

    public SongInfo findByMepsDocumentId(int mepsDocumentId) {
        if (mepsDocumentId <= 0) return null;
        for (SongInfo song : listSongs()) {
            if (song.mepsDocumentId == mepsDocumentId) {
                return song;
            }
        }
        return null;
    }

    public SongInfo findByDocumentId(int documentId) {
        for (SongInfo song : listSongs()) {
            if (song.documentId == documentId) {
                return song;
            }
        }
        return null;
    }

    public SongContent loadSong(int documentId) throws Exception {
        SongInfo info = findByDocumentId(documentId);
        String title = info != null ? info.title : "Cântico";
        int songNumber = info != null ? info.songNumber : 0;

        byte[] encrypted = null;
        Cursor cursor =
            db.rawQuery("SELECT Title, Content FROM Document WHERE DocumentId = ? LIMIT 1", new String[] {String.valueOf(documentId)});
        try {
            if (cursor.moveToFirst()) {
                title = stripHtml(cursor.getString(0));
                encrypted = cursor.getBlob(1);
            }
        } finally {
            cursor.close();
        }

        if (encrypted == null) {
            throw new IllegalStateException("Cântico não encontrado.");
        }

        String html = JwpubCrypto.decryptContent(keyIv, encrypted);
        html = rewriteMediaUrls(html);
        String publicationCss = JwpubCss.prepare(this, html);
        html = JwpubCss.stripInlineStyles(html);
        if (songNumber <= 0) {
            songNumber = parseSongNumberFromHtml(html);
        }
        return new SongContent(documentId, songNumber, title, html, publicationCss);
    }

    public List<SearchHit> searchText(String query, int maxResults) throws Exception {
        if (query == null || query.trim().length() < 2) {
            return new ArrayList<SearchHit>();
        }
        String needle = normalizeSearchText(query);
        List<SearchHit> hits = new ArrayList<SearchHit>();
        for (SongInfo song : listSongs()) {
            String titleNorm = normalizeSearchText(song.title);
            if (titleNorm.contains(needle)) {
                hits.add(buildTitleHit(song, song.title));
                if (hits.size() >= maxResults) return hits;
                continue;
            }
            SongContent content = loadSong(song.documentId);
            String plain = normalizeSearchText(stripHtml(content.html));
            int index = plain.indexOf(needle);
            if (index < 0) continue;
            SearchHit hit = new SearchHit();
            hit.documentId = song.documentId;
            hit.songNumber = song.songNumber;
            hit.title = song.title;
            hit.snippet = buildSnippet(plain, index, needle.length());
            hits.add(hit);
            if (hits.size() >= maxResults) return hits;
        }
        return hits;
    }

    public File resolveMediaFile(String mediaPath) throws Exception {
        File cached = mediaCache.get(mediaPath);
        if (cached != null && cached.exists()) {
            return cached;
        }

        File mediaDir = new File(cacheDir, "media");
        mediaDir.mkdirs();
        File out = new File(mediaDir, mediaPath.replace('/', '_'));
        if (!out.exists()) {
            extractZipEntry(innerZip, mediaPath, out);
        }
        mediaCache.put(mediaPath, out);
        return out;
    }

    private SearchHit buildTitleHit(SongInfo song, String subtitle) {
        SearchHit hit = new SearchHit();
        hit.documentId = song.documentId;
        hit.songNumber = song.songNumber;
        hit.title = song.title;
        hit.snippet = subtitle;
        return hit;
    }

    private String rewriteMediaUrls(String html) {
        Matcher matcher = Pattern.compile("jwpub-media://([^\"'\\s>]+)").matcher(html);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String mediaPath = matcher.group(1);
            try {
                File file = resolveMediaFile(mediaPath);
                matcher.appendReplacement(sb, "file://" + file.getAbsolutePath().replace("\\", "/"));
            } catch (Exception e) {
                matcher.appendReplacement(sb, "");
            }
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    static int parseSongNumber(String viewTitle) {
        if (viewTitle == null) return 0;
        String trimmed = viewTitle.trim();
        if (trimmed.matches("\\d+")) {
            return Integer.parseInt(trimmed);
        }
        Matcher trailing = Pattern.compile("\\s(\\d+)\\s*$").matcher(trimmed);
        if (trailing.find()) {
            return Integer.parseInt(trailing.group(1));
        }
        return 0;
    }

    private static int parseSongNumberFromHtml(String html) {
        if (html == null) return 0;
        Matcher match = Pattern.compile("C[ÂA]NTICO\\s+(\\d+)", Pattern.CASE_INSENSITIVE).matcher(html);
        if (match.find()) {
            return Integer.parseInt(match.group(1));
        }
        return 0;
    }

    private static PublicationMeta readPublication(SQLiteDatabase database) {
        Cursor cursor =
            database.rawQuery(
                "SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1", null);
        try {
            if (!cursor.moveToFirst()) {
                throw new IllegalStateException("Publication vazia.");
            }
            PublicationMeta meta = new PublicationMeta();
            meta.lang = cursor.getString(0);
            meta.symbol = cursor.getString(1);
            meta.year = cursor.getString(2);
            meta.issue = cursor.getString(3);
            return meta;
        } finally {
            cursor.close();
        }
    }

    private static String readZipText(ZipFile zip, String entryName) throws Exception {
        ZipEntry entry = zip.getEntry(entryName);
        if (entry == null) {
            throw new IllegalStateException("Entrada ausente: " + entryName);
        }
        InputStream input = zip.getInputStream(entry);
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int read;
        while ((read = input.read(chunk)) != -1) {
            buffer.write(chunk, 0, read);
        }
        input.close();
        return buffer.toString("UTF-8");
    }

    private static void extractZipEntry(ZipFile zip, String entryName, File outFile) throws Exception {
        ZipEntry entry = zip.getEntry(entryName);
        if (entry == null) {
            throw new IllegalStateException("Entrada ausente: " + entryName);
        }
        InputStream input = new BufferedInputStream(zip.getInputStream(entry));
        FileOutputStream output = new FileOutputStream(outFile);
        byte[] chunk = new byte[8192];
        int read;
        while ((read = input.read(chunk)) != -1) {
            output.write(chunk, 0, read);
        }
        output.flush();
        output.close();
        input.close();
    }

    private static ParseName parseFileName(String fileName) {
        Matcher match = Pattern.compile("^(.+)_([A-Za-z]+)_?(\\d*)\\.jwpub$", Pattern.CASE_INSENSITIVE).matcher(fileName);
        if (!match.find()) {
            throw new IllegalArgumentException("Nome jwpub inválido: " + fileName);
        }
        ParseName parsed = new ParseName();
        parsed.pub = match.group(1).toLowerCase();
        parsed.lang = match.group(2);
        parsed.issue = match.group(3) != null ? match.group(3) : "";
        return parsed;
    }

    private static String stripHtml(String value) {
        if (value == null) return "";
        return value.replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
    }

    private static String normalizeSearchText(String value) {
        if (value == null) return "";
        return value
            .toLowerCase(java.util.Locale.getDefault())
            .replaceAll("<[^>]+>", " ")
            .replaceAll("\\s+", " ")
            .trim();
    }

    private static String buildSnippet(String plain, int index, int matchLength) {
        int start = Math.max(0, index - 40);
        int end = Math.min(plain.length(), index + matchLength + 60);
        String snippet = plain.substring(start, end).trim();
        if (start > 0) snippet = "… " + snippet;
        if (end < plain.length()) snippet = snippet + " …";
        return snippet;
    }

    private static class PublicationMeta {
        String lang;
        String symbol;
        String year;
        String issue;
    }

    private static class ParseName {
        String pub;
        String lang;
        String issue;
    }
}
