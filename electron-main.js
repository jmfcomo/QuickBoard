const { app, BrowserWindow, ipcMain, nativeTheme, protocol } = require('electron');
const path = require('path');
const appSettings = require('./src/electron/config/appsettings.json');
const fs = require('fs/promises');

// Initialize custom theme tracking (null = system, otherwise = explicit theme: 'white'|'light'|'sepia'|'dark'|'black')
global.quickboardCustomTheme = null;

// Must be called before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

let pendingFilePath = null;

// Keep the app name stable everywhere, but only force a custom userData path in development.
const USER_DATA_APP_NAME = 'QuickBoard';
app.setName(USER_DATA_APP_NAME);
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_APP_NAME));
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (filePath.toLowerCase().endsWith(appSettings.suffix)) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && win.webContents) {
      if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', () => fileio.loadBoardFromPath(win, filePath));
      } else {
        fileio.loadBoardFromPath(win, filePath);
      }
    } else {
      pendingFilePath = filePath;
    }
  }
});

function getArgvFilePath() {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  const file = args.find((a) => !a.startsWith('-') && a.toLowerCase().endsWith('.sbd'));
  return file || null;
}

function createWindow() {
  const iconPath =
    process.platform === 'linux'
      ? path.join(__dirname, 'branding', 'QuickBoard_icon_Linux.png')
      : undefined;

  const win = new BrowserWindow({
    ...appSettings.window,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'src', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const { buildMenu } = require('./src/electron/menu');
  const hooks = {
    onSave: fileio.requestSaveFromRenderer,
    onSaveAs: fileio.requestSaveAsFromRenderer,
    onLoad: fileio.loadBoardIntoRenderer,
    onExport: exportModule.exportRequest,
  };

  buildMenu(app, win, hooks);

  win.loadURL(appSettings.appURL);

  // After the renderer is ready, open any file that was passed at launch.
  win.webContents.once('did-finish-load', () => {
    const filePath = pendingFilePath || getArgvFilePath();
    pendingFilePath = null;
    if (filePath) {
      fileio.loadBoardFromPath(win, filePath);
    }
  });
}

const fileio = require('./src/electron/fileio');
const exportModule = require('./src/electron/export');
fileio.registerIpcHandlers();
exportModule.registerIpcHandlers();

ipcMain.handle('quickboard:get-theme-source', () => {
  if (global.quickboardCustomTheme) {
    return global.quickboardCustomTheme;
  }
  return 'system';
});

ipcMain.on('quickboard:set-custom-theme', (_event, theme) => {
  if (theme === null || ['white', 'light', 'sepia', 'dark', 'black'].includes(theme)) {
    global.quickboardCustomTheme = theme;
    if (theme === null) {
      nativeTheme.themeSource = 'system';
    } else if (['dark', 'black'].includes(theme)) {
      nativeTheme.themeSource = 'dark';
    } else {
      nativeTheme.themeSource = 'light';
    }
    // Rebuild menu to update checkmarks
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      const { buildMenu } = require('./src/electron/menu');
      const hooks = {
        onSave: fileio.requestSaveFromRenderer,
        onSaveAs: fileio.requestSaveAsFromRenderer,
        onLoad: fileio.loadBoardIntoRenderer,
        onExport: exportModule.exportRequest,
      };
      buildMenu(app, win, hooks);
    }
  }
});

app.whenReady().then(async () => {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp3': 'audio/mpeg',
  };

  const securityHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };

  const distRoot = path.join(__dirname, 'dist', 'browser');

  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    // Prevent path traversal
    const parts = url.pathname.split('/').filter((p) => p && p !== '..' && p !== '.');
    const relPath = parts.length === 0 ? 'index.html' : parts.join(path.sep);
    const filePath = path.join(distRoot, relPath);

    // Ensure the resolved path stays within distRoot
    if (!filePath.startsWith(distRoot)) {
      return new Response('Forbidden', { status: 403 });
    }

    let data;
    try {
      data = await fs.readFile(filePath);
    } catch {
      // SPA fallback
      try {
        data = await fs.readFile(path.join(distRoot, 'index.html'));
        return new Response(data, {
          headers: { 'Content-Type': 'text/html', ...securityHeaders },
        });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] ?? 'application/octet-stream';
    return new Response(data, {
      headers: { 'Content-Type': contentType, ...securityHeaders },
    });
  });

  await fileio.init(app);
  exportModule.init(app);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
