package com.jcs.read;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class FolderBrowserActivity extends Activity {
    public static final int REQUEST_TREE = 2001;

    private TextView pathView;
    private ListView folderList;
    private ArrayAdapter<String> adapter;
    private File currentDir;
    private final List<File> listedDirs = new ArrayList<File>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_folder_browser);

        pathView = (TextView) findViewById(R.id.pathView);
        folderList = (ListView) findViewById(R.id.folderList);
        Button upButton = (Button) findViewById(R.id.upButton);
        Button selectButton = (Button) findViewById(R.id.selectButton);
        Button systemPickerButton = (Button) findViewById(R.id.systemPickerButton);

        adapter = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, new ArrayList<String>());
        folderList.setAdapter(adapter);

        File start = JcsPrefs.getFileRoot(this);
        if (!start.isDirectory()) {
            start = Environment.getExternalStorageDirectory();
        }
        openDirectory(start);

        folderList.setOnItemClickListener(
            new AdapterView.OnItemClickListener() {
                @Override
                public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                    File next = listedDirs.get(position);
                    openDirectory(next);
                }
            });

        upButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    File parent = currentDir.getParentFile();
                    if (parent != null) openDirectory(parent);
                }
            });

        selectButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    selectCurrentFolder();
                }
            });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            systemPickerButton.setVisibility(View.VISIBLE);
            systemPickerButton.setOnClickListener(
                new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        openSystemTreePicker();
                    }
                });
        } else {
            systemPickerButton.setVisibility(View.GONE);
        }
    }

    private void openDirectory(File dir) {
        currentDir = dir;
        pathView.setText(dir.getAbsolutePath());
        listedDirs.clear();
        List<String> labels = new ArrayList<String>();

        File[] children = dir.listFiles();
        if (children != null) {
            List<File> dirs = new ArrayList<File>();
            for (File child : children) {
                if (child.isDirectory() && !child.getName().startsWith(".")) {
                    dirs.add(child);
                }
            }
            Collections.sort(
                dirs,
                new Comparator<File>() {
                    @Override
                    public int compare(File a, File b) {
                        return a.getName().compareToIgnoreCase(b.getName());
                    }
                });
            for (File child : dirs) {
                listedDirs.add(child);
                String marker = JcsRootAccess.looksLikeJcsFolder(child) ? " ✓ JCS" : "";
                labels.add(child.getName() + marker);
            }
        }

        adapter.clear();
        adapter.addAll(labels);
        adapter.notifyDataSetChanged();

        boolean valid = JcsRootAccess.looksLikeJcsFolder(currentDir);
        findViewById(R.id.selectButton).setEnabled(valid);
    }

    private void selectCurrentFolder() {
        if (!JcsRootAccess.looksLikeJcsFolder(currentDir)) {
            Toast.makeText(this, R.string.invalid_jcs_folder, Toast.LENGTH_LONG).show();
            return;
        }
        JcsPrefs.setFileRoot(this, currentDir);
        Toast.makeText(this, R.string.folder_selected, Toast.LENGTH_SHORT).show();
        setResult(RESULT_OK);
        finish();
    }

    private void openSystemTreePicker() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(intent, REQUEST_TREE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_TREE || resultCode != RESULT_OK || data == null) return;

        Uri treeUri = data.getData();
        if (treeUri == null) return;

        final int takeFlags =
            data.getFlags()
                & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            getContentResolver().takePersistableUriPermission(treeUri, takeFlags);
        } catch (Exception ignored) {
            // some providers may not support persistable permission
        }

        JcsPrefs.setTreeRoot(this, treeUri);
        Toast.makeText(this, R.string.folder_selected, Toast.LENGTH_SHORT).show();
        setResult(RESULT_OK);
        finish();
    }
}
