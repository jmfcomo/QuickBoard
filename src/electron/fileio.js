const { app, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');

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
  const defaultPath = path.join(baseDir, 'untitled.json');

  const saveOptions = {
    title: 'Save Board',
    defaultPath,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  };

  let saveResult;
  try {
    saveResult = await dialog.showSaveDialog(win, saveOptions);
  } catch (err) {
    saveResult = await dialog.showSaveDialog(saveOptions);
  }

  if ((!saveResult || !saveResult.filePath) && process.platform !== 'darwin') {
    try {
      saveResult = await dialog.showSaveDialog(saveOptions);
    } catch (err) {}
  }

  const { canceled, filePath } = saveResult || {};

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

  const openOptions = {
    title: 'Load Board',
    defaultPath: baseDir,
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  };

  let openResult;
  try {
    openResult = await dialog.showOpenDialog(win, openOptions);
  } catch (err) {
    openResult = await dialog.showOpenDialog(openOptions);
  }

  if (
    (!openResult || !openResult.filePaths || openResult.filePaths.length === 0) &&
    process.platform !== 'darwin'
  ) {
    try {
      openResult = await dialog.showOpenDialog(openOptions);
    } catch (err) {}
  }

  const { canceled, filePaths } = openResult || {};

  if (canceled || !filePaths || filePaths.length === 0) return;

  const filePath = filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');

  try {
    lastUsedDir = path.dirname(filePath);
    await saveSettings();
  } catch {}

  win.webContents.send('quickboard:load-data', { filePath, content });
}

function registerIpcHandlers() {
  ipcMain.on('quickboard:save-data', async (_event, payload) => {
    if (!payload || !payload.filePath || typeof payload.data !== 'string') return;

    try {
      const dir = path.dirname(payload.filePath);
      if (dir) {
        lastUsedDir = dir;
        await saveSettings();
      }
    } catch {}

    await fs.writeFile(payload.filePath, payload.data, 'utf-8');
  });
}

module.exports = {
  init,
  requestSaveFromRenderer,
  loadBoardIntoRenderer,
  registerIpcHandlers,
};
