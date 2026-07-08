package com.jcs.tnme.cantico;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final int TAB_NUMBER = 0;
    private static final int TAB_TITLE = 1;

    private TextView emptyView;
    private View contentRoot;
    private TextView publicationTitle;
    private Button tabNumber;
    private Button tabTitle;
    private ScrollView numberScroll;
    private LinearLayout numberGridContainer;
    private ListView titleList;
    private TnmeTopBar topBar;
    private final List<JwpubReader.SongInfo> songs = new ArrayList<JwpubReader.SongInfo>();
    private ArrayAdapter<SongRow> titleAdapter;
    private int activeTab = TAB_NUMBER;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        emptyView = (TextView) findViewById(R.id.emptyView);
        contentRoot = findViewById(R.id.contentRoot);
        publicationTitle = (TextView) findViewById(R.id.publicationTitle);
        tabNumber = (Button) findViewById(R.id.tabNumber);
        tabTitle = (Button) findViewById(R.id.tabTitle);
        numberScroll = (ScrollView) findViewById(R.id.numberScroll);
        numberGridContainer = (LinearLayout) findViewById(R.id.numberGridContainer);
        titleList = (ListView) findViewById(R.id.titleList);

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
                        selectTab(TAB_NUMBER);
                    }

                    @Override
                    public void onMenu() {
                        startActivity(new Intent(MainActivity.this, SettingsActivity.class));
                    }
                });
        topBar.setTitle(getString(R.string.publication_short));
        topBar.setShowBooksButton(false);
        topBar.setShowBackButton(false);
        topBar.setShowMenuButton(true);

        titleAdapter =
            new ArrayAdapter<SongRow>(this, android.R.layout.simple_list_item_1, android.R.id.text1, new ArrayList<SongRow>()) {
                @Override
                public View getView(int position, View convertView, android.view.ViewGroup parent) {
                    View view = super.getView(position, convertView, parent);
                    SongRow row = getItem(position);
                    TextView line1 = (TextView) view.findViewById(android.R.id.text1);
                    line1.setTextColor(getResources().getColor(R.color.tnme_text));
                    line1.setTextSize(16f);
                    line1.setPadding(TnmeUi.dp(MainActivity.this, 16), TnmeUi.dp(MainActivity.this, 14), TnmeUi.dp(MainActivity.this, 16), TnmeUi.dp(MainActivity.this, 14));
                    if (row != null) {
                        line1.setText(row.titleLine);
                    }
                    return view;
                }
            };
        titleList.setAdapter(titleAdapter);
        titleList.setOnItemClickListener(
            new AdapterView.OnItemClickListener() {
                @Override
                public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                    SongRow row = titleAdapter.getItem(position);
                    openSong(row);
                }
            });

        tabNumber.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    selectTab(TAB_NUMBER);
                }
            });
        tabTitle.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    selectTab(TAB_TITLE);
                }
            });

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
        SongLinkParser.Target target = SongLinkParser.parseIntent(intent);
        if (target == null && intent.getData() != null) {
            target = SongLinkParser.parse(intent.getData().toString());
        }
        if (target == null) return;

        Intent songIntent = SongLinkParser.toSongIntent(this, target);
        songIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(songIntent);
    }

    private void selectTab(int tab) {
        activeTab = tab;
        boolean numberTab = tab == TAB_NUMBER;
        styleTab(tabNumber, numberTab);
        styleTab(tabTitle, !numberTab);
        numberScroll.setVisibility(numberTab ? View.VISIBLE : View.GONE);
        titleList.setVisibility(numberTab ? View.GONE : View.VISIBLE);
    }

    private void styleTab(Button button, boolean active) {
        button.setTextColor(getResources().getColor(active ? R.color.tnme_purple_bright : R.color.tnme_muted));
        button.setBackgroundColor(getResources().getColor(active ? R.color.tnme_purple_dark : android.R.color.transparent));
    }

    private void refresh() {
        if (!BiblePrefs.hasJwpub(this)) {
            emptyView.setVisibility(View.VISIBLE);
            contentRoot.setVisibility(View.GONE);
            titleAdapter.clear();
            numberGridContainer.removeAllViews();
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
                            final List<JwpubReader.SongInfo> loaded = reader.listSongs();
                            final String edition = reader.getEditionLabel();
                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        songs.clear();
                                        songs.addAll(loaded);
                                        publicationTitle.setText(edition);
                                        renderViews();
                                        emptyView.setVisibility(View.GONE);
                                        contentRoot.setVisibility(View.VISIBLE);
                                        topBar.setSubtitle(getString(R.string.language_label));
                                        selectTab(activeTab);
                                    }
                                });
                        } catch (final Exception e) {
                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        emptyView.setVisibility(View.VISIBLE);
                                        emptyView.setText(R.string.jwpub_open_failed);
                                        contentRoot.setVisibility(View.GONE);
                                        Toast.makeText(MainActivity.this, e.getMessage(), Toast.LENGTH_LONG).show();
                                    }
                                });
                        }
                    }
                })
            .start();
    }

    private void renderViews() {
        renderNumberGrid();
        titleAdapter.clear();
        for (JwpubReader.SongInfo song : songs) {
            titleAdapter.add(SongRow.from(song));
        }
        titleAdapter.notifyDataSetChanged();
    }

    private void renderNumberGrid() {
        numberGridContainer.removeAllViews();

        LinearLayout content = TnmeUi.centeredContentRoot(this);
        LinearLayout column = TnmeUi.getContentColumn(content);
        numberGridContainer.addView(content);
        if (column == null) return;

        int columns = TnmeUi.songGridColumns(this);
        LinearLayout row = null;
        int columnIndex = 0;

        for (int i = 0; i < songs.size(); i++) {
            if (columnIndex == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setLayoutParams(
                    new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
                column.addView(row);
            }

            final JwpubReader.SongInfo song = songs.get(i);
            final String label = song.songNumber > 0 ? String.valueOf(song.songNumber) : "?";
            Button tile = TnmeUi.songNumberTile(this, label);
            LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            int gap = TnmeUi.dp(this, 2);
            params.setMargins(gap, gap, gap, gap);
            tile.setLayoutParams(params);
            tile.setOnClickListener(
                new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        openSong(SongRow.from(song));
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
                LinearLayout.LayoutParams params =
                    new LinearLayout.LayoutParams(0, 1, 1f);
                int gap = TnmeUi.dp(this, 2);
                params.setMargins(gap, gap, gap, gap);
                spacer.setLayoutParams(params);
                row.addView(spacer);
                columnIndex++;
            }
        }
    }

    private void openSong(SongRow row) {
        if (row == null) return;
        Intent intent = new Intent(this, SongActivity.class);
        intent.putExtra("documentId", row.documentId);
        intent.putExtra("songNumber", row.songNumber);
        intent.putExtra("songTitle", row.songTitle);
        startActivity(intent);
    }

    private static final class SongRow {
        int documentId;
        int songNumber;
        String songTitle;
        String titleLine;

        static SongRow from(JwpubReader.SongInfo song) {
            SongRow row = new SongRow();
            row.documentId = song.documentId;
            row.songNumber = song.songNumber;
            row.songTitle = song.title;
            if (song.songNumber > 0) {
                row.titleLine = song.songNumber + ". " + song.title;
            } else {
                row.titleLine = song.title;
            }
            return row;
        }
    }
}
