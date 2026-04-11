const { dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let _app = null;
let lastUsedDir = null;
let settingsFile = null;
let currentFilePath = null;

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

function getAppSettingsPath() {
  return path.resolve(_app.getAppPath(), './src/electron/config/appsettings.json');
}

async function saveAppSettingsFile(settings) {
  const appSettingsFilePath = getAppSettingsPath();
  const json = JSON.stringify(settings, null, 2);
  await fs.writeFile(appSettingsFilePath, json, 'utf-8');
}

async function init(appInstance) {
  _app = appInstance;
  settingsFile = path.join(_app.getPath('userData'), 'settings.json');
  await loadSettings();
}

async function requestSaveFromRenderer(win) {
  if (currentFilePath) {
    win.webContents.send('quickboard:request-save', { filePath: currentFilePath });
    return;
  }
  return await requestSaveAsFromRenderer(win);
}

async function requestSaveAsFromRenderer(win) {
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

  win.webContents.send('quickboard:request-save', { filePath });
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

  const filePath = path.resolve(filePaths[0]);

  try {
    const buffer = await fs.readFile(filePath);
    const content = buffer.toString('base64');

    try {
      lastUsedDir = path.dirname(filePath);
      currentFilePath = filePath;
      await saveSettings();
    } catch {}

    win.webContents.send('quickboard:load-data', { filePath, content, isBinary: true });
  } catch (err) {
    console.error('Failed to load file:', err);
    const message = err && err.message ? err.message : String(err);
    try {
      dialog.showErrorBox('Load Failed', `Failed to load file:\n${message}`);
    } catch (e) {}
    try {
      win.webContents.send('quickboard:load-result', { filePath, success: false, message });
    } catch (e) {}
  }
}

function registerIpcHandlers() {
  ipcMain.on('quickboard:save-data', async (event, payload) => {
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
      currentFilePath = payload.filePath;
      try {
        event.sender.send('quickboard:save-result', { filePath: payload.filePath, success: true });
      } catch (e) {}
    } catch (err) {
      console.error('Failed to save file:', err);
      const message = err && err.message ? err.message : String(err);
      try {
        dialog.showErrorBox('Save Failed', `Failed to save file:\n${message}`);
      } catch (e) {}
      try {
        event.sender.send('quickboard:save-result', {
          filePath: payload.filePath,
          success: false,
          message,
        });
      } catch (e) {}
    }
  });

  ipcMain.on('quickboard:save-binary', async (event, payload) => {
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
      currentFilePath = payload.filePath;
      try {
        event.sender.send('quickboard:save-result', { filePath: payload.filePath, success: true });
      } catch (e) {}
    } catch (err) {
      console.error('Failed to save binary file:', err);
      const message = err && err.message ? err.message : String(err);
      try {
        dialog.showErrorBox('Save Failed', `Failed to save file:\n${message}`);
      } catch (e) {}
      try {
        event.sender.send('quickboard:save-result', {
          filePath: payload.filePath,
          success: false,
          message,
        });
      } catch (e) {}
    }
  });

  ipcMain.handle('quickboard:save-app-settings', async (_event, payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { success: false, message: 'Invalid app settings payload' };
    }

    try {
      await saveAppSettingsFile(payload);
      return { success: true };
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.error('Failed to save app settings:', err);
      return { success: false, message };
    }
  });
}

async function loadBoardFromPath(win, filePath) {
  try {
    const resolvedPath = path.resolve(filePath);
    const buffer = await fs.readFile(resolvedPath);
    const content = buffer.toString('base64');

    try {
      lastUsedDir = path.dirname(resolvedPath);
      currentFilePath = resolvedPath;
      await saveSettings();
    } catch {}

    win.webContents.send('quickboard:load-data', {
      filePath: resolvedPath,
      content,
      isBinary: true,
    });
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
  requestSaveAsFromRenderer,
  loadBoardIntoRenderer,
  loadBoardFromPath,
  registerIpcHandlers,
};
