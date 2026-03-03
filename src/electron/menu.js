const { Menu, nativeTheme } = require('electron');
import { undoStroke } from '../ui/canvas/canvas/canvas.component';

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
    label: 'QuickBoard',
    submenu: [
      { label: 'Version' },
      { type: 'separator' },
      { label: 'About',
        
      }
    ],
  };

  const undoMenu = {
    label: 'Undo',
    accelerator: 'CmdOrCtrl+Z',
    click: () => {
      undoStroke();
    }
  };

  const redoMenu = {
    label: 'Redo',
    accelerator: 'CmdOrCtrl+Shift+Z'
  };

  const template = [];

  if (process.platform === 'darwin') {
    // macOS
    template.push({
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
    });
    template.push(fileMenu);
    template.push(viewMenu);
    template.push(undoMenu);
    template.push(redoMenu);
    template.push(optionsMenu);
  } else {
    template.push(fileMenu);
    template.push(viewMenu);
    template.push(undoMenu);
    template.push(redoMenu);
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
