package com.jcs.tnme;

final class BibleBookSections {
    private BibleBookSections() {}

    /**
     * Cores alinhadas ao JW Library — retrato histórico da Bíblia (9 faixas).
     *
     * Hebraicas: Pentateuco (1–5), Históricos (6–17), Poéticos (18–22),
     * Profetas maiores (23–27), Profetas menores (28–39).
     * Gregas: Evangelhos (40–43), Atos (44), Cartas (45–65), Apocalipse (66).
     */
    static int tileColorRes(int bookNumber) {
        if (bookNumber >= 1 && bookNumber <= 5) {
            return R.color.tnme_section_pentateuch;
        }
        if (bookNumber >= 6 && bookNumber <= 17) {
            return R.color.tnme_section_historical;
        }
        if (bookNumber >= 18 && bookNumber <= 22) {
            return R.color.tnme_section_poetic;
        }
        if (bookNumber >= 23 && bookNumber <= 27) {
            return R.color.tnme_section_major_prophets;
        }
        if (bookNumber >= 28 && bookNumber <= 39) {
            return R.color.tnme_section_minor_prophets;
        }
        if (bookNumber >= 40 && bookNumber <= 43) {
            return R.color.tnme_section_gospels;
        }
        if (bookNumber == 44) {
            return R.color.tnme_section_acts;
        }
        if (bookNumber >= 45 && bookNumber <= 65) {
            return R.color.tnme_section_letters;
        }
        if (bookNumber == 66) {
            return R.color.tnme_section_revelation;
        }
        return R.color.tnme_tile_a;
    }
}
