package com.jcs.tnme;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private TextView emptyView;
    private ScrollView bookScroll;
    private LinearLayout bookContainer;
    private TnmeTopBar topBar;
    private List<JwpubReader.BookInfo> books = new ArrayList<JwpubReader.BookInfo>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        emptyView = (TextView) findViewById(R.id.emptyView);
        bookScroll = (ScrollView) findViewById(R.id.bookScroll);
        bookContainer = (LinearLayout) findViewById(R.id.bookContainer);

        topBar =
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
                        startActivity(new Intent(MainActivity.this, SearchActivity.class));
                    }

                    @Override
                    public void onBooks() {
                        // already on books
                    }

                    @Override
                    public void onMenu() {
                        startActivity(new Intent(MainActivity.this, SettingsActivity.class));
                    }
                });
        topBar.setTitle(getString(R.string.app_name));
        topBar.setShowBooksButton(false);
        topBar.setShowBackButton(false);
        topBar.setShowMenuButton(true);

        handleIncomingIntent(getIntent());
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        BibleLinkParser.Target target = null;
        if (intent.getData() != null) {
            target = BibleLinkParser.parse(intent.getData().toString());
        }
        if (target == null && intent.hasExtra("bookNumber")) {
            target = new BibleLinkParser.Target();
            target.bookNumber = intent.getIntExtra("bookNumber", 0);
            target.chapterNumber = intent.getIntExtra("chapterNumber", 0);
            if (intent.hasExtra("verseStart")) {
                target.verseStart = intent.getIntExtra("verseStart", 0);
                target.verseEnd =
                    intent.hasExtra("verseEnd") ? intent.getIntExtra("verseEnd", target.verseStart) : target.verseStart;
            } else {
                target.verseStart = 0;
                target.verseEnd = 0;
            }
        }
        if (target != null && target.bookNumber > 0 && target.chapterNumber > 0) {
            Intent chapter = BibleLinkParser.toChapterIntent(this, target);
            chapter.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(chapter);
        }
    }

    private void refresh() {
        if (!BiblePrefs.hasJwpub(this)) {
            emptyView.setVisibility(View.VISIBLE);
            bookScroll.setVisibility(View.GONE);
            bookContainer.removeAllViews();
            topBar.setSubtitle("");
            return;
        }

        final File jwpub = BiblePrefs.getJwpubFile(this);

        new Thread(
                new Runnable() {
                    @Override
                    public void run() {
                        try {
                            final JwpubReader reader = JwpubReader.open(jwpub, getCacheDir());
                            final List<JwpubReader.BookInfo> loaded = reader.listBooks();
                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        books = loaded;
                                        renderBookGrid();
                                        emptyView.setVisibility(View.GONE);
                                        bookScroll.setVisibility(View.VISIBLE);
                                        topBar.setSubtitle(reader.getEditionLabel());
                                    }
                                });
                        } catch (final Exception e) {
                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        emptyView.setVisibility(View.VISIBLE);
                                        emptyView.setText(R.string.jwpub_open_failed);
                                        bookScroll.setVisibility(View.GONE);
                                        Toast.makeText(MainActivity.this, e.getMessage(), Toast.LENGTH_LONG).show();
                                    }
                                });
                        }
                    }
                })
            .start();
    }

    private void renderBookGrid() {
        bookContainer.removeAllViews();

        LinearLayout content = TnmeUi.centeredContentRoot(this);
        LinearLayout column = TnmeUi.getContentColumn(content);
        bookContainer.addView(content);

        List<JwpubReader.BookInfo> hebrew = new ArrayList<JwpubReader.BookInfo>();
        List<JwpubReader.BookInfo> greek = new ArrayList<JwpubReader.BookInfo>();
        for (JwpubReader.BookInfo book : books) {
            if (book.bookNumber <= 39) {
                hebrew.add(book);
            } else {
                greek.add(book);
            }
        }

        if (column != null) {
            addBookSection(column, getString(R.string.section_hebrew), hebrew);
            addBookSection(column, getString(R.string.section_greek), greek);
        }
    }

    private void addBookSection(LinearLayout container, String title, List<JwpubReader.BookInfo> sectionBooks) {
        container.addView(TnmeUi.sectionHeader(this, title));

        int columns = TnmeUi.gridColumns(this);
        LinearLayout row = null;
        int column = 0;
        for (int i = 0; i < sectionBooks.size(); i++) {
            if (column == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setLayoutParams(
                    new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
                container.addView(row);
            }

            final JwpubReader.BookInfo book = sectionBooks.get(i);
            int tileColor = getResources().getColor(BibleBookSections.tileColorRes(book.bookNumber));
            Button tile = TnmeUi.gridTile(this, BookAbbrev.forBook(book.bookNumber, book.title), tileColor);
            LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            params.setMargins(1, 1, 1, 1);
            tile.setLayoutParams(params);

            tile.setOnClickListener(
                new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        Intent intent = new Intent(MainActivity.this, BookActivity.class);
                        intent.putExtra("bookNumber", book.bookNumber);
                        intent.putExtra("bookTitle", book.title);
                        intent.putExtra("chapterCount", book.chapterCount);
                        startActivity(intent);
                    }
                });

            row.addView(tile);
            column++;
            if (column >= columns) {
                column = 0;
            }
        }

        if (row != null && column > 0 && column < columns) {
            while (column < columns) {
                View spacer = new View(this);
                spacer.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1f));
                row.addView(spacer);
                column++;
            }
        }
    }
}
