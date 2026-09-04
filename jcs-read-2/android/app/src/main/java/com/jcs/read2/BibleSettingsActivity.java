package com.jcs.read2;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import com.jcs.read2.bible.BiblePrefs;
import com.jcs.read2.bible.JwpubFileHelper;

import java.io.File;

public class BibleSettingsActivity extends Activity {
    private static final int REQUEST_JWPUB = 4001;

    private TextView statusView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_bible_settings);

        statusView = (TextView) findViewById(R.id.settingsStatus);
        Button pickButton = (Button) findViewById(R.id.settingsPickButton);
        pickButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    pickJwpubFile();
                }
            });
        refreshStatus();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_JWPUB || resultCode != RESULT_OK || data == null) return;
        Uri uri = data.getData();
        if (uri == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            try {
                getContentResolver()
                    .takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) {
            }
        }
        File copied = JwpubFileHelper.copyToAppStorage(this, uri);
        if (copied != null) {
            BiblePrefs.setJwpubPath(this, copied);
            Toast.makeText(this, R.string.bible_jwpub_ok, Toast.LENGTH_SHORT).show();
        } else {
            Toast.makeText(this, R.string.bible_jwpub_failed, Toast.LENGTH_LONG).show();
        }
        refreshStatus();
    }

    private void pickJwpubFile() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        try {
            startActivityForResult(
                Intent.createChooser(intent, getString(R.string.bible_pick_jwpub)), REQUEST_JWPUB);
        } catch (Exception e) {
            Toast.makeText(this, R.string.bible_jwpub_failed, Toast.LENGTH_LONG).show();
        }
    }

    private void refreshStatus() {
        File file = BiblePrefs.getJwpubFile(this);
        if (file != null && file.exists()) {
            statusView.setText(getString(R.string.bible_jwpub_status, file.getName()));
        } else {
            statusView.setText(R.string.bible_jwpub_none);
        }
    }
}
