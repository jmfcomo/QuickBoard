const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
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
