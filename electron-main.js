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

async function requestSaveFromRenderer(win) {
  // Ensure we have a dedicated QuickBoard folder inside the user's Documents
  const documentsDir = app.getPath('documents');
  const quickboardDir = path.join(documentsDir, 'quickboard');
  try {
    await fs.mkdir(quickboardDir, { recursive: true });
  } catch (err) {}

  const defaultPath = path.join(quickboardDir, 'quickboard.json');

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Board',
    defaultPath,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (canceled || !filePath) {
    return;
  }

  win.webContents.send('quickboard:request-save', { filePath });
}

async function loadBoardIntoRenderer(win) {
  const documentsDir = app.getPath('documents');
  const quickboardDir = path.join(documentsDir, 'quickboard');
  try {
    await fs.mkdir(quickboardDir, { recursive: true });
  } catch (err) {}

  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Load Board',
    defaultPath: quickboardDir,
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return;
  }

  const filePath = filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');
  win.webContents.send('quickboard:load-data', { filePath, content });
}

ipcMain.on('quickboard:save-data', async (_event, payload) => {
  if (!payload || !payload.filePath || typeof payload.data !== 'string') {
    return;
  }

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
