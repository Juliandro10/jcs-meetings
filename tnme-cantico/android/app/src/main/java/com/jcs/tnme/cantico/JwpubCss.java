package com.jcs.tnme.cantico;

import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

final class JwpubCss {
    private static String cachedCss;
    private static String cachedFor;

    private JwpubCss() {}

    static String prepare(JwpubReader reader, String html) throws Exception {
        String key = reader.getJwpubKey();
        if (cachedCss == null || !key.equals(cachedFor)) {
            cachedCss = loadAllCss(reader);
            cachedFor = key;
        }

        String linked = loadLinkedCss(reader, html);
        String inline = extractInlineCss(html);
        StringBuilder combined = new StringBuilder();
        if (cachedCss.length() > 0) combined.append(cachedCss).append('\n');
        if (linked.length() > 0) combined.append(linked).append('\n');
        if (inline.length() > 0) combined.append(inline);
        return combined.toString().trim();
    }

    static String stripInlineStyles(String html) {
        return html.replaceAll("(?is)<style[^>]*>[\\s\\S]*?</style>", "");
    }

    private static String loadAllCss(JwpubReader reader) throws Exception {
        ZipFile inner = reader.getInnerZip();
        List<String> names = new ArrayList<String>();
        Enumeration<? extends ZipEntry> entries = inner.entries();
        while (entries.hasMoreElements()) {
            ZipEntry entry = entries.nextElement();
            String name = entry.getName();
            if (!entry.isDirectory() && name.toLowerCase().endsWith(".css")) {
                names.add(name);
            }
        }
        java.util.Collections.sort(names);

        StringBuilder css = new StringBuilder();
        for (String name : names) {
            String raw = reader.readInnerText(name);
            if (raw != null && raw.trim().length() > 0) {
                css.append(reader.rewriteMediaUrlsInCss(raw)).append('\n');
            }
        }
        return css.toString();
    }

    private static String loadLinkedCss(JwpubReader reader, String html) throws Exception {
        Set<String> hrefs = new HashSet<String>();
        Matcher matcher =
            Pattern.compile("href=[\"']jwpub-media://([^\"']+\\.css)[\"']", Pattern.CASE_INSENSITIVE)
                .matcher(html);
        while (matcher.find()) {
            hrefs.add(matcher.group(1));
        }

        StringBuilder css = new StringBuilder();
        for (String href : hrefs) {
            String raw = reader.readInnerText(href);
            if (raw != null && raw.trim().length() > 0) {
                css.append(reader.rewriteMediaUrlsInCss(raw)).append('\n');
            }
        }
        return css.toString();
    }

    private static String extractInlineCss(String html) {
        StringBuilder css = new StringBuilder();
        Matcher matcher = Pattern.compile("(?is)<style[^>]*>([\\s\\S]*?)</style>").matcher(html);
        while (matcher.find()) {
            css.append(matcher.group(1).trim()).append('\n');
        }
        return css.toString();
    }
}
