const { BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let _app = null;

function init(appInstance) {
  _app = appInstance;
}

function isValidIpcBuffer(value) {
  return (
    Buffer.isBuffer(value) ||
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer
  );
}

function toBufferFromIpc(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  throw new TypeError('Invalid buffer type');
}

async function exportPngSequence(win) {
  const defaultDirPath = _app.getPath('documents');
  win.webContents.send('quickboard:request-png-export', { defaultDirPath });
}

async function exportVideoRequest(win) {
  const defaultDirPath = _app.getPath('documents');
  win.webContents.send('quickboard:request-video-export', { defaultDirPath });
}

function registerIpcHandlers() {
  ipcMain.handle('quickboard:save-video-file', async (_event, payload) => {
    if (!payload || typeof payload.dirPath !== 'string' || typeof payload.name !== 'string') {
      return { success: false, message: 'Invalid payload' };
    }
    const safeName = path.basename(payload.name);
    if (!safeName || safeName !== payload.name) {
      return { success: false, message: 'Invalid file name' };
    }
    if (!isValidIpcBuffer(payload.buffer)) {
      return { success: false, message: 'Invalid buffer' };
    }
    try {
      await fs.mkdir(payload.dirPath, { recursive: true });
      const filePath = path.join(payload.dirPath, safeName);
      const buffer = toBufferFromIpc(payload.buffer);
      await fs.writeFile(filePath, buffer);
      return { success: true };
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      return { success: false, message };
    }
  });

  ipcMain.handle('quickboard:pick-export-dir', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const documentsDir = _app.getPath('documents');
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select Export Folder',
      defaultPath: documentsDir,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePaths || filePaths.length === 0) return null;
    return filePaths[0];
  });

  ipcMain.handle('quickboard:png-export-frame', async (_event, payload) => {
    if (
      !payload ||
      typeof payload.dirPath !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.index !== 'number' ||
      typeof payload.total !== 'number'
    ) {
      return { success: false, message: 'Invalid payload' };
    }
    if (!isValidIpcBuffer(payload.buffer)) {
      return { success: false, message: 'Invalid buffer' };
    }
    // Prevent path traversal: accept only the basename
    const safeName = path.basename(payload.name);
    if (!safeName || safeName !== payload.name) {
      return { success: false, message: 'Invalid file name' };
    }
    try {
      await fs.mkdir(payload.dirPath, { recursive: true });
      const filePath = path.join(payload.dirPath, safeName);
      const buffer = toBufferFromIpc(payload.buffer);
      await fs.writeFile(filePath, buffer);
      return { success: true };
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      return { success: false, message };
    }
  });
}

module.exports = { init, exportPngSequence, exportVideoRequest, registerIpcHandlers };
