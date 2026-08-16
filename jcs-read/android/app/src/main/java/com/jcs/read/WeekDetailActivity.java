package com.jcs.read;



import android.app.Activity;

import android.content.Intent;

import android.graphics.PorterDuff;
import android.os.Bundle;

import android.view.View;

import android.widget.AdapterView;

import android.widget.ImageButton;

import android.widget.ListView;

import android.widget.TextView;



import java.util.ArrayList;

import java.util.List;



public class WeekDetailActivity extends Activity {

    private List<JcsStorage.DocumentEntry> documents = new ArrayList<JcsStorage.DocumentEntry>();

    private String folder;
    private String pkg = JcsPackage.MEETINGS;
    private WeekDetailListAdapter adapter;



    @Override

    protected void onCreate(Bundle savedInstanceState) {

        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_week_detail);



        folder = getIntent().getStringExtra("folder");
        pkg = getIntent().getStringExtra("pkg");
        if (pkg == null) pkg = JcsPackage.MEETINGS;

        String label = getIntent().getStringExtra("label");

        String bibleReading = getIntent().getStringExtra("bibleReading");



        TextView weekTitle = (TextView) findViewById(R.id.weekTitle);

        TextView weekMeta = (TextView) findViewById(R.id.weekMeta);

        ListView documentList = (ListView) findViewById(R.id.documentList);

        TextView emptyView = (TextView) findViewById(R.id.emptyView);

        ImageButton backButton = (ImageButton) findViewById(R.id.backButton);
        backButton.setColorFilter(0xFFFFFFFF, PorterDuff.Mode.SRC_ATOP);



        weekTitle.setText(label != null ? label : getString(R.string.week_detail_title));

        if (bibleReading != null && bibleReading.length() > 0) {

            weekMeta.setText(bibleReading);

            weekMeta.setVisibility(View.VISIBLE);

        } else {

            weekMeta.setVisibility(View.GONE);

        }



        backButton.setOnClickListener(

            new View.OnClickListener() {

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

            JcsStorage.WeekDetail detail = JcsStorage.loadWeekDetail(this, entry, pkg);

            documents = detail.documents;

            if (detail.label != null && detail.label.length() > 0) {

                weekTitle.setText(detail.label);

            }

            if (detail.bibleReading != null && detail.bibleReading.length() > 0) {

                weekMeta.setText(detail.bibleReading);

                weekMeta.setVisibility(View.VISIBLE);

            }

        } catch (Exception e) {

            documents = new ArrayList<JcsStorage.DocumentEntry>();

        }



        adapter = new WeekDetailListAdapter(this);
        adapter.setPackage(pkg);

        adapter.setDocuments(documents, label, bibleReading);

        documentList.setAdapter(adapter);



        boolean empty = documents.isEmpty();

        emptyView.setVisibility(empty ? View.VISIBLE : View.GONE);

        documentList.setVisibility(empty ? View.GONE : View.VISIBLE);



        documentList.setOnItemClickListener(

            new AdapterView.OnItemClickListener() {

                @Override

                public void onItemClick(AdapterView<?> parent, View view, int position, long id) {

                    JcsStorage.DocumentEntry doc = adapter.getDocumentAt(position);

                    if (doc == null) return;

                    Intent intent = new Intent(WeekDetailActivity.this, ReadActivity.class);

                    intent.putExtra("title", doc.title);

                    intent.putExtra("weekFolder", folder);

                    intent.putExtra("htmlFile", doc.file);
                    intent.putExtra("pkg", pkg);

                    startActivity(intent);

                }

            });

    }

}

