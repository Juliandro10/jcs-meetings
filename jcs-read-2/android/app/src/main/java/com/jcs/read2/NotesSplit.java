package com.jcs.read2;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Separa o bloco de notas do HTML exportado (section.jcs-notes-block). */
public final class NotesSplit {
    public static final class Parts {
        public String outlineHtml;
        public String notesHtml;
        public boolean hasNotes;
    }

    private static final Pattern NOTES_BLOCK =
        Pattern.compile(
            "(?is)<section\\s+[^>]*class=\"[^\"]*jcs-notes-block[^\"]*\"[^>]*>[\\s\\S]*?</section>");

    private NotesSplit() {}

    public static Parts split(String html) {
        Parts parts = new Parts();
        if (html == null || html.length() == 0) {
            parts.outlineHtml = "";
            parts.notesHtml = "";
            parts.hasNotes = false;
            return parts;
        }

        Matcher matcher = NOTES_BLOCK.matcher(html);
        if (!matcher.find()) {
            parts.outlineHtml = html;
            parts.notesHtml = "";
            parts.hasNotes = false;
            return parts;
        }

        String notesInner = matcher.group();
        parts.outlineHtml = matcher.replaceFirst("");
        parts.notesHtml = wrapNotesPanel(notesInner);
        parts.hasNotes = true;
        return parts;
    }

    public static String wrapNotesPanel(String notesInner) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>");
        sb.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no\"/>");
        sb.append("<style>");
        sb.append("html{font-size:15px;-webkit-text-size-adjust:100%;}");
        sb.append("body{margin:0;padding:10px 12px 24px;color:#ececf1;background:#16161c;");
        sb.append("font-family:'Segoe UI',Roboto,sans-serif;line-height:1.5;}");
        sb.append(".jcs-notes-block{margin:0;padding:0;border:none;}");
        sb.append(".jcs-notes-block h2{font-size:13px;color:#c4b5fd;margin:0 0 10px;text-transform:uppercase;letter-spacing:.04em;}");
        sb.append(".jcs-note-card{margin:0 0 12px;padding:10px 12px;background:#1f1f28;border:1px solid #3a3a44;border-radius:6px;}");
        sb.append(".jcs-note-card h3{font-size:14px;margin:0 0 6px;color:#f4f4f5;}");
        sb.append(".jcs-note-card p{margin:0 0 6px;font-size:15px;color:#ececf1;}");
        sb.append(".jcs-note-quote{font-size:13px;color:#a1a1aa;font-style:italic;margin:0 0 6px;}");
        sb.append("a{color:#c4b5fd;}");
        sb.append("</style></head><body>");
        sb.append(notesInner == null ? "" : notesInner);
        sb.append("</body></html>");
        return sb.toString();
    }

    public static String emptyNotesHtml(String message) {
        return wrapNotesPanel(
            "<p style=\"color:#a1a1aa;text-align:center;padding:24px 8px;\">"
                + escapeHtml(message)
                + "</p>");
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;");
    }
}
