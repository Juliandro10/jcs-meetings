package com.jcs.tnme;

final class BookAbbrev {
    private static final String[] ABBREV = {
        "",
        "Gên", "Êx", "Le", "Núm", "Deu", "Jos", "Juí", "Rut", "1Sam", "2Sam",
        "1Re", "2Re", "1Cr", "2Cr", "Esd", "Ne", "Est", "Jó", "Sl", "Pr",
        "Ec", "Cân", "Is", "Jer", "Lam", "Eze", "Da", "Os", "Jl", "Am",
        "Ob", "Jon", "Miq", "Na", "Hab", "Sof", "Ag", "Zac", "Mal",
        "Mt", "Mr", "Lu", "Jo", "At", "Ro", "1Co", "2Co", "Gál", "Ef", "Fil",
        "Col", "1Te", "2Te", "1Ti", "2Ti", "Tit", "Flm", "He", "Tg", "1Pe",
        "2Pe", "1Jo", "2Jo", "3Jo", "Jd", "Ap",
    };

    private BookAbbrev() {}

    static String forBook(int bookNumber, String title) {
        if (bookNumber > 0 && bookNumber < ABBREV.length && ABBREV[bookNumber].length() > 0) {
            return ABBREV[bookNumber];
        }
        if (title == null || title.length() == 0) return String.valueOf(bookNumber);
        String[] words = title.split("\\s+");
        if (words.length == 1) return words[0].length() > 4 ? words[0].substring(0, 4) : words[0];
        StringBuilder sb = new StringBuilder();
        for (String word : words) {
            if (word.length() > 0) sb.append(word.charAt(0));
        }
        return sb.length() > 0 ? sb.toString() : title;
    }
}
