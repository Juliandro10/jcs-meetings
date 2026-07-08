package com.jcs.tnme;

import android.app.Activity;
import android.content.Intent;
import android.view.View;
import android.widget.ImageButton;
import android.widget.TextView;

final class TnmeTopBar {
    interface Actions {
        void onBack();

        void onSearch();

        void onBooks();

        void onMenu();
    }

    private final ImageButton backButton;
    private final ImageButton searchButton;
    private final ImageButton booksButton;
    private final ImageButton menuButton;
    private final TextView titleView;
    private final TextView subtitleView;
    private final Activity activity;

    private TnmeTopBar(Activity activity, View root, final Actions actions) {
        this.activity = activity;
        backButton = (ImageButton) root.findViewById(R.id.tnmeBackButton);
        searchButton = (ImageButton) root.findViewById(R.id.tnmeSearchButton);
        booksButton = (ImageButton) root.findViewById(R.id.tnmeBooksButton);
        menuButton = (ImageButton) root.findViewById(R.id.tnmeMenuButton);
        titleView = (TextView) root.findViewById(R.id.tnmeTitleView);
        subtitleView = (TextView) root.findViewById(R.id.tnmeSubtitleView);

        backButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (actions != null) {
                        actions.onBack();
                    } else {
                        activity.finish();
                    }
                }
            });

        searchButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (actions != null) {
                        actions.onSearch();
                    } else {
                        openSearch();
                    }
                }
            });

        booksButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (actions != null) {
                        actions.onBooks();
                    } else {
                        Intent intent = new Intent(activity, MainActivity.class);
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        activity.startActivity(intent);
                    }
                }
            });

        menuButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (actions != null) {
                        actions.onMenu();
                    } else {
                        openSettings();
                    }
                }
            });
    }

    static TnmeTopBar bind(Activity activity, View root, Actions actions) {
        return new TnmeTopBar(activity, root, actions);
    }

    void setTitle(String title) {
        titleView.setText(title != null ? title : "");
    }

    void setSubtitle(String subtitle) {
        if (subtitle == null || subtitle.trim().length() == 0) {
            subtitleView.setVisibility(View.GONE);
            return;
        }
        subtitleView.setText(subtitle);
        subtitleView.setVisibility(View.VISIBLE);
    }

    void setShowBooksButton(boolean show) {
        booksButton.setVisibility(show ? View.VISIBLE : View.GONE);
    }

    void setShowBackButton(boolean show) {
        backButton.setVisibility(show ? View.VISIBLE : View.GONE);
    }

    void setShowMenuButton(boolean show) {
        menuButton.setVisibility(show ? View.VISIBLE : View.GONE);
    }

    void openSearch() {
        activity.startActivity(new Intent(activity, SearchActivity.class));
    }

    void openSettings() {
        activity.startActivity(new Intent(activity, SettingsActivity.class));
    }

    static String editionSubtitle(Activity activity) {
        if (!BiblePrefs.hasJwpub(activity)) return "";
        try {
            JwpubReader reader = JwpubReader.open(BiblePrefs.getJwpubFile(activity), activity.getCacheDir());
            return reader.getEditionLabel();
        } catch (Exception e) {
            return "";
        }
    }
}
