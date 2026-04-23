const { Menu, nativeTheme, BrowserWindow, dialog, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const appSettings = require('./config/appsettings.json');
const themes = require('../shared/themes.json');

let aboutWin = null;
let settingsWin = null;

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

function openSettingsWindow(app) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = openDialogWindow(app, {
    title: 'Settings',
    width: 750,
    height: 700,
    query: { dialog: 'settings' },
  });
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

function openDialogWindow(app, { title, width, height, query }) {
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

  const url = new URL(appSettings.appURL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
  }

  win.loadURL(url.toString());
  return win;
}

function buildMenu(app, win, hooks = {}) {
  const appearanceItems = themes.map((theme) => ({
    label: theme.label,
    type: 'radio',
    checked:
      theme.id === 'system'
        ? !global.quickboardCustomTheme
        : global.quickboardCustomTheme === theme.id,
    click: () => {
      nativeTheme.themeSource = theme.nativeThemeSource;
      global.quickboardCustomTheme = theme.id === 'system' ? null : theme.id;
      sendToMainWindow(win, 'quickboard:theme-changed', theme.id);
    },
  }));

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
        accelerator: 'CmdOrCtrl+E',
        click: () => {
          if (typeof hooks.onExport === 'function') {
            const target = resolveMainWindow(win);
            if (target) hooks.onExport(target);
          }
        },
      },
      ...(process.platform !== 'darwin'
        ? [
            { type: 'separator' },
            {
              label: 'Settings',
              accelerator: 'CmdOrCtrl+,',
              click: () => openSettingsWindow(app),
            },
          ]
        : []),
    ],
  };

  const viewMenu = {
    label: 'View',
    submenu: [
      {
        label: 'Appearance',
        submenu: appearanceItems,
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
          sendToMainWindow(win, 'quickboard:shortcut', 'undo');
        },
      },
      {
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Shift+Z',
        click: () => {
          sendToMainWindow(win, 'quickboard:shortcut', 'redo');
        },
      },
    ],
  };

  const template = [];

  if (process.platform === 'darwin') {
    // macOS — custom About and Settings under the app name menu (standard Mac placement)
    template.push({
      label: app.name,
      submenu: [
        {
          label: 'About QuickBoard',
          click: () => openAboutWindow(app),
        },
        {
          label: 'Settings',
          accelerator: 'Cmd+,',
          click: () => openSettingsWindow(app),
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
