package com.jcs.read;



import android.app.Activity;

import android.content.Intent;

import android.content.pm.PackageManager;

import android.graphics.PorterDuff;
import android.net.Uri;

import android.os.Build;

import android.os.Bundle;

import android.view.MenuItem;

import android.view.View;

import android.widget.AdapterView;

import android.widget.ImageButton;

import android.widget.ListView;

import android.widget.PopupMenu;

import android.widget.TextView;

import android.widget.Toast;



import java.io.File;

import java.util.ArrayList;

import java.util.List;



public class MainActivity extends Activity {

    private static final int REQUEST_FOLDER = 1001;

    private static final int REQUEST_STORAGE = 1002;

    private static final int REQUEST_ZIP = 1003;



    private ListView weekList;

    private TextView emptyView;

    private TextView folderView;

    private WeekListAdapter adapter;

    private List<JcsStorage.WeekEntry> weeks = new ArrayList<JcsStorage.WeekEntry>();



    @Override

    protected void onCreate(Bundle savedInstanceState) {

        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_main);



        weekList = (ListView) findViewById(R.id.weekList);

        emptyView = (TextView) findViewById(R.id.emptyView);

        folderView = (TextView) findViewById(R.id.folderView);

        ImageButton menuButton = (ImageButton) findViewById(R.id.menuButton);
        menuButton.setColorFilter(0xFFFFFFFF, PorterDuff.Mode.SRC_ATOP);



        adapter = new WeekListAdapter(this);

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



        menuButton.setOnClickListener(

            new View.OnClickListener() {

                @Override

                public void onClick(View v) {

                    showMainMenu(v);

                }

            });



        updateFolderLabel();

        requestStorageIfNeeded();

        reloadWeeks();

    }



    private void showMainMenu(View anchor) {

        PopupMenu menu = new PopupMenu(this, anchor);

        menu.getMenuInflater().inflate(R.menu.main_menu, menu.getMenu());

        menu.setOnMenuItemClickListener(

            new PopupMenu.OnMenuItemClickListener() {

                @Override

                public boolean onMenuItemClick(MenuItem item) {

                    int id = item.getItemId();

                    if (id == R.id.action_pick_zip) {

                        openZipPicker();

                        return true;

                    }

                    if (id == R.id.action_pick_folder) {

                        openFolderPicker();

                        return true;

                    }

                    if (id == R.id.action_reload) {

                        reloadWeeks();

                        return true;

                    }

                    return false;

                }

            });

        menu.show();

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

        adapter.setWeeks(weeks);



        boolean empty = weeks.isEmpty();

        emptyView.setVisibility(empty ? View.VISIBLE : View.GONE);

        weekList.setVisibility(empty ? View.GONE : View.VISIBLE);



        if (empty && !JcsPrefs.hasCustomRoot(this)) {

            Toast.makeText(this, R.string.pick_zip_hint, Toast.LENGTH_LONG).show();

        }

    }

}

