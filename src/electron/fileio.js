const { dialog, ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let _app = null;
let lastUsedDir = null;
let settingsFile = null;
let currentFilePath = null;
let appSettingsPath = null;

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
  // Save app settings to userData directory instead of src (which won't exist in packaged app)
  appSettingsPath = path.join(_app.getPath('userData'), 'appsettings.json');
  console.log(`[Settings] Using app settings path: ${appSettingsPath}`);
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
  ipcMain.on('quickboard:request-save-from-renderer', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) {
        return;
      }

      await requestSaveFromRenderer(win);
    } catch (err) {
      console.error('Failed to trigger save from renderer:', err);
    }
  });

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

  // App settings handlers
  ipcMain.handle('quickboard:get-app-settings', async (event) => {
    try {
      const settings = await loadAppSettings();
      if (settings) {
        return { success: true, data: settings };
      } else {
        return { success: false, message: 'Failed to load settings' };
      }
    } catch (err) {
      console.error('Error loading app settings:', err);
      return { success: false, message: err.message || 'Unknown error' };
    }
  });

  ipcMain.handle('quickboard:save-app-settings', async (event, settings) => {
    try {
      if (process.env.DEBUG) {
        console.log('[Settings] Saving:', JSON.stringify(settings, null, 2));
      }
      const saved = await saveAppSettings(settings);
      if (saved) {
        if (process.env.DEBUG) {
          console.log('[Settings] Successfully saved');
        }
        return { success: true };
      } else {
        console.error('[Settings] Failed to save');
        return { success: false, message: 'Failed to save settings' };
      }
    } catch (err) {
      console.error('[Settings] Error saving:', err);
      return { success: false, message: err.message || 'Unknown error' };
    }
  });

  ipcMain.handle('quickboard:update-app-setting', async (event, payload) => {
    if (!payload || typeof payload.path !== 'string') {
      console.warn('Invalid payload for update-app-setting:', payload);
      return { success: false, message: 'Invalid payload' };
    }

    try {
      console.log(`[Settings] Updating ${payload.path} to ${JSON.stringify(payload.value)}`);
      const settings = await loadAppSettings();
      if (!settings) {
        console.error('[Settings] Failed to load current settings');
        return { success: false, message: 'Failed to load settings' };
      }

      setNestedValue(settings, payload.path, payload.value);
      const saved = await saveAppSettings(settings);

      if (saved) {
        console.log(`[Settings] Successfully saved ${payload.path} to ${appSettingsPath}`);
        return { success: true };
      } else {
        console.error(`[Settings] Failed to write settings to ${appSettingsPath}`);
        return { success: false, message: 'Failed to save settings' };
      }
    } catch (err) {
      console.error('[Settings] Error updating app setting:', err);
      return { success: false, message: err.message || 'Unknown error' };
    }
  });

  ipcMain.handle('quickboard:restore-app-settings-defaults', async (event) => {
    try {
      const defaultsPath = path.join(
        _app.getAppPath(),
        'src',
        'electron',
        'config',
        'appsettings-defaults.json',
      );
      const defaultsRaw = await fs.readFile(defaultsPath, 'utf-8');
      const defaults = JSON.parse(defaultsRaw);

      // Load current settings and merge only the keys from defaults, but also
      // explicitly reset legacy root keys so stale values are not preserved.
      const current = await loadAppSettings();
      const restoredSettings = current ? { ...current, ...defaults } : { ...defaults };
      const legacyRootKeys = ['initialDir', 'autosave', 'autosaveDuration'];

      legacyRootKeys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(defaults, key)) {
          restoredSettings[key] = defaults[key];
        } else {
          delete restoredSettings[key];
        }
      });

      await saveAppSettings(restoredSettings);

      return { success: true };
    } catch (err) {
      console.error('Error restoring app settings:', err);
      return { success: false, message: err.message || 'Unknown error' };
    }
  });

  ipcMain.handle('quickboard:select-folder', async (event) => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Folder',
        properties: ['openDirectory'],
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return undefined;
      }

      return filePaths[0];
    } catch (err) {
      console.error('Error selecting folder:', err);
      return undefined;
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

// Helper function to safely get nested object value
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    current = current?.[key];
  }
  return current;
}

// Helper function to safely set nested object value
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

async function loadAppSettings() {
  try {
    const raw = await fs.readFile(appSettingsPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    // If file doesn't exist, try to initialize from bundled defaults
    console.log('[Settings] appsettings.json not found in userData, attempting to initialize...');
    try {
      const defaultPath = path.join(
        _app.getAppPath(),
        'src',
        'electron',
        'config',
        'appsettings-defaults.json',
      );
      const defaultRaw = await fs.readFile(defaultPath, 'utf-8');
      const defaults = JSON.parse(defaultRaw);
      // Write defaults to userData
      await saveAppSettings(defaults);
      console.log('[Settings] Initialized appsettings.json with defaults');
      return defaults;
    } catch (defaultErr) {
      console.error('[Settings] Failed to load app settings or defaults:', err, defaultErr);
      return null;
    }
  }
}

async function saveAppSettings(settings) {
  try {
    console.log(`[Settings] Writing to ${appSettingsPath}`);
    console.log(`[Settings] Content:`, JSON.stringify(settings, null, 2));
    // Ensure directory exists before writing file
    await fs.mkdir(path.dirname(appSettingsPath), { recursive: true });
    await fs.writeFile(appSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    console.log(`[Settings] Successfully wrote to ${appSettingsPath}`);
    return true;
  } catch (err) {
    console.error(`[Settings] Failed to save app settings to ${appSettingsPath}:`, err);
    return false;
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
