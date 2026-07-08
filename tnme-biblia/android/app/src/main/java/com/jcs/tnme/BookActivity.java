package com.jcs.tnme;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class BookActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_book);

        final int bookNumber = getIntent().getIntExtra("bookNumber", 0);
        final String bookTitle = getIntent().getStringExtra("bookTitle");
        final int chapterCount = getIntent().getIntExtra("chapterCount", 0);

        TnmeTopBar topBar =
            TnmeTopBar.bind(
                this,
                findViewById(R.id.tnmeTopBar),
                new TnmeTopBar.Actions() {
                    @Override
                    public void onBack() {
                        finish();
                    }

                    @Override
                    public void onSearch() {
                        startActivity(new Intent(BookActivity.this, SearchActivity.class));
                    }

                    @Override
                    public void onBooks() {
                        Intent intent = new Intent(BookActivity.this, MainActivity.class);
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        startActivity(intent);
                    }

                    @Override
                    public void onMenu() {
                        startActivity(new Intent(BookActivity.this, SettingsActivity.class));
                    }
                });
        topBar.setTitle(bookTitle != null ? bookTitle : getString(R.string.app_name));
        topBar.setSubtitle(TnmeTopBar.editionSubtitle(this));
        topBar.setShowBooksButton(true);
        topBar.setShowMenuButton(true);

        LinearLayout container = (LinearLayout) findViewById(R.id.chapterContainer);
        LinearLayout content = TnmeUi.centeredContentRoot(this);
        LinearLayout column = TnmeUi.getContentColumn(content);
        container.addView(content);

        if (column == null) return;

        int columns = TnmeUi.gridColumns(this);
        LinearLayout row = null;
        int columnIndex = 0;
        for (int chapter = 1; chapter <= chapterCount; chapter++) {
            if (columnIndex == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                column.addView(row);
            }

            final int chapterNumber = chapter;
            int tileColor = getResources().getColor(R.color.tnme_chapter_bg);
            Button tile = TnmeUi.gridTile(this, String.valueOf(chapterNumber), tileColor);
            LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            params.setMargins(1, 1, 1, 1);
            tile.setLayoutParams(params);

            tile.setOnClickListener(
                new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        Intent intent = new Intent(BookActivity.this, ChapterActivity.class);
                        intent.putExtra("bookNumber", bookNumber);
                        intent.putExtra("bookTitle", bookTitle);
                        intent.putExtra("chapterCount", chapterCount);
                        intent.putExtra("chapterNumber", chapterNumber);
                        startActivity(intent);
                    }
                });

            row.addView(tile);
            columnIndex++;
            if (columnIndex >= columns) {
                columnIndex = 0;
            }
        }

        if (row != null && columnIndex > 0 && columnIndex < columns) {
            while (columnIndex < columns) {
                View spacer = new View(this);
                spacer.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1f));
                row.addView(spacer);
                columnIndex++;
            }
        }
    }
}
