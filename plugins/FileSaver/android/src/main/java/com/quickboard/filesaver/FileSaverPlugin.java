package com.quickboard.filesaver;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    private ActivityResultLauncher<Intent> createDocumentLauncher;
    private PluginCall pendingSaveCall;

    @Override
    public void load() {
        createDocumentLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            (ActivityResult result) -> {
                PluginCall call = pendingSaveCall;
                pendingSaveCall = null;
                if (call == null) return;

                if (result.getResultCode() == Activity.RESULT_CANCELED) {
                    call.reject("cancelled");
                    return;
                }

                Intent data = result.getData();
                if (data == null || data.getData() == null) {
                    call.reject("No URI returned from file picker");
                    return;
                }

                writeToUri(call, data.getData());
            }
        );
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String base64Data = call.getString("data");
        String fileName = call.getString("fileName", "file.sbd");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (base64Data == null) {
            call.reject("No data provided");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);

        pendingSaveCall = call;
        createDocumentLauncher.launch(intent);
    }

    private void writeToUri(PluginCall call, Uri uri) {
        String base64Data = call.getString("data");
        if (base64Data == null) {
            call.reject("No data in call");
            return;
        }
        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            OutputStream outputStream = getContext().getContentResolver().openOutputStream(uri);
            if (outputStream == null) {
                call.reject("Could not open output stream for the chosen file");
                return;
            }
            try {
                outputStream.write(bytes);
                outputStream.flush();
            } finally {
                outputStream.close();
            }
            call.resolve();
        } catch (IOException e) {
            call.reject("Failed to write file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getOpenFileData(PluginCall call) {
        Intent intent = getActivity().getIntent();
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) {
            call.resolve();
            return;
        }

        try {
            byte[] bytes = readUri(intent.getData());
            String fileName = getFileName(intent.getData());
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

            getActivity().setIntent(new Intent());

            JSObject result = new JSObject();
            result.put("data", base64);
            result.put("fileName", fileName);
            call.resolve(result);
        } catch (IOException e) {
            call.reject("Failed to read file: " + e.getMessage());
        }
    }

    @Override
    public void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null) return;

        try {
            byte[] bytes = readUri(uri);
            String fileName = getFileName(uri);
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

            JSObject event = new JSObject();
            event.put("data", base64);
            event.put("fileName", fileName);
            notifyListeners("fileOpened", event);
        } catch (IOException e) {
            android.util.Log.e("FileSaver", "handleOnNewIntent: failed to read file", e);
        }
    }

    private byte[] readUri(Uri uri) throws IOException {
        InputStream is = getContext().getContentResolver().openInputStream(uri);
        if (is == null) throw new IOException("Cannot open input stream for URI: " + uri);
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = is.read(chunk)) != -1) {
            buffer.write(chunk, 0, n);
        }
        is.close();
        return buffer.toByteArray();
    }

    private String getFileName(Uri uri) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) {
                try {
                    int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0 && cursor.moveToFirst()) {
                        name = cursor.getString(idx);
                    }
                } finally {
                    cursor.close();
                }
            }
        }
        if (name == null) name = uri.getLastPathSegment();
        return name != null ? name : "project.sbd";
    }
}