package com.jcs.tnme.cantico;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class SongNumberParser {
    public static class Result {
        public int songNumber;
        public String label;
    }

    private static final Pattern NUMBER_ONLY = Pattern.compile("^\\s*(\\d{1,3})\\s*$");
    private static final Pattern PREFIX =
        Pattern.compile(
            "^\\s*(?:c[âa]ntico|c\\s*|n[ºo°]?\\s*)?(\\d{1,3})\\s*$",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private SongNumberParser() {}

    public static Result parse(String query, List<JwpubReader.SongInfo> songs) {
        if (query == null) return null;
        String trimmed = query.trim();
        if (trimmed.length() == 0) return null;

        Matcher prefix = PREFIX.matcher(trimmed);
        if (prefix.find()) {
            int number = Integer.parseInt(prefix.group(1));
            JwpubReader.SongInfo song = findByNumber(songs, number);
            if (song != null) {
                Result result = new Result();
                result.songNumber = number;
                result.label = formatLabel(song);
                return result;
            }
        }

        Matcher only = NUMBER_ONLY.matcher(trimmed);
        if (only.find()) {
            int number = Integer.parseInt(only.group(1));
            JwpubReader.SongInfo song = findByNumber(songs, number);
            if (song != null) {
                Result result = new Result();
                result.songNumber = number;
                result.label = formatLabel(song);
                return result;
            }
        }

        return null;
    }

    private static JwpubReader.SongInfo findByNumber(List<JwpubReader.SongInfo> songs, int number) {
        if (songs == null) return null;
        for (JwpubReader.SongInfo song : songs) {
            if (song.songNumber == number) {
                return song;
            }
        }
        return null;
    }

    private static String formatLabel(JwpubReader.SongInfo song) {
        if (song.songNumber > 0) {
            return "Cântico " + song.songNumber + " · " + song.title;
        }
        return song.title;
    }
}
