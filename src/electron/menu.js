const { Menu, nativeTheme, BrowserWindow, dialog, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');

let aboutWin = null;

function isWindowAlive(win) {
  return !!win && !win.isDestroyed() && !!win.webContents && !win.webContents.isDestroyed();
}

function resolveMainWindow(preferredWin) {
  if (isWindowAlive(preferredWin)) {
    return preferredWin;
  }

  const windows = BrowserWindow.getAllWindows();
  const nonAboutWindow = windows.find((w) => isWindowAlive(w) && w !== aboutWin);
  if (nonAboutWindow) {
    return nonAboutWindow;
  }

  return windows.find((w) => isWindowAlive(w)) || null;
}

function sendToMainWindow(preferredWin, channel, payload) {
  const target = resolveMainWindow(preferredWin);
  if (!target) {
    return;
  }

  target.webContents.send(channel, payload);
}

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
          if (typeof hooks.onSave === 'function') {
            const target = resolveMainWindow(win);
            if (target) hooks.onSave(target);
          }
        },
      },
      {
        label: 'Save As...',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => {
          if (typeof hooks.onSaveAs === 'function') hooks.onSaveAs(win);
        },
      },
      {
        label: 'Load',
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          if (typeof hooks.onLoad === 'function') {
            const target = resolveMainWindow(win);
            if (target) hooks.onLoad(target);
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Export...',
        click: () => {
          if (typeof hooks.onExport === 'function') {
            const target = resolveMainWindow(win);
            if (target) hooks.onExport(target);
          }
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
            checked: !global.quickboardCustomTheme,
            click: () => {
              nativeTheme.themeSource = 'system';
              global.quickboardCustomTheme = null;
              sendToMainWindow(win, 'quickboard:theme-changed', 'system');
            },
          },
          {
            label: 'White',
            type: 'radio',
            checked: global.quickboardCustomTheme === 'white',
            click: () => {
              nativeTheme.themeSource = 'light';
              global.quickboardCustomTheme = 'white';
              sendToMainWindow(win, 'quickboard:theme-changed', 'white');
            },
          },
          {
            label: 'Light',
            type: 'radio',
            checked: global.quickboardCustomTheme === 'light',
            click: () => {
              nativeTheme.themeSource = 'light';
              global.quickboardCustomTheme = 'light';
              sendToMainWindow(win, 'quickboard:theme-changed', 'light');
            },
          },
          {
            label: 'Sepia',
            type: 'radio',
            checked: global.quickboardCustomTheme === 'sepia',
            click: () => {
              nativeTheme.themeSource = 'light';
              global.quickboardCustomTheme = 'sepia';
              sendToMainWindow(win, 'quickboard:theme-changed', 'sepia');
            },
          },
          {
            label: 'Dark',
            type: 'radio',
            checked: global.quickboardCustomTheme === 'dark',
            click: () => {
              nativeTheme.themeSource = 'dark';
              global.quickboardCustomTheme = 'dark';
              sendToMainWindow(win, 'quickboard:theme-changed', 'dark');
            },
          },
          {
            label: 'Black',
            type: 'radio',
            checked: global.quickboardCustomTheme === 'black',
            click: () => {
              nativeTheme.themeSource = 'dark';
              global.quickboardCustomTheme = 'black';
              sendToMainWindow(win, 'quickboard:theme-changed', 'black');
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
      {
        label: 'Shortcuts',
        submenu: [
          {
            label: 'Add Board',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              sendToMainWindow(win, 'quickboard:new-board');
            },
          },
        ],
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
          sendToMainWindow(win, 'quickboard:undo');
        },
      },
      {
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Shift+Z',
        click: () => {
          sendToMainWindow(win, 'quickboard:redo');
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
