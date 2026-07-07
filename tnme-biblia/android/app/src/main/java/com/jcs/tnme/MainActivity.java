package com.jcs.tnme;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
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
    private static final int REQUEST_JWPUB = 2001;
    private static final int REQUEST_STORAGE = 2002;
    private static final int GRID_COLUMNS = 6;

    private TextView statusView;
    private TextView emptyView;
    private ScrollView bookScroll;
    private LinearLayout bookContainer;
    private List<JwpubReader.BookInfo> books = new ArrayList<JwpubReader.BookInfo>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        statusView = (TextView) findViewById(R.id.statusView);
        emptyView = (TextView) findViewById(R.id.emptyView);
        bookScroll = (ScrollView) findViewById(R.id.bookScroll);
        bookContainer = (LinearLayout) findViewById(R.id.bookContainer);
        Button pickButton = (Button) findViewById(R.id.pickJwpubButton);

        pickButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    pickJwpubFile();
                }
            });

        requestStorageIfNeeded();
        handleIncomingIntent(getIntent());
        refresh();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_JWPUB && resultCode == RESULT_OK && data != null) {
            Uri uri = data.getData();
            if (uri != null) {
                File copied = JwpubFileHelper.copyToAppStorage(this, uri);
                if (copied != null) {
                    BiblePrefs.setJwpubPath(this, copied);
                    Toast.makeText(this, R.string.jwpub_selected, Toast.LENGTH_SHORT).show();
                    refresh();
                } else {
                    Toast.makeText(this, R.string.jwpub_copy_failed, Toast.LENGTH_LONG).show();
                }
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQUEST_STORAGE && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            refresh();
        }
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
            target.verseStart = intent.getIntExtra("verseStart", 1);
            target.verseEnd = intent.getIntExtra("verseEnd", target.verseStart);
        }
        if (target != null && target.bookNumber > 0 && target.chapterNumber > 0) {
            Intent chapter = BibleLinkParser.toChapterIntent(this, target);
            chapter.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(chapter);
        }
    }

    private void pickJwpubFile() {
        requestStorageIfNeeded();
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("*/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(Intent.createChooser(intent, getString(R.string.pick_jwpub)), REQUEST_JWPUB);
    }

    private void requestStorageIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            if (checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[] {android.Manifest.permission.READ_EXTERNAL_STORAGE}, REQUEST_STORAGE);
            }
        }
    }

    private void refresh() {
        if (!BiblePrefs.hasJwpub(this)) {
            statusView.setText(R.string.jwpub_missing);
            emptyView.setVisibility(View.VISIBLE);
            bookScroll.setVisibility(View.GONE);
            bookContainer.removeAllViews();
            return;
        }

        final File jwpub = BiblePrefs.getJwpubFile(this);
        statusView.setText(getString(R.string.jwpub_current, jwpub.getName()));

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
                                        statusView.setText(
                                            getString(
                                                R.string.jwpub_ready,
                                                jwpub.getName(),
                                                reader.getEditionLabel()));
                                    }
                                });
                        } catch (final Exception e) {
                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        statusView.setText(R.string.jwpub_open_failed);
                                        emptyView.setVisibility(View.VISIBLE);
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

        List<JwpubReader.BookInfo> hebrew = new ArrayList<JwpubReader.BookInfo>();
        List<JwpubReader.BookInfo> greek = new ArrayList<JwpubReader.BookInfo>();
        for (JwpubReader.BookInfo book : books) {
            if (book.bookNumber <= 39) {
                hebrew.add(book);
            } else {
                greek.add(book);
            }
        }

        addBookSection(getString(R.string.section_hebrew), hebrew);
        addBookSection(getString(R.string.section_greek), greek);
    }

    private void addBookSection(String title, List<JwpubReader.BookInfo> sectionBooks) {
        TextView header = new TextView(this);
        header.setText(title);
        header.setTextColor(Color.WHITE);
        header.setTextSize(11f);
        header.setPadding(4, 16, 4, 8);
        bookContainer.addView(header);

        LinearLayout row = null;
        int column = 0;
        for (int i = 0; i < sectionBooks.size(); i++) {
            if (column == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setLayoutParams(
                    new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
                bookContainer.addView(row);
            }

            final JwpubReader.BookInfo book = sectionBooks.get(i);
            Button tile = new Button(this);
            tile.setText(BookAbbrev.forBook(book.bookNumber, book.title));
            tile.setTextColor(Color.WHITE);
            tile.setTextSize(13f);
            tile.setAllCaps(false);
            tile.setBackgroundColor(i % 2 == 0 ? getResources().getColor(R.color.tnme_tile_a) : getResources().getColor(R.color.tnme_tile_b));
            tile.setPadding(0, 24, 0, 24);
            tile.setGravity(Gravity.CENTER);

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
            if (column >= GRID_COLUMNS) {
                column = 0;
            }
        }

        if (row != null && column > 0 && column < GRID_COLUMNS) {
            while (column < GRID_COLUMNS) {
                View spacer = new View(this);
                spacer.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1f));
                row.addView(spacer);
                column++;
            }
        }
    }
}
