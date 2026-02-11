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
  buildMenu(app, win, {
    onSave: fileio.requestSaveFromRenderer,
    onLoad: fileio.loadBoardIntoRenderer,
  });

  // Rebuild the menu when the theme changes so the radio buttons stay in sync
  nativeTheme.on('updated', () => {
    buildMenu(app, win, {
      onSave: fileio.requestSaveFromRenderer,
      onLoad: fileio.loadBoardIntoRenderer,
    });
    win.webContents.send('quickboard:theme-changed', nativeTheme.themeSource);
  });

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
