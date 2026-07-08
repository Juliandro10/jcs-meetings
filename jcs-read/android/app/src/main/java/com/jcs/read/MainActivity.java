package com.jcs.read;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

import java.io.File;

public class MainActivity extends Activity {
    private static final int REQUEST_FOLDER = 1001;
    private static final int REQUEST_STORAGE = 1002;
    private static final int REQUEST_ZIP = 1003;

    private ListView weekList;
    private TextView emptyView;
    private TextView folderView;
    private ArrayAdapter<String> adapter;
    private List<JcsStorage.WeekEntry> weeks = new ArrayList<JcsStorage.WeekEntry>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        weekList = (ListView) findViewById(R.id.weekList);
        emptyView = (TextView) findViewById(R.id.emptyView);
        folderView = (TextView) findViewById(R.id.folderView);
        Button reloadButton = (Button) findViewById(R.id.reloadButton);
        Button pickFolderButton = (Button) findViewById(R.id.pickFolderButton);
        Button pickZipButton = (Button) findViewById(R.id.pickZipButton);

        adapter = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, new ArrayList<String>());
        weekList.setAdapter(adapter);

        weekList.setOnItemClickListener(
            new AdapterView.OnItemClickListener() {
                @Override
                public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                    JcsStorage.WeekEntry entry = weeks.get(position);
                    Intent intent = new Intent(MainActivity.this, WeekDetailActivity.class);
                    intent.putExtra("folder", entry.folder);
                    intent.putExtra("label", entry.label);
                    intent.putExtra("bibleReading", entry.bibleReading);
                    startActivity(intent);
                }
            });

        reloadButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    reloadWeeks();
                }
            });

        pickFolderButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    openFolderPicker();
                }
            });

        pickZipButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    openZipPicker();
                }
            });

        updateFolderLabel();
        requestStorageIfNeeded();
        reloadWeeks();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateFolderLabel();
        reloadWeeks();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FOLDER && resultCode == RESULT_OK) {
            updateFolderLabel();
            reloadWeeks();
            return;
        }
        if (requestCode == REQUEST_ZIP && resultCode == RESULT_OK && data != null) {
            Uri uri = data.getData();
            if (uri != null) {
                File imported = JcsZipHelper.importZip(this, uri);
                if (imported != null) {
                    Toast.makeText(this, R.string.zip_import_ok, Toast.LENGTH_SHORT).show();
                    updateFolderLabel();
                    reloadWeeks();
                } else {
                    Toast.makeText(this, R.string.zip_import_failed, Toast.LENGTH_LONG).show();
                }
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQUEST_STORAGE && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            reloadWeeks();
        }
    }

    private void requestStorageIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            if (checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[] {android.Manifest.permission.READ_EXTERNAL_STORAGE}, REQUEST_STORAGE);
            }
        }
    }

    private void openFolderPicker() {
        requestStorageIfNeeded();
        startActivityForResult(new Intent(this, FolderBrowserActivity.class), REQUEST_FOLDER);
    }

    private void openZipPicker() {
        requestStorageIfNeeded();
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("application/zip");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        Intent chooser = Intent.createChooser(intent, getString(R.string.pick_zip_hint));
        try {
            startActivityForResult(chooser, REQUEST_ZIP);
        } catch (Exception e) {
            intent.setType("*/*");
            startActivityForResult(Intent.createChooser(intent, getString(R.string.pick_zip_hint)), REQUEST_ZIP);
        }
    }

    private void updateFolderLabel() {
        folderView.setText(getString(R.string.storage_current, JcsPrefs.getRootLabel(this)));
    }

    private void reloadWeeks() {
        weeks = JcsStorage.loadWeeks(this);
        List<String> labels = new ArrayList<String>();
        for (JcsStorage.WeekEntry entry : weeks) {
            String line = entry.label;
            if (entry.bibleReading != null && entry.bibleReading.length() > 0) {
                line = line + "\n" + entry.bibleReading;
            }
            labels.add(line);
        }
        adapter.clear();
        adapter.addAll(labels);
        adapter.notifyDataSetChanged();

        boolean empty = weeks.isEmpty();
        emptyView.setVisibility(empty ? View.VISIBLE : View.GONE);
        weekList.setVisibility(empty ? View.GONE : View.VISIBLE);

        if (empty && !JcsPrefs.hasCustomRoot(this)) {
            Toast.makeText(this, R.string.pick_zip_hint, Toast.LENGTH_LONG).show();
        }
    }
}
