const { Menu, nativeTheme, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

let aboutWin = null;

function openAboutWindow(app) {
  if (aboutWin && !aboutWin.isDestroyed()) {
    aboutWin.focus();
    return;
  }
  const packageJsonPath = path.join(app.getAppPath(), 'package.json');
  let quickboardDesc = '';
  let quickboardVersion = 'unknown';
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    quickboardDesc = packageJson.description || '';
    quickboardVersion = packageJson.version || 'unknown';
  } catch (err) {
    // ignore error, fallback to defaults
  }
  aboutWin = openDialogWindow(app, {
    title: 'About QuickBoard',
    width: 320,
    height: 260,
    query: { dialog: 'about', description: quickboardDesc, version: quickboardVersion },
  });
  aboutWin.on('closed', () => {
    aboutWin = null;
  });
}

function openDialogWindow(app, { title, width, height, query }) {
  const indexPath = path.join(app.getAppPath(), 'dist', 'browser', 'index.html');
  const preloadPath = path.join(app.getAppPath(), 'src', 'electron', 'preload.js');
  const win = new BrowserWindow({
    width,
    height,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(indexPath, { query });
  return win;
}

function buildMenu(app, win, hooks = {}) {
  const fileMenu = {
    label: 'File',
    submenu: [
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => {
          if (typeof hooks.onSave === 'function') hooks.onSave(win);
        },
      },
      {
        label: 'Load',
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          if (typeof hooks.onLoad === 'function') hooks.onLoad(win);
        },
      },
      { type: 'separator' },
      {
        label: 'Export...',
        click: () => {
          if (typeof hooks.onExport === 'function') hooks.onExport(win);
        },
      },
    ],
  };

  const viewMenu = {
    label: 'View',
    submenu: [
      {
        label: 'Appearance',
        submenu: [
          {
            label: 'System',
            type: 'radio',
            checked: nativeTheme.themeSource === 'system',
            click: () => {
              nativeTheme.themeSource = 'system';
              win.webContents.send('quickboard:theme-changed', 'system');
            },
          },
          {
            label: 'Light',
            type: 'radio',
            checked: nativeTheme.themeSource === 'light',
            click: () => {
              nativeTheme.themeSource = 'light';
              win.webContents.send('quickboard:theme-changed', 'light');
            },
          },
          {
            label: 'Dark',
            type: 'radio',
            checked: nativeTheme.themeSource === 'dark',
            click: () => {
              nativeTheme.themeSource = 'dark';
              win.webContents.send('quickboard:theme-changed', 'dark');
            },
          },
        ],
      },
    ],
  };

  const optionsMenu = {
    label: 'Help',
    submenu: [
      {
        label: 'About QuickBoard',
        click: () => openAboutWindow(app),
      },
    ],
  };

  const editMenu = {
    label: 'Edit',
    submenu: [
      {
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        click: () => {
          win.webContents.send('quickboard:undo');
        },
      },
      {
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Shift+Z',
        click: () => {
          win.webContents.send('quickboard:redo');
        },
      },
    ],
  };

  const template = [];

  if (process.platform === 'darwin') {
    // macOS — custom About under the app name menu (standard Mac placement)
    template.push({
      label: app.name,
      submenu: [
        {
          label: 'About QuickBoard',
          click: () => openAboutWindow(app),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
    template.push(fileMenu);
    template.push(editMenu);
    template.push(viewMenu);
  } else {
    template.push(fileMenu);
    template.push(editMenu);
    template.push(viewMenu);
    template.push(optionsMenu);
    template.push({ role: 'quit' });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}

module.exports = { buildMenu };
function registerThemeListener(app, win, hooks = {}) {
  const handler = () => {
    buildMenu(app, win, hooks);
    try {
      win.webContents.send('quickboard:theme-changed', nativeTheme.themeSource);
    } catch (err) {}
  };

  nativeTheme.on('updated', handler);

  return () => {
    nativeTheme.removeListener('updated', handler);
  };
}

module.exports = { buildMenu, registerThemeListener };
