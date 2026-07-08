package com.jcs.tnme;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;

public class SettingsActivity extends Activity {
    private static final int REQUEST_JWPUB = 3001;
    private static final int REQUEST_STORAGE = 3002;

    private TextView statusView;
    private TextView helpView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);

        statusView = (TextView) findViewById(R.id.settingsStatus);
        helpView = (TextView) findViewById(R.id.settingsHelp);
        Button pickButton = (Button) findViewById(R.id.settingsPickButton);

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
                        startActivity(new Intent(SettingsActivity.this, SearchActivity.class));
                    }

                    @Override
                    public void onBooks() {
                        Intent intent = new Intent(SettingsActivity.this, MainActivity.class);
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        startActivity(intent);
                    }

                    @Override
                    public void onMenu() {
                        // already here
                    }
                });
        topBar.setTitle(getString(R.string.settings_title));
        topBar.setSubtitle(TnmeTopBar.editionSubtitle(this));
        topBar.setShowBooksButton(false);
        topBar.setShowMenuButton(false);

        pickButton.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    pickJwpubFile();
                }
            });

        requestStorageIfNeeded();
        refreshStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_JWPUB && resultCode == RESULT_OK && data != null) {
            Uri uri = data.getData();
            if (uri != null) {
                File copied = JwpubFileHelper.copyToAppStorage(this, uri);
                if (copied != null) {
                    BiblePrefs.setJwpubPath(this, copied);
                    JwpubReader.close();
                    Toast.makeText(this, R.string.jwpub_selected, Toast.LENGTH_SHORT).show();
                    refreshStatus();
                } else {
                    Toast.makeText(this, R.string.jwpub_copy_failed, Toast.LENGTH_LONG).show();
                }
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQUEST_STORAGE) {
            refreshStatus();
        }
    }

    private void refreshStatus() {
        if (!BiblePrefs.hasJwpub(this)) {
            statusView.setText(R.string.jwpub_missing_short);
            helpView.setVisibility(View.VISIBLE);
            return;
        }

        helpView.setVisibility(View.GONE);
        final File jwpub = BiblePrefs.getJwpubFile(this);
        statusView.setText(getString(R.string.jwpub_current, jwpub.getName()));

        new Thread(
                new Runnable() {
                    @Override
                    public void run() {
                        try {
                            final JwpubReader reader = JwpubReader.open(jwpub, getCacheDir());
                            final String label = reader.getEditionLabel();
                            runOnUiThread(
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        statusView.setText(
                                            getString(R.string.jwpub_ready, jwpub.getName(), label));
                                    }
                                });
                        } catch (Exception ignored) {
                        }
                    }
                })
            .start();
    }

    private void pickJwpubFile() {
        requestStorageIfNeeded();
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("*/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(Intent.createChooser(intent, getString(R.string.pick_jwpub)), REQUEST_JWPUB);
    }

    private void requestStorageIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            if (checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(
                    new String[] {android.Manifest.permission.READ_EXTERNAL_STORAGE}, REQUEST_STORAGE);
            }
        }
    }
}
