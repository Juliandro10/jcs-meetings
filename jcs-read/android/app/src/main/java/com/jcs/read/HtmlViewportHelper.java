package com.jcs.read;

import java.util.regex.Pattern;

public final class HtmlViewportHelper {
    private static final String LOCKED_VIEWPORT =
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no\">";
    private static final Pattern VIEWPORT_META =
        Pattern.compile("<meta\\s+name=[\"']viewport[\"'][^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern HEAD_OPEN =
        Pattern.compile("<head[^>]*>", Pattern.CASE_INSENSITIVE);

    private HtmlViewportHelper() {}

    public static String lockViewport(String html) {
        if (html == null || html.length() == 0) {
            return html;
        }
        if (VIEWPORT_META.matcher(html).find()) {
            return VIEWPORT_META.matcher(html).replaceAll(LOCKED_VIEWPORT);
        }
        if (HEAD_OPEN.matcher(html).find()) {
            return HEAD_OPEN.matcher(html).replaceFirst("$0" + LOCKED_VIEWPORT);
        }
        return "<!DOCTYPE html><html><head>" + LOCKED_VIEWPORT + "</head><body>" + html + "</body></html>";
    }
}
