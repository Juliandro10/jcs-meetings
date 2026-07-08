package com.jcs.tnme;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class BibleReferenceParser {
    static class Result {
        int bookNumber;
        int chapterNumber;
        int verseStart;
        int verseEnd;
        String label;
    }

    private static final String[][] BOOK_ALIASES = {
        {"1", "genesis", "gênesis", "gen", "gên", "ge"},
        {"2", "exodo", "êxodo", "exo", "êx", "ex"},
        {"3", "levitico", "levítico", "lev"},
        {"4", "numeros", "números", "num", "núm"},
        {"5", "deuteronomio", "deuteronômio", "deu"},
        {"6", "josue", "josué", "jos"},
        {"7", "juizes", "juízes", "jui", "juí"},
        {"8", "rute", "rut"},
        {"9", "1 samuel", "1sam", "1 sam"},
        {"10", "2 samuel", "2sam", "2 sam"},
        {"11", "1 reis", "1re", "1 re"},
        {"12", "2 reis", "2re", "2 re"},
        {"13", "1 cronicas", "1 crônicas", "1cr", "1 cr"},
        {"14", "2 cronicas", "2 crônicas", "2cr", "2 cr"},
        {"15", "esdras", "esd"},
        {"16", "neemias", "ne"},
        {"17", "ester", "est"},
        {"18", "jo", "jó"},
        {"19", "salmos", "salmo", "sl", "sal"},
        {"20", "proverbios", "provérbios", "pr"},
        {"21", "eclesiastes", "ec"},
        {"22", "cantico", "cântico", "cân", "cant"},
        {"23", "isaias", "isaías", "is"},
        {"24", "jeremias", "jer"},
        {"25", "lamentacoes", "lamentações", "lam"},
        {"26", "ezequiel", "eze"},
        {"27", "daniel", "da"},
        {"28", "oseias", "os"},
        {"29", "joel", "jl"},
        {"30", "amos", "am"},
        {"31", "obadias", "ob"},
        {"32", "jonas", "jon"},
        {"33", "miqueias", "miq"},
        {"34", "naum", "na"},
        {"35", "habacuque", "hab"},
        {"36", "sofonias", "sof"},
        {"37", "ageu", "ag"},
        {"38", "zacarias", "zac"},
        {"39", "malaquias", "mal"},
        {"40", "mateus", "mat", "mát", "mt"},
        {"41", "marcos", "mar", "mr"},
        {"42", "lucas", "lu"},
        {"43", "joao", "joão", "jo"},
        {"44", "atos", "at"},
        {"45", "romanos", "ro"},
        {"46", "1 corintios", "1 coríntios", "1co", "1 co"},
        {"47", "2 corintios", "2 coríntios", "2co", "2 co"},
        {"48", "galatas", "gálatas", "gál", "gal"},
        {"49", "efesios", "efésios", "ef"},
        {"50", "filipenses", "fil"},
        {"51", "colossenses", "col"},
        {"52", "1 tessalonicenses", "1te", "1 te"},
        {"53", "2 tessalonicenses", "2te", "2 te"},
        {"54", "1 timoteo", "1 timóteo", "1ti", "1 ti"},
        {"55", "2 timoteo", "2 timóteo", "2ti", "2 ti"},
        {"56", "tito", "tit"},
        {"57", "filemon", "filémon", "flm"},
        {"58", "hebreus", "he"},
        {"59", "tiago", "tg"},
        {"60", "1 pedro", "1pe", "1 pe"},
        {"61", "2 pedro", "2pe", "2 pe"},
        {"62", "1 joao", "1 joão", "1jo", "1 jo"},
        {"63", "2 joao", "2 joão", "2jo", "2 jo"},
        {"64", "3 joao", "3 joão", "3jo", "3 jo"},
        {"65", "judas", "jd"},
        {"66", "apocalipse", "ap"},
    };

    private BibleReferenceParser() {}

    static Result parse(String raw, List<JwpubReader.BookInfo> books) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.length() == 0) return null;

        Matcher ref =
            Pattern.compile(
                    "^(.+?)\\s+(\\d+)\\s*[:.]\\s*(\\d+)(?:\\s*[-–—]\\s*(\\d+))?$",
                    Pattern.CASE_INSENSITIVE)
                .matcher(trimmed);
        if (ref.find()) {
            int book = resolveBook(ref.group(1).trim(), books);
            int chapter = parseInt(ref.group(2));
            int verseStart = parseInt(ref.group(3));
            int verseEnd = ref.group(4) != null ? parseInt(ref.group(4)) : verseStart;
            if (book > 0 && chapter > 0 && verseStart > 0) {
                return build(book, chapter, verseStart, verseEnd, trimmed, books);
            }
        }

        Matcher chapterOnly =
            Pattern.compile("^(.+?)\\s+(\\d+)$", Pattern.CASE_INSENSITIVE).matcher(trimmed);
        if (chapterOnly.find()) {
            int book = resolveBook(chapterOnly.group(1).trim(), books);
            int chapter = parseInt(chapterOnly.group(2));
            if (book > 0 && chapter > 0) {
                return build(book, chapter, 1, 1, trimmed, books);
            }
        }

        return null;
    }

    private static Result build(
        int bookNumber,
        int chapterNumber,
        int verseStart,
        int verseEnd,
        String raw,
        List<JwpubReader.BookInfo> books) {
        Result result = new Result();
        result.bookNumber = bookNumber;
        result.chapterNumber = chapterNumber;
        result.verseStart = verseStart;
        result.verseEnd = verseEnd >= verseStart ? verseEnd : verseStart;
        result.label = raw;
        for (JwpubReader.BookInfo book : books) {
            if (book.bookNumber == bookNumber) {
                result.label = stripHtml(book.title) + " " + chapterNumber + ":" + verseStart;
                if (result.verseEnd != verseStart) {
                    result.label += "-" + result.verseEnd;
                }
                break;
            }
        }
        return result;
    }

    private static int resolveBook(String token, List<JwpubReader.BookInfo> books) {
        String normalized = normalize(token);
        if (normalized.length() == 0) return 0;

        for (String[] entry : BOOK_ALIASES) {
            int bookNumber = Integer.parseInt(entry[0]);
            for (int i = 1; i < entry.length; i++) {
                if (normalize(entry[i]).equals(normalized)) {
                    return bookNumber;
                }
            }
        }

        for (JwpubReader.BookInfo book : books) {
            String title = normalize(stripHtml(book.title));
            if (title.equals(normalized) || title.startsWith(normalized) || normalized.startsWith(title)) {
                return book.bookNumber;
            }
            String abbrev = normalize(BookAbbrev.forBook(book.bookNumber, book.title));
            if (abbrev.equals(normalized)) {
                return book.bookNumber;
            }
        }
        return 0;
    }

    private static String normalize(String value) {
        if (value == null) return "";
        String lower = value.toLowerCase(Locale.getDefault()).trim();
        return Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
    }

    private static int parseInt(String value) {
        try {
            return Integer.parseInt(value.trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private static String stripHtml(String value) {
        if (value == null) return "";
        return value.replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
    }
}
