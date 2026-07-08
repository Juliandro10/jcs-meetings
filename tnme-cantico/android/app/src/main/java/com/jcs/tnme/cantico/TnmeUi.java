package com.jcs.tnme.cantico;

import android.app.Activity;
import android.content.res.Resources;
import android.os.Build;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

final class TnmeUi {
    private TnmeUi() {}

    static int songGridColumns(Activity activity) {
        return 5;
    }

    static Button songNumberTile(Activity activity, String numberLabel) {
        Button tile = new Button(activity);
        tile.setText(numberLabel);
        tile.setTextColor(activity.getResources().getColor(R.color.tnme_text));
        tile.setTextSize(TypedValue.COMPLEX_UNIT_SP, screenWidthDp(activity) >= 540f ? 18f : 16f);
        tile.setAllCaps(false);
        tile.setBackgroundColor(activity.getResources().getColor(R.color.tnme_chapter_bg));
        int minH = (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, screenWidthDp(activity) >= 540f ? 56f : 48f,
            activity.getResources().getDisplayMetrics());
        tile.setMinHeight(minH);
        tile.setMinWidth(minH);
        tile.setPadding(0, dp(activity, 4), 0, dp(activity, 4));
        tile.setGravity(Gravity.CENTER);
        return tile;
    }

    static int gridColumns(Activity activity) {
        float widthDp = screenWidthDp(activity);
        if (widthDp >= 960f) return 10;
        if (widthDp >= 720f) return 8;
        if (widthDp >= 540f) return 7;
        return 6;
    }

    static int contentMaxWidthPx(Activity activity) {
        float widthDp = screenWidthDp(activity);
        Resources res = activity.getResources();
        if (widthDp >= 540f) {
            return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, 560f, res.getDisplayMetrics());
        }
        return LinearLayout.LayoutParams.MATCH_PARENT;
    }

    static int tileMinHeightPx(Activity activity) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, 52f, activity.getResources().getDisplayMetrics());
    }

    static float tileTextSizeSp(Activity activity) {
        return screenWidthDp(activity) >= 540f ? 15f : 13f;
    }

    static TextView sectionHeader(Activity activity, String title) {
        TextView header = new TextView(activity);
        header.setText(title);
        header.setTextColor(activity.getResources().getColor(R.color.tnme_text));
        header.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            header.setLetterSpacing(0.08f);
        }
        header.setPadding(dp(activity, 4), dp(activity, 18), dp(activity, 4), dp(activity, 10));
        return header;
    }

    static Button gridTile(Activity activity, String label, int backgroundColor) {
        Button tile = new Button(activity);
        tile.setText(label);
        tile.setTextColor(activity.getResources().getColor(R.color.tnme_text));
        tile.setTextSize(TypedValue.COMPLEX_UNIT_SP, tileTextSizeSp(activity));
        tile.setAllCaps(false);
        tile.setBackgroundColor(backgroundColor);
        int minH = tileMinHeightPx(activity);
        tile.setMinHeight(minH);
        tile.setPadding(0, dp(activity, 8), 0, dp(activity, 8));
        tile.setGravity(Gravity.CENTER);
        return tile;
    }

    static LinearLayout centeredContentRoot(Activity activity) {
        LinearLayout outer = new LinearLayout(activity);
        outer.setOrientation(LinearLayout.VERTICAL);
        outer.setLayoutParams(
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout inner = new LinearLayout(activity);
        inner.setOrientation(LinearLayout.VERTICAL);
        int maxW = contentMaxWidthPx(activity);
        LinearLayout.LayoutParams innerParams =
            new LinearLayout.LayoutParams(maxW, LinearLayout.LayoutParams.WRAP_CONTENT);
        innerParams.gravity = Gravity.CENTER_HORIZONTAL;
        innerParams.setMargins(dp(activity, 8), 0, dp(activity, 8), dp(activity, 16));
        inner.setLayoutParams(innerParams);
        inner.setTag("tnme_content");
        outer.addView(inner);
        return outer;
    }

    static LinearLayout getContentColumn(View root) {
        if (root instanceof LinearLayout) {
            LinearLayout outer = (LinearLayout) root;
            if (outer.getChildCount() > 0) {
                View child = outer.getChildAt(0);
                if (child instanceof LinearLayout && "tnme_content".equals(child.getTag())) {
                    return (LinearLayout) child;
                }
            }
        }
        return null;
    }

    static int dp(Activity activity, float value) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value, activity.getResources().getDisplayMetrics());
    }

    private static float screenWidthDp(Activity activity) {
        DisplayMetrics metrics = activity.getResources().getDisplayMetrics();
        return metrics.widthPixels / metrics.density;
    }
}
