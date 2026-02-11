const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const { buildMenu } = require('./src/electron/menu');
  buildMenu(app, win, {
    onSave: fileio.requestSaveFromRenderer,
    onLoad: fileio.loadBoardIntoRenderer,
  });

  win.loadFile(path.join(__dirname, 'dist/browser/index.html'));
}

const fileio = require('./src/electron/fileio');
fileio.registerIpcHandlers();

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
