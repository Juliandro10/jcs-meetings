package com.jcs.read;

public final class JcsPackage {
    public static final String MEETINGS = "meetings";
    public static final String PREACHING = "preaching";

    private JcsPackage() {}

    public static String catalogRelativePath(String pkg) {
        return PREACHING.equals(pkg) ? "preaching/catalog.json" : "catalog.json";
    }

    public static String weeksRelativeDir(String pkg) {
        return PREACHING.equals(pkg) ? "preaching/weeks" : "weeks";
    }
}
