package com.jcs.read2;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public final class JcsWeekKind {
    private JcsWeekKind() {}

    public static boolean isOutlinesWeek(JcsStorage.WeekEntry entry) {
        if (entry == null) return false;
        if ("elder-outlines".equals(entry.weekId)) return true;
        if (entry.folder != null && "esbocos".equalsIgnoreCase(entry.folder)) return true;
        if (entry.label == null) return false;
        String label = entry.label.toLowerCase(Locale.US);
        return "esboços".equalsIgnoreCase(entry.label)
            || label.contains("discursos p")
            || "discursos públicos".equalsIgnoreCase(entry.label);
    }

    public static boolean isImportedWeek(JcsStorage.WeekEntry entry) {
        if (entry == null) return false;
        if ("imported-docs".equals(entry.weekId)) return true;
        if (entry.folder != null && "importados".equalsIgnoreCase(entry.folder)) return true;
        String label = entry.label != null ? entry.label.toLowerCase(Locale.US) : "";
        return label.contains("documentos importados") || "documentos".equals(label);
    }

    public static boolean isSpecialWeek(JcsStorage.WeekEntry entry) {
        return isOutlinesWeek(entry) || isImportedWeek(entry);
    }

    public static List<JcsStorage.WeekEntry> meetingWeeks(List<JcsStorage.WeekEntry> all) {
        List<JcsStorage.WeekEntry> out = new ArrayList<JcsStorage.WeekEntry>();
        if (all == null) return out;
        for (JcsStorage.WeekEntry entry : all) {
            if (!isSpecialWeek(entry)) out.add(entry);
        }
        return out;
    }

    public static JcsStorage.WeekEntry findOutlines(List<JcsStorage.WeekEntry> all) {
        if (all == null) return null;
        for (JcsStorage.WeekEntry entry : all) {
            if (isOutlinesWeek(entry)) return entry;
        }
        return null;
    }

    public static JcsStorage.WeekEntry findImported(List<JcsStorage.WeekEntry> all) {
        if (all == null) return null;
        for (JcsStorage.WeekEntry entry : all) {
            if (isImportedWeek(entry)) return entry;
        }
        return null;
    }

    public static int indexOfWeek(List<JcsStorage.WeekEntry> weeks, String weekId) {
        if (weeks == null || weekId == null || weekId.length() == 0) return -1;
        for (int i = 0; i < weeks.size(); i++) {
            if (weekId.equals(weeks.get(i).weekId)) return i;
        }
        return -1;
    }

    public static int indexOfCurrentWeek(List<JcsStorage.WeekEntry> weeks) {
        if (weeks == null || weeks.isEmpty()) return -1;
        long today = startOfDay(System.currentTimeMillis());
        int best = -1;
        for (int i = 0; i < weeks.size(); i++) {
            long start = parseDateIso(weeks.get(i).dateIso);
            if (start == Long.MIN_VALUE) continue;
            if (start <= today) best = i;
        }
        return best >= 0 ? best : 0;
    }

    public static boolean isThisWeek(JcsStorage.WeekEntry entry) {
        if (entry == null) return false;
        long start = parseDateIso(entry.dateIso);
        if (start == Long.MIN_VALUE) return false;
        Calendar end = Calendar.getInstance();
        end.setTimeInMillis(start);
        end.add(Calendar.DAY_OF_MONTH, 7);
        long today = startOfDay(System.currentTimeMillis());
        return today >= start && today < end.getTimeInMillis();
    }

    public static String navLabel(JcsStorage.WeekEntry entry, String thisWeekSuffix) {
        String label = entry != null && entry.label != null ? entry.label : "";
        if (isThisWeek(entry) && thisWeekSuffix != null && thisWeekSuffix.length() > 0) {
            if (label.length() > 0) return label + " · " + thisWeekSuffix;
            return thisWeekSuffix;
        }
        return label;
    }

    static long parseDateIso(String dateIso) {
        if (dateIso == null || dateIso.length() < 10) return Long.MIN_VALUE;
        if (dateIso.startsWith("0000")) return Long.MIN_VALUE;
        try {
            SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            format.setLenient(false);
            Date parsed = format.parse(dateIso.substring(0, 10));
            if (parsed == null) return Long.MIN_VALUE;
            return startOfDay(parsed.getTime());
        } catch (Exception ignored) {
            return Long.MIN_VALUE;
        }
    }

    private static long startOfDay(long millis) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(millis);
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        return calendar.getTimeInMillis();
    }
}
