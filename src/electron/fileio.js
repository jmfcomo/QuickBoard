const { dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const appSettings = require('./config/appsettings.json');

let _app = null;
let lastUsedDir = null;
let settingsFile = null;

async function loadSettings() {
  try {
    const raw = await fs.readFile(settingsFile, 'utf-8');
    const data = JSON.parse(raw);
    if (data && typeof data.lastUsedDir === 'string') lastUsedDir = data.lastUsedDir;
  } catch (err) {}
}

async function saveSettings() {
  try {
    const data = { lastUsedDir };
    await fs.mkdir(path.dirname(settingsFile), { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {}
}

async function init(appInstance) {
  _app = appInstance;
  settingsFile = path.join(_app.getPath('userData'), 'settings.json');
  await loadSettings();
}

async function requestSaveFromRenderer(win) {
  const documentsDir = _app.getPath('documents');
  const baseDir = lastUsedDir || documentsDir;
  const defaultPath = path.join(baseDir, 'untitled.sbd');

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Board',
    defaultPath,
    filters: [{ name: 'QuickBoard', extensions: ['sbd'] }],
  });

  if (canceled || !filePath) return;

  try {
    lastUsedDir = path.dirname(filePath);
    await saveSettings();
  } catch {}

  win.webContents.send(appSettings.ipcChannels['request-save'], { filePath });
}

async function loadBoardIntoRenderer(win) {
  const documentsDir = _app.getPath('documents');
  const baseDir = lastUsedDir || documentsDir;

  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Load Board',
    defaultPath: baseDir,
    properties: ['openFile'],
    filters: [{ name: 'QuickBoard', extensions: ['sbd'] }],
  });

  if (canceled || !filePaths || filePaths.length === 0) return;

  const filePath = filePaths[0];

  try {
    const buffer = await fs.readFile(filePath);
    const content = buffer.toString('base64');

    try {
      lastUsedDir = path.dirname(filePath);
      await saveSettings();
    } catch {}

    win.webContents.send(appSettings.ipcChannels['load-board'], { filePath, content, isBinary: true });
  } catch (err) {
    console.error('Failed to load file:', err);
    const message = err && err.message ? err.message : String(err);
    try {
      dialog.showErrorBox('Load Failed', `Failed to load file:\n${message}`);
    } catch (e) {}
    try {
      win.webContents.send(appSettings.ipcChannels['load-result'], { filePath, success: false, message });
    } catch (e) {}
  }
}

function registerIpcHandlers() {
  ipcMain.on(appSettings.ipcChannels['save-data'], async (event, payload) => {
    if (!payload || !payload.filePath || typeof payload.data !== 'string') return;

    try {
      const dir = path.dirname(payload.filePath);
      if (dir) {
        lastUsedDir = dir;
        await saveSettings();
      }
    } catch {}

    try {
      await fs.writeFile(payload.filePath, payload.data, 'utf-8');
      try {
        event.sender.send(appSettings.ipcChannels['save-result'], { filePath: payload.filePath, success: true });
      } catch (e) {}
    } catch (err) {
      console.error('Failed to save file:', err);
      const message = err && err.message ? err.message : String(err);
      try {
        dialog.showErrorBox('Save Failed', `Failed to save file:\n${message}`);
      } catch (e) {}
      try {
        event.sender.send(appSettings.ipcChannels['save-result'], {
          filePath: payload.filePath,
          success: false,
          message,
        });
      } catch (e) {}
    }
  });

  ipcMain.on(appSettings.ipcChannels['save-binary'], async (event, payload) => {
    if (!payload || !payload.filePath || !(payload.data instanceof Uint8Array)) return;

    try {
      const dir = path.dirname(payload.filePath);
      if (dir) {
        lastUsedDir = dir;
        await saveSettings();
      }
    } catch {}

    try {
      await fs.writeFile(payload.filePath, Buffer.from(payload.data));
      try {
        event.sender.send(appSettings.ipcChannels['save-result'], { filePath: payload.filePath, success: true });
      } catch (e) {}
    } catch (err) {
      console.error('Failed to save binary file:', err);
      const message = err && err.message ? err.message : String(err);
      try {
        dialog.showErrorBox('Save Failed', `Failed to save file:\n${message}`);
      } catch (e) {}
      try {
        event.sender.send(appSettings.ipcChannels['save-result'], {
          filePath: payload.filePath,
          success: false,
          message,
        });
      } catch (e) {}
    }
  });
}

async function loadBoardFromPath(win, filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    const content = buffer.toString('base64');

    try {
      lastUsedDir = path.dirname(filePath);
      await saveSettings();
    } catch {}

    win.webContents.send(appSettings.ipcChannels['load-data'], { filePath, content, isBinary: true });
  } catch (err) {
    console.error('Failed to load file from path:', err);
    const message = err && err.message ? err.message : String(err);
    try {
      dialog.showErrorBox('Load Failed', `Failed to load file:\n${message}`);
    } catch (e) {}
  }
}

module.exports = {
  init,
  requestSaveFromRenderer,
  loadBoardIntoRenderer,
  loadBoardFromPath,
  registerIpcHandlers,
};
