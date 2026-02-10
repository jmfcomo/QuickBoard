const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');

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
  const mainMenu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            void requestSaveFromRenderer(win);
          },
        },
        {
          label: 'Load',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            void loadBoardIntoRenderer(win);
          },
        },
      ],
    },
    {
      role: 'quit',
    },
  ]);

  win.setMenu(mainMenu);

  win.loadFile(path.join(__dirname, 'dist/browser/index.html'));
}

let lastUsedDir = null;

async function requestSaveFromRenderer(win) {
  const documentsDir = app.getPath('documents');
  const baseDir = lastUsedDir || documentsDir;
  const defaultPath = path.join(baseDir, 'quickboard.json');

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Board',
    defaultPath,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (canceled || !filePath) {
    return;
  }

  try {
    lastUsedDir = path.dirname(filePath);
  } catch {}

  win.webContents.send('quickboard:request-save', { filePath });
}

async function loadBoardIntoRenderer(win) {
  const documentsDir = app.getPath('documents');
  const baseDir = lastUsedDir || documentsDir;

  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Load Board',
    defaultPath: baseDir,
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return;
  }

  const filePath = filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');
  try {
    lastUsedDir = path.dirname(filePath);
  } catch {}
  win.webContents.send('quickboard:load-data', { filePath, content });
}

ipcMain.on('quickboard:save-data', async (_event, payload) => {
  if (!payload || !payload.filePath || typeof payload.data !== 'string') {
    return;
  }

  try {
    const dir = path.dirname(payload.filePath);
    if (dir) lastUsedDir = dir;
  } catch {}

  await fs.writeFile(payload.filePath, payload.data, 'utf-8');
});

app.whenReady().then(createWindow);

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
