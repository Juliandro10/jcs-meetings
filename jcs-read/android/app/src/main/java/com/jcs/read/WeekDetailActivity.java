package com.jcs.read;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ImageButton;
import android.widget.ListView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

public class WeekDetailActivity extends Activity {
    private JcsStorage.WeekDetail detail;
    private List<JcsStorage.DocumentEntry> documents = new ArrayList<JcsStorage.DocumentEntry>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_week_detail);

        String folder = getIntent().getStringExtra("folder");
        String label = getIntent().getStringExtra("label");
        String bibleReading = getIntent().getStringExtra("bibleReading");

        TextView weekTitle = (TextView) findViewById(R.id.weekTitle);
        TextView weekMeta = (TextView) findViewById(R.id.weekMeta);
        ListView documentList = (ListView) findViewById(R.id.documentList);
        TextView emptyView = (TextView) findViewById(R.id.emptyView);
        ImageButton backButton = (ImageButton) findViewById(R.id.backButton);

        weekTitle.setText(label != null ? label : "Semana");
        weekMeta.setText(bibleReading != null ? bibleReading : "");

        backButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });

        JcsStorage.WeekEntry entry = new JcsStorage.WeekEntry();
        entry.folder = folder;
        entry.label = label;
        entry.bibleReading = bibleReading;

        try {
            detail = JcsStorage.loadWeekDetail(this, entry);
            documents = detail.documents;
        } catch (Exception e) {
            documents = new ArrayList<JcsStorage.DocumentEntry>();
        }

        final ArrayAdapter<String> adapter = new ArrayAdapter<String>(
            this,
            android.R.layout.simple_list_item_1,
            new ArrayList<String>()
        );
        documentList.setAdapter(adapter);

        List<String> titles = new ArrayList<String>();
        for (JcsStorage.DocumentEntry doc : documents) {
            titles.add(doc.title);
        }
        adapter.clear();
        adapter.addAll(titles);

        boolean empty = documents.isEmpty();
        emptyView.setVisibility(empty ? View.VISIBLE : View.GONE);
        documentList.setVisibility(empty ? View.GONE : View.VISIBLE);

        documentList.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                JcsStorage.DocumentEntry doc = documents.get(position);
                Intent intent = new Intent(WeekDetailActivity.this, ReadActivity.class);
                intent.putExtra("title", doc.title);
                intent.putExtra("weekFolder", folder);
                intent.putExtra("htmlFile", doc.file);
                startActivity(intent);
            }
        });
    }
}
