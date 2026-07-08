package com.jcs.tnme.cantico;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class SearchActivity extends Activity {
    private EditText searchInput;
    private TextView searchStatus;
    private ProgressBar searchProgress;
    private ListView searchResults;
    private final List<SearchRow> rows = new ArrayList<SearchRow>();
    private ArrayAdapter<SearchRow> adapter;
    private volatile boolean searching;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_search);

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
                        runSearch();
                    }

                    @Override
                    public void onBooks() {
                        Intent intent = new Intent(SearchActivity.this, MainActivity.class);
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        startActivity(intent);
                    }

                    @Override
                    public void onMenu() {
                        startActivity(new Intent(SearchActivity.this, SettingsActivity.class));
                    }
                });
        topBar.setTitle(getString(R.string.search));
        topBar.setSubtitle(TnmeTopBar.editionSubtitle(this));
        topBar.setShowBooksButton(true);
        topBar.setShowMenuButton(true);

        searchInput = (EditText) findViewById(R.id.searchInput);
        searchStatus = (TextView) findViewById(R.id.searchStatus);
        searchProgress = (ProgressBar) findViewById(R.id.searchProgress);
        searchResults = (ListView) findViewById(R.id.searchResults);
        Button searchButton = (Button) findViewById(R.id.searchButton);

        adapter =
            new ArrayAdapter<SearchRow>(this, android.R.layout.simple_list_item_2, android.R.id.text1, rows) {
                @Override
                public View getView(int position, View convertView, android.view.ViewGroup parent) {
                    View view = super.getView(position, convertView, parent);
                    SearchRow row = rows.get(position);
                    TextView line1 = (TextView) view.findViewById(android.R.id.text1);
                    TextView line2 = (TextView) view.findViewById(android.R.id.text2);
                    line1.setTextColor(getResources().getColor(R.color.tnme_text));
                    line2.setTextColor(getResources().getColor(R.color.tnme_muted));
                    line1.setText(row.title);
                    line2.setText(row.subtitle);
                    line2.setMaxLines(3);
                    return view;
                }
            };
        searchResults.setAdapter(adapter);

        searchButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    runSearch();
                }
            });

        searchInput.setOnEditorActionListener(
            new TextView.OnEditorActionListener() {
                @Override
                public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                    if (actionId == EditorInfo.IME_ACTION_SEARCH
                        || actionId == EditorInfo.IME_ACTION_DONE
                        || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                        runSearch();
                        return true;
                    }
                    return false;
                }
            });

        searchResults.setOnItemClickListener(
            new AdapterView.OnItemClickListener() {
                @Override
                public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                    openResult(rows.get(position));
                }
            });

        if (!BiblePrefs.hasJwpub(this)) {
            searchStatus.setText(R.string.jwpub_missing);
            searchInput.setEnabled(false);
            searchButton.setEnabled(false);
        }
    }

    private void runSearch() {
        if (searching || !BiblePrefs.hasJwpub(this)) return;

        final String query = searchInput.getText().toString().trim();
        if (query.length() < 1) {
            Toast.makeText(this, R.string.search_too_short, Toast.LENGTH_SHORT).show();
            return;
        }

        searching = true;
        searchProgress.setVisibility(View.VISIBLE);
        searchStatus.setText(R.string.search_running);
        rows.clear();
        adapter.notifyDataSetChanged();

        final File jwpub = BiblePrefs.getJwpubFile(this);
        new Thread(
                new Runnable() {
                    @Override
                    public void run() {
                        try {
                            final JwpubReader reader = JwpubReader.open(jwpub, getCacheDir());
                            final List<JwpubReader.SongInfo> songs = reader.listSongs();
                            final List<SearchRow> found = new ArrayList<SearchRow>();

                            SongNumberParser.Result numberHit = SongNumberParser.parse(query, songs);
                            if (numberHit != null) {
                                JwpubReader.SongInfo song = reader.findBySongNumber(numberHit.songNumber);
                                if (song != null) {
                                    found.add(SearchRow.fromSong(song, getString(R.string.search_number_hit)));
                                }
                            } else if (query.length() >= 2) {
                                List<JwpubReader.SearchHit> hits = reader.searchText(query, 40);
                                for (JwpubReader.SearchHit hit : hits) {
                                    found.add(SearchRow.fromHit(hit));
                                }
                            }

                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        searching = false;
                                        searchProgress.setVisibility(View.GONE);
                                        rows.addAll(found);
                                        adapter.notifyDataSetChanged();
                                        if (found.isEmpty()) {
                                            searchStatus.setText(R.string.search_empty);
                                        } else {
                                            searchStatus.setText(
                                                getString(R.string.search_results_count, found.size()));
                                        }
                                    }
                                });
                        } catch (final Exception e) {
                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        searching = false;
                                        searchProgress.setVisibility(View.GONE);
                                        searchStatus.setText(R.string.search_failed);
                                        Toast.makeText(SearchActivity.this, e.getMessage(), Toast.LENGTH_LONG)
                                            .show();
                                    }
                                });
                        }
                    }
                })
            .start();
    }

    private void openResult(SearchRow row) {
        Intent intent = new Intent(this, SongActivity.class);
        intent.putExtra("documentId", row.documentId);
        intent.putExtra("songNumber", row.songNumber);
        intent.putExtra("songTitle", row.songTitle);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        finish();
    }

    private static final class SearchRow {
        int documentId;
        int songNumber;
        String songTitle;
        String title;
        String subtitle;

        static SearchRow fromSong(JwpubReader.SongInfo song, String subtitle) {
            SearchRow row = new SearchRow();
            row.documentId = song.documentId;
            row.songNumber = song.songNumber;
            row.songTitle = song.title;
            row.title = song.songNumber > 0 ? ("Cântico " + song.songNumber) : song.title;
            row.subtitle = song.title;
            return row;
        }

        static SearchRow fromHit(JwpubReader.SearchHit hit) {
            SearchRow row = new SearchRow();
            row.documentId = hit.documentId;
            row.songNumber = hit.songNumber;
            row.songTitle = hit.title;
            row.title = hit.songNumber > 0 ? ("Cântico " + hit.songNumber + " · " + hit.title) : hit.title;
            row.subtitle = hit.snippet;
            return row;
        }
    }
}
