package com.quickboard.filesaver;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;

@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    @PluginMethod
    public void saveFile(PluginCall call) {
        String base64Data = call.getString("data");
        String fileName = call.getString("fileName", "file.sbd");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (base64Data == null) {
            call.reject("No data provided");
            return;
        }

        // ACTION_CREATE_DOCUMENT opens the system file picker so the user can
        // choose the folder and confirm the filename before saving.
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);

        startActivityForResult(call, intent, "handleFileCreated");
    }

    @ActivityCallback
    private void handleFileCreated(PluginCall call, com.getcapacitor.ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            // User dismissed the picker — treat as a silent cancel, not an error.
            call.reject("cancelled");
            return;
        }

        Intent data = result.getData();
        if (data == null || data.getData() == null) {
            call.reject("No URI returned from file picker");
            return;
        }

        Uri uri = data.getData();
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
}
