package com.jcs.tnme;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class BookActivity extends Activity {
    private static final int GRID_COLUMNS = 6;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_book);

        final int bookNumber = getIntent().getIntExtra("bookNumber", 0);
        final String bookTitle = getIntent().getStringExtra("bookTitle");
        final int chapterCount = getIntent().getIntExtra("chapterCount", 0);

        setTitle(bookTitle != null ? bookTitle : getString(R.string.app_name));

        LinearLayout container = (LinearLayout) findViewById(R.id.chapterContainer);

        TextView hint = new TextView(this);
        hint.setText(getString(R.string.pick_chapter));
        hint.setTextColor(getResources().getColor(R.color.tnme_muted));
        hint.setTextSize(14f);
        hint.setPadding(0, 0, 0, 12);
        container.addView(hint);

        LinearLayout row = null;
        int column = 0;
        for (int chapter = 1; chapter <= chapterCount; chapter++) {
            if (column == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                container.addView(row);
            }

            final int chapterNumber = chapter;
            Button tile = new Button(this);
            tile.setText(String.valueOf(chapterNumber));
            tile.setTextColor(Color.WHITE);
            tile.setTextSize(15f);
            tile.setAllCaps(false);
            tile.setBackgroundColor(
                chapter % 2 == 0
                    ? getResources().getColor(R.color.tnme_chapter_bg_alt)
                    : getResources().getColor(R.color.tnme_chapter_bg));
            tile.setPadding(0, 20, 0, 20);
            tile.setGravity(Gravity.CENTER);

            LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            params.setMargins(2, 2, 2, 2);
            tile.setLayoutParams(params);

            tile.setOnClickListener(
                new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        Intent intent = new Intent(BookActivity.this, ChapterActivity.class);
                        intent.putExtra("bookNumber", bookNumber);
                        intent.putExtra("chapterNumber", chapterNumber);
                        intent.putExtra("verseStart", 1);
                        intent.putExtra("verseEnd", 1);
                        startActivity(intent);
                    }
                });

            row.addView(tile);
            column++;
            if (column >= GRID_COLUMNS) {
                column = 0;
            }
        }
    }
}
