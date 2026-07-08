package com.jcs.tnme;

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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

public final class JwpubReader {
    public static class BookInfo {
        public int bookNumber;
        public String title;
        public int chapterCount;
    }

    private static JwpubReader instance;

    private final File jwpubFile;
    private final File cacheDir;
    private final String pub;
    private final String lang;
    private final String issue;
    private final byte[] keyIv;
    private final SQLiteDatabase db;
    private final ZipFile outerZip;
    private final ZipFile innerZip;
    private final Map<String, File> mediaCache = new HashMap<String, File>();

    private JwpubReader(
        File jwpubFile,
        File cacheDir,
        String pub,
        String lang,
        String issue,
        byte[] keyIv,
        SQLiteDatabase db,
        ZipFile outerZip,
        ZipFile innerZip) {
        this.jwpubFile = jwpubFile;
        this.cacheDir = cacheDir;
        this.pub = pub;
        this.lang = lang;
        this.issue = issue;
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
        byte[] keyIv = JwpubCrypto.deriveKeyIv(meta.lang, meta.symbol, meta.year, meta.issue);

        instance =
            new JwpubReader(jwpubFile, cacheDir, parsed.pub, parsed.lang, parsed.issue, keyIv, database, outer, inner);
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

    public String getPub() {
        return pub;
    }

    public String getEditionLabel() {
        if ("nwtsty".equalsIgnoreCase(pub)) {
            return "Edição de Estudo";
        }
        if ("nwt".equalsIgnoreCase(pub)) {
            return "Tradução do Novo Mundo";
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
        java.io.InputStream input = innerZip.getInputStream(entry);
        java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
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

    public List<BookInfo> listBooks() {
        List<BookInfo> books = new ArrayList<BookInfo>();
        Cursor cursor =
            db.rawQuery(
                "SELECT bb.BibleBookId, bb.BookDisplayTitle, COUNT(bc.BibleChapterId) AS ChapterCount "
                    + "FROM BibleBook bb "
                    + "LEFT JOIN BibleChapter bc ON bc.BookNumber = bb.BibleBookId "
                    + "GROUP BY bb.BibleBookId, bb.BookDisplayTitle "
                    + "ORDER BY bb.BibleBookId",
                null);
        try {
            while (cursor.moveToNext()) {
                BookInfo book = new BookInfo();
                book.bookNumber = cursor.getInt(0);
                book.title = stripHtml(cursor.getString(1));
                book.chapterCount = cursor.getInt(2);
                books.add(book);
            }
        } finally {
            cursor.close();
        }
        return books;
    }

    public ChapterContent loadChapter(int bookNumber, int chapterNumber) throws Exception {
        String bookTitle = null;
        Cursor bookCursor =
            db.rawQuery(
                "SELECT BookDisplayTitle FROM BibleBook WHERE BibleBookId = ? LIMIT 1",
                new String[] {String.valueOf(bookNumber)});
        try {
            if (bookCursor.moveToFirst()) {
                bookTitle = stripHtml(bookCursor.getString(0));
            }
        } finally {
            bookCursor.close();
        }

        byte[] encrypted = null;
        Cursor chapterCursor =
            db.rawQuery(
                "SELECT Content FROM BibleChapter WHERE BookNumber = ? AND ChapterNumber = ? LIMIT 1",
                new String[] {String.valueOf(bookNumber), String.valueOf(chapterNumber)});
        try {
            if (chapterCursor.moveToFirst()) {
                encrypted = chapterCursor.getBlob(0);
            }
        } finally {
            chapterCursor.close();
        }

        if (encrypted == null) {
            throw new IllegalStateException("Capítulo não encontrado.");
        }

        String html = JwpubCrypto.decryptContent(keyIv, encrypted);
        html = rewriteMediaUrls(html);
        String publicationCss = JwpubCss.prepare(this, html);
        html = JwpubCss.stripInlineStyles(html);
        return new ChapterContent(
            bookTitle != null ? bookTitle : ("Livro " + bookNumber),
            chapterNumber,
            html,
            publicationCss);
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

    public static class ChapterContent {
        public final String bookTitle;
        public final int chapterNumber;
        public final String html;
        public final String publicationCss;

        ChapterContent(String bookTitle, int chapterNumber, String html, String publicationCss) {
            this.bookTitle = bookTitle;
            this.chapterNumber = chapterNumber;
            this.html = html;
            this.publicationCss = publicationCss;
        }
    }

    public static class SearchHit {
        public int bookNumber;
        public String bookTitle;
        public int chapterNumber;
        public int verseStart;
        public String snippet;
    }

    public List<SearchHit> searchText(String query, int maxResults) throws Exception {
        if (query == null || query.trim().length() < 2) {
            return new ArrayList<SearchHit>();
        }

        String needle = normalizeSearchText(query);
        List<SearchHit> hits = new ArrayList<SearchHit>();
        List<BookInfo> books = listBooks();
        for (BookInfo book : books) {
            for (int chapterNumber = 1; chapterNumber <= book.chapterCount; chapterNumber++) {
                ChapterContent chapter = loadChapter(book.bookNumber, chapterNumber);
                String plain = normalizeSearchText(stripHtml(chapter.html));
                int index = plain.indexOf(needle);
                if (index < 0) continue;

                SearchHit hit = new SearchHit();
                hit.bookNumber = book.bookNumber;
                hit.bookTitle = chapter.bookTitle;
                hit.chapterNumber = chapterNumber;
                hit.verseStart = 1;
                hit.snippet = buildSnippet(plain, index, needle.length());
                hits.add(hit);
                if (hits.size() >= maxResults) {
                    return hits;
                }
            }
        }
        return hits;
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
