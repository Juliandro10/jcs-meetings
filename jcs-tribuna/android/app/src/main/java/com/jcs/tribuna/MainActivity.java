package com.jcs.tribuna;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
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

    private static final int TAB_MEETINGS = 0;
    private static final int TAB_PREACHING = 1;
    private static final int TAB_TALKS = 2;
    private static final int TAB_DOCS = 3;

    private ListView weekList;
    private TextView emptyView;
    private TextView folderView;
    private TextView titleView;
    private TextView subtitleView;
    private View weekNav;
    private TextView weekNavLabel;
    private TextView weekPrev;
    private TextView weekNext;
    private Button tabMeetings;
    private Button tabPreaching;
    private Button tabTalks;
    private Button tabDocs;

    private WeekListAdapter weekAdapter;
    private WeekDetailListAdapter documentAdapter;

    private int currentTab = TAB_TALKS;
    private List<JcsStorage.WeekEntry> meetingWeeks = new ArrayList<JcsStorage.WeekEntry>();
    private List<JcsStorage.WeekEntry> preachingWeeks = new ArrayList<JcsStorage.WeekEntry>();
    private JcsStorage.WeekEntry outlinesWeek;
    private JcsStorage.WeekEntry importedWeek;
    private int meetingIndex = -1;
    private String activeFolder = "";
    private String activePkg = JcsPackage.MEETINGS;
    private boolean showingDocuments;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        weekList = (ListView) findViewById(R.id.weekList);
        emptyView = (TextView) findViewById(R.id.emptyView);
        folderView = (TextView) findViewById(R.id.folderView);
        titleView = (TextView) findViewById(R.id.title);
        subtitleView = (TextView) findViewById(R.id.subtitle);
        weekNav = findViewById(R.id.weekNav);
        weekNavLabel = (TextView) findViewById(R.id.weekNavLabel);
        weekPrev = (TextView) findViewById(R.id.weekPrev);
        weekNext = (TextView) findViewById(R.id.weekNext);
        tabMeetings = (Button) findViewById(R.id.tabMeetings);
        tabPreaching = (Button) findViewById(R.id.tabPreaching);
        tabTalks = (Button) findViewById(R.id.tabTalks);
        tabDocs = (Button) findViewById(R.id.tabDocs);
        tabMeetings.setVisibility(View.GONE);
        tabPreaching.setVisibility(View.GONE);
        ImageButton menuButton = (ImageButton) findViewById(R.id.menuButton);
        menuButton.setColorFilter(0xFFFFFFFF, PorterDuff.Mode.SRC_ATOP);

        weekAdapter = new WeekListAdapter(this);
        documentAdapter = new WeekDetailListAdapter(this);
        documentAdapter.setClickListener(
            new WeekDetailListAdapter.DocumentClickListener() {
                @Override
                public void onOpenDocument(JcsStorage.DocumentEntry document) {
                    openDocument(document);
                }

                @Override
                public void onDeleteDocument(JcsStorage.DocumentEntry document) {
                    confirmDeleteDocument(document);
                }
            });
        weekList.setAdapter(weekAdapter);

        weekList.setOnItemClickListener(
            new AdapterView.OnItemClickListener() {
                @Override
                public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                    if (showingDocuments) {
                        JcsStorage.DocumentEntry doc = documentAdapter.getDocumentAt(position);
                        if (doc == null) return;
                        Intent intent = new Intent(MainActivity.this, TribunaActivity.class);
                        intent.putExtra("title", doc.title);
                        intent.putExtra("weekFolder", activeFolder);
                        intent.putExtra("htmlFile", doc.file);
                        intent.putExtra("pkg", activePkg);
                        startActivity(intent);
                        return;
                    }
                    if (position < 0 || position >= preachingWeeks.size()) return;
                    JcsStorage.WeekEntry entry = preachingWeeks.get(position);
                    Intent intent = new Intent(MainActivity.this, WeekDetailActivity.class);
                    intent.putExtra("folder", entry.folder);
                    intent.putExtra("label", entry.label);
                    intent.putExtra("bibleReading", entry.bibleReading);
                    intent.putExtra("pkg", JcsPackage.PREACHING);
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

        tabMeetings.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { selectTab(TAB_MEETINGS); }
        });
        tabPreaching.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { selectTab(TAB_PREACHING); }
        });
        tabTalks.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { selectTab(TAB_TALKS); }
        });
        tabDocs.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { selectTab(TAB_DOCS); }
        });
        weekPrev.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { shiftMeetingWeek(-1); }
        });
        weekNext.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { shiftMeetingWeek(1); }
        });

        updateFolderLabel();
        requestStorageIfNeeded();
        reloadCatalog();
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
                    if (id == R.id.action_bible_settings) {
                        startActivity(new Intent(MainActivity.this, TribunaSettingsActivity.class));
                        return true;
                    }
                    if (id == R.id.action_reload) {
                        reloadCatalog();
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
        reloadCatalog();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FOLDER && resultCode == RESULT_OK) {
            updateFolderLabel();
            reloadCatalog();
            return;
        }
        if (requestCode == REQUEST_ZIP && resultCode == RESULT_OK && data != null) {
            Uri uri = data.getData();
            if (uri != null) {
                ZipPickerHelper.retainReadPermission(this, data);
                int result = JcsZipHelper.importZip(this, uri);
                if (result == JcsZipHelper.IMPORT_OK) {
                    Toast.makeText(this, R.string.zip_import_ok, Toast.LENGTH_SHORT).show();
                    updateFolderLabel();
                    reloadCatalog();
                } else if (result == JcsZipHelper.IMPORT_NOT_ZIP) {
                    Toast.makeText(this, R.string.zip_import_not_zip, Toast.LENGTH_LONG).show();
                } else if (result == JcsZipHelper.IMPORT_INVALID_PACKAGE) {
                    Toast.makeText(this, R.string.zip_import_invalid, Toast.LENGTH_LONG).show();
                } else if (result == JcsZipHelper.IMPORT_COPY_FAILED) {
                    Toast.makeText(this, R.string.zip_import_copy_failed, Toast.LENGTH_LONG).show();
                } else {
                    Toast.makeText(this, R.string.zip_import_failed, Toast.LENGTH_LONG).show();
                }
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQUEST_STORAGE
            && grantResults.length > 0
            && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            reloadCatalog();
        }
    }

    private void requestStorageIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            if (checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(
                    new String[] {
                        android.Manifest.permission.READ_EXTERNAL_STORAGE,
                        android.Manifest.permission.WRITE_EXTERNAL_STORAGE
                    },
                    REQUEST_STORAGE);
            }
        }
    }

    private void openFolderPicker() {
        requestStorageIfNeeded();
        startActivityForResult(new Intent(this, FolderBrowserActivity.class), REQUEST_FOLDER);
    }

    private void openZipPicker() {
        requestStorageIfNeeded();
        ZipPickerHelper.open(this, REQUEST_ZIP);
    }

    private void updateFolderLabel() {
        folderView.setText(getString(R.string.storage_current, JcsPrefs.getRootLabel(this)));
    }

    private void selectTab(int tab) {
        if (tab == currentTab) return;
        currentTab = tab;
        showCurrentTab();
    }

    private void shiftMeetingWeek(int delta) {
        if (meetingWeeks.isEmpty()) return;
        int next = meetingIndex + delta;
        if (next < 0 || next >= meetingWeeks.size()) return;
        meetingIndex = next;
        showCurrentTab();
    }

    private void reloadCatalog() {
        String keepWeekId = null;
        if (meetingIndex >= 0 && meetingIndex < meetingWeeks.size()) {
            keepWeekId = meetingWeeks.get(meetingIndex).weekId;
        }

        List<JcsStorage.WeekEntry> catalog = JcsStorage.loadWeeks(this, JcsPackage.MEETINGS);
        outlinesWeek = JcsWeekKind.findOutlines(catalog);
        importedWeek = JcsWeekKind.findImported(catalog);
        meetingWeeks = JcsWeekKind.meetingWeeks(catalog);
        preachingWeeks = JcsStorage.loadWeeks(this, JcsPackage.PREACHING);

        int restored = JcsWeekKind.indexOfWeek(meetingWeeks, keepWeekId);
        meetingIndex = restored >= 0 ? restored : JcsWeekKind.indexOfCurrentWeek(meetingWeeks);
        showCurrentTab();
    }

    private void showCurrentTab() {
        updateTabUi();
        if (currentTab == TAB_PREACHING) {
            showPreachingWeeks();
            return;
        }
        if (currentTab == TAB_TALKS) {
            showSpecialWeek(outlinesWeek, true, R.string.empty_talks);
            return;
        }
        if (currentTab == TAB_DOCS) {
            showSpecialWeek(importedWeek, true, R.string.empty_imported_docs);
            return;
        }
        showMeetingWeek();
    }

    private void updateTabUi() {
        styleTab(tabMeetings, currentTab == TAB_MEETINGS);
        styleTab(tabPreaching, currentTab == TAB_PREACHING);
        styleTab(tabTalks, currentTab == TAB_TALKS);
        styleTab(tabDocs, currentTab == TAB_DOCS);

        if (currentTab == TAB_PREACHING) {
            titleView.setText(R.string.preaching_title);
            subtitleView.setText(R.string.preaching_subtitle);
        } else if (currentTab == TAB_TALKS) {
            titleView.setText(R.string.talks_title_full);
            subtitleView.setText(R.string.tribuna_subtitle);
        } else if (currentTab == TAB_DOCS) {
            titleView.setText(R.string.docs_title);
            subtitleView.setText(R.string.docs_subtitle);
        } else {
            titleView.setText(R.string.meetings_title);
            subtitleView.setText(R.string.meetings_subtitle);
        }
    }

    private void styleTab(Button tab, boolean selected) {
        tab.setBackgroundResource(selected ? R.drawable.tab_selected : R.drawable.tab_unselected);
        tab.setTextColor(getResources().getColor(selected ? R.color.jcs_white : R.color.jcs_muted));
    }

    private void showPreachingWeeks() {
        weekNav.setVisibility(View.GONE);
        showingDocuments = false;
        activePkg = JcsPackage.PREACHING;
        weekList.setAdapter(weekAdapter);
        weekAdapter.setWeeks(preachingWeeks);
        boolean empty = preachingWeeks.isEmpty();
        emptyView.setText(R.string.empty_preaching_weeks);
        emptyView.setVisibility(empty ? View.VISIBLE : View.GONE);
        weekList.setVisibility(empty ? View.GONE : View.VISIBLE);
        if (empty && !JcsPrefs.hasCustomRoot(this)) {
            Toast.makeText(this, R.string.pick_zip_hint, Toast.LENGTH_LONG).show();
        }
    }

    private void showMeetingWeek() {
        if (meetingWeeks.isEmpty() || meetingIndex < 0 || meetingIndex >= meetingWeeks.size()) {
            weekNav.setVisibility(View.GONE);
            showEmpty(R.string.empty_weeks);
            if (!JcsPrefs.hasCustomRoot(this)) {
                Toast.makeText(this, R.string.pick_zip_hint, Toast.LENGTH_LONG).show();
            }
            return;
        }
        JcsStorage.WeekEntry week = meetingWeeks.get(meetingIndex);
        weekNav.setVisibility(View.VISIBLE);
        weekNavLabel.setText(JcsWeekKind.navLabel(week, getString(R.string.this_week)));
        setNavEnabled(weekPrev, meetingIndex > 0);
        setNavEnabled(weekNext, meetingIndex < meetingWeeks.size() - 1);
        showWeekDocuments(week, JcsPackage.MEETINGS, false, R.string.empty_documents);
    }

    private void showSpecialWeek(JcsStorage.WeekEntry week, boolean hideHeaders, int emptyRes) {
        weekNav.setVisibility(View.GONE);
        if (week == null) {
            showEmpty(emptyRes);
            return;
        }
        showWeekDocuments(week, JcsPackage.MEETINGS, hideHeaders, emptyRes);
    }

    private void showWeekDocuments(
        JcsStorage.WeekEntry week, String pkg, boolean hideHeaders, int emptyRes) {
        showingDocuments = true;
        activePkg = pkg;
        activeFolder = week.folder != null ? week.folder : "";
        weekList.setAdapter(documentAdapter);
        documentAdapter.setPackage(pkg);
        documentAdapter.setHideSectionHeaders(hideHeaders);
        documentAdapter.setShowDelete(currentTab == TAB_DOCS);

        List<JcsStorage.DocumentEntry> documents = new ArrayList<JcsStorage.DocumentEntry>();
        String label = week.label;
        String bibleReading = week.bibleReading;
        try {
            JcsStorage.WeekDetail detail = JcsStorage.loadWeekDetail(this, week, pkg);
            if (detail.documents != null) documents = detail.documents;
            if (detail.folder != null && detail.folder.length() > 0) activeFolder = detail.folder;
            if (detail.label != null && detail.label.length() > 0) label = detail.label;
            if (detail.bibleReading != null && detail.bibleReading.length() > 0) {
                bibleReading = detail.bibleReading;
            }
        } catch (Exception ignored) {
            documents = new ArrayList<JcsStorage.DocumentEntry>();
        }

        documentAdapter.setDocuments(documents, label, bibleReading);
        boolean empty = documents.isEmpty();
        emptyView.setText(emptyRes);
        emptyView.setVisibility(empty ? View.VISIBLE : View.GONE);
        weekList.setVisibility(empty ? View.GONE : View.VISIBLE);
    }

    private void showEmpty(int emptyRes) {
        showingDocuments = currentTab != TAB_PREACHING;
        emptyView.setText(emptyRes);
        emptyView.setVisibility(View.VISIBLE);
        weekList.setVisibility(View.GONE);
        if (showingDocuments) {
            documentAdapter.setDocuments(
                new ArrayList<JcsStorage.DocumentEntry>(), "", "");
        } else {
            weekAdapter.setWeeks(new ArrayList<JcsStorage.WeekEntry>());
        }
    }

    private void openDocument(JcsStorage.DocumentEntry doc) {
        if (doc == null) return;
        Intent intent = new Intent(MainActivity.this, TribunaActivity.class);
        intent.putExtra("title", doc.title);
        intent.putExtra("weekFolder", activeFolder);
        intent.putExtra("htmlFile", doc.file);
        intent.putExtra("pkg", activePkg);
        startActivity(intent);
    }

    private void confirmDeleteDocument(final JcsStorage.DocumentEntry document) {
        if (document == null || currentTab != TAB_DOCS) return;
        String title = document.title != null && document.title.length() > 0
            ? document.title
            : getString(R.string.delete_document_title);
        new AlertDialog.Builder(this)
            .setTitle(R.string.delete_document_title)
            .setMessage(getString(R.string.delete_document_message, title))
            .setPositiveButton(
                R.string.delete_document_confirm,
                new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        deleteImportedDocument(document);
                    }
                })
            .setNegativeButton(R.string.delete_document_cancel, null)
            .show();
    }

    private void deleteImportedDocument(final JcsStorage.DocumentEntry document) {
        final String folder = activeFolder;
        final String pkg = activePkg;
        final String fileName = document.file;
        new Thread(
            new Runnable() {
                @Override
                public void run() {
                    final boolean ok = JcsStorage.deleteWeekDocument(MainActivity.this, folder, fileName, pkg);
                    runOnUiThread(
                        new Runnable() {
                            @Override
                            public void run() {
                                if (isFinishing()) return;
                                if (ok) {
                                    Toast.makeText(
                                            MainActivity.this, R.string.delete_document_ok, Toast.LENGTH_SHORT)
                                        .show();
                                    reloadCatalog();
                                } else {
                                    Toast.makeText(
                                            MainActivity.this,
                                            R.string.delete_document_failed,
                                            Toast.LENGTH_LONG)
                                        .show();
                                }
                            }
                        });
                }
            })
            .start();
    }

    private void setNavEnabled(TextView control, boolean enabled) {
        control.setEnabled(enabled);
        control.setClickable(enabled);
        control.setAlpha(enabled ? 1f : 0.35f);
    }
}
