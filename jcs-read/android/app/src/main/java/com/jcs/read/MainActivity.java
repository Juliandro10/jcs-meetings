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

import android.widget.Button;

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

    private TextView titleView;

    private TextView subtitleView;

    private Button tabMeetings;

    private Button tabPreaching;

    private WeekListAdapter adapter;

    private List<JcsStorage.WeekEntry> weeks = new ArrayList<JcsStorage.WeekEntry>();

    private String currentPackage = JcsPackage.MEETINGS;



    @Override

    protected void onCreate(Bundle savedInstanceState) {

        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_main);



        weekList = (ListView) findViewById(R.id.weekList);

        emptyView = (TextView) findViewById(R.id.emptyView);

        folderView = (TextView) findViewById(R.id.folderView);

        titleView = (TextView) findViewById(R.id.title);

        subtitleView = (TextView) findViewById(R.id.subtitle);

        tabMeetings = (Button) findViewById(R.id.tabMeetings);

        tabPreaching = (Button) findViewById(R.id.tabPreaching);

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

                    intent.putExtra("pkg", currentPackage);

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



        tabMeetings.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    selectPackage(JcsPackage.MEETINGS);
                }
            });

        tabPreaching.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    selectPackage(JcsPackage.PREACHING);
                }
            });



        updateFolderLabel();

        updateTabUi();

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



    private void selectPackage(String pkg) {
        if (pkg == null) pkg = JcsPackage.MEETINGS;
        if (pkg.equals(currentPackage)) return;
        currentPackage = pkg;
        updateTabUi();
        reloadWeeks();
    }

    private void updateTabUi() {
        boolean meetings = JcsPackage.MEETINGS.equals(currentPackage);
        tabMeetings.setBackgroundResource(meetings ? R.drawable.tab_selected : R.drawable.tab_unselected);
        tabPreaching.setBackgroundResource(meetings ? R.drawable.tab_unselected : R.drawable.tab_selected);
        tabMeetings.setTextColor(getResources().getColor(meetings ? R.color.jcs_white : R.color.jcs_muted));
        tabPreaching.setTextColor(getResources().getColor(meetings ? R.color.jcs_muted : R.color.jcs_white));

        if (meetings) {
            titleView.setText(R.string.meetings_title);
            subtitleView.setText(R.string.meetings_subtitle);
            emptyView.setText(R.string.empty_weeks);
        } else {
            titleView.setText(R.string.preaching_title);
            subtitleView.setText(R.string.preaching_subtitle);
            emptyView.setText(R.string.empty_preaching_weeks);
        }
    }



    private void reloadWeeks() {

        weeks = JcsStorage.loadWeeks(this, currentPackage);

        adapter.setWeeks(weeks);



        boolean empty = weeks.isEmpty();

        emptyView.setVisibility(empty ? View.VISIBLE : View.GONE);

        weekList.setVisibility(empty ? View.GONE : View.VISIBLE);



        if (empty && !JcsPrefs.hasCustomRoot(this)) {

            Toast.makeText(this, R.string.pick_zip_hint, Toast.LENGTH_LONG).show();

        }

    }

}

