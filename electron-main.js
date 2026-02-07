const { app, BrowserWindow, dialog, ipcMain, Menu, ipcRenderer } = require('electron');
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

  // applies the menu without overriding the whole window
  const mainMenu = Menu.buildFromTemplate([
  {
    label: 'Board Options',
    submenu: [
      { label: 'Save board',
        // badly needs fixing
        click: async () => {
          try {
            const result = await ipcRenderer.invoke('quickboard:save-board', data);
            if (!result.canceled) {
              console.log(`File saved: ${result.filePath ?? 'unknown path'}`);
            }
          } catch (err) {
            console.error(err);
          }
        }
       },
      { label: 'Load board' },
    ]
  },
  {
    role: 'quit'
  },
  ])

  win.setMenu(mainMenu);

  win.loadFile(path.join(__dirname, 'dist/browser/index.html'));
}

ipcMain.handle('quickboard:save-board', async (_event, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Board',
    defaultPath: 'quickboard.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  await fs.writeFile(filePath, data, 'utf-8');
  return { canceled: false, filePath };
});

ipcMain.handle('quickboard:load-board', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Load Board',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');
  return { canceled: false, filePath, content };
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
