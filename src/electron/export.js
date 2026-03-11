const { dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let _app = null;

function init(appInstance) {
  _app = appInstance;
}

async function exportPngSequence(win) {
  const documentsDir = _app.getPath('documents');

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Select Export Folder',
    defaultPath: documentsDir,
    properties: ['openDirectory', 'createDirectory'],
  });

  if (canceled || !filePaths || filePaths.length === 0) return;

  const dirPath = filePaths[0];
  win.webContents.send('quickboard:request-png-export', { dirPath });
}

function registerIpcHandlers() {
  ipcMain.on('quickboard:png-export-data', async (event, payload) => {
    if (!payload || typeof payload.dirPath !== 'string' || !Array.isArray(payload.frames)) return;

    try {
      await fs.mkdir(payload.dirPath, { recursive: true });
      const total = payload.frames.length;
      for (let i = 0; i < total; i++) {
        const frame = payload.frames[i];
        if (!frame.name || !frame.dataUrl) continue;
        const base64Data = frame.dataUrl.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filePath = path.join(payload.dirPath, frame.name);
        await fs.writeFile(filePath, buffer);
        try {
          event.sender.send('quickboard:png-export-progress', {
            current: i + 1,
            total,
            fileName: frame.name,
          });
        } catch (e) {}
      }
      try {
        event.sender.send('quickboard:png-export-result', {
          success: true,
          count: total,
        });
      } catch (e) {}
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      try {
        dialog.showErrorBox('Export Failed', `Failed to export PNG sequence:\n${message}`);
      } catch (e) {}
      try {
        event.sender.send('quickboard:png-export-result', { success: false, message });
      } catch (e) {}
    }
  });
}

module.exports = { init, exportPngSequence, registerIpcHandlers };
