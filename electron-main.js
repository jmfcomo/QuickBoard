const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');

let pendingFilePath = null;

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (filePath.toLowerCase().endsWith('.sbd')) {
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
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const { buildMenu } = require('./src/electron/menu');
  const hooks = {
    onSave: fileio.requestSaveFromRenderer,
    onLoad: fileio.loadBoardIntoRenderer,
  };

  buildMenu(app, win, hooks);
  win.loadFile(path.join(__dirname, 'dist/browser/index.html'));

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
fileio.registerIpcHandlers();

ipcMain.handle('quickboard:get-theme-source', () => nativeTheme.themeSource);

app.whenReady().then(async () => {
  await fileio.init(app);
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
