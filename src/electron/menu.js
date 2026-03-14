const { Menu, nativeTheme } = require('electron');
const { dialog } = require('electron');
const fs = require('fs');
const path = require('path');

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
        label: 'Export',
        submenu: [
          {
            label: 'PNG Sequence',
            click: () => {
              if (typeof hooks.onExportPngSequence === 'function') hooks.onExportPngSequence(win);
            },
          },
        ],
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
    submenu: [{ label: 'Version',
      click: () => {
        const appVersion = app.getVersion();
        const packageJsonPath = path.join(app.getAppPath(), 'package.json');
        let quickboardVersion = 'unknown';
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          quickboardVersion = packageJson.version || 'unknown';
        } catch (err) {
          // ignore error, fallback to unknown
        }
        dialog.showMessageBox(win, {
          type: 'info',
          title: 'QuickBoard Version',
          message: `QuickBoard version ${quickboardVersion} \n Electron version ${appVersion} \n Chrome version ${process.versions.chrome} \n Node.js version ${process.versions.node}`,
        });
      }
     }, { type: 'separator' }, 
     { label: 'About',
      click: () => {
        const packageJsonPath = path.join(app.getAppPath(), 'package.json');
        let quickboardDesc = 'unknown';
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          quickboardDesc = packageJson.description || 'unknown';
        } catch (err) {
          // ignore error, fallback to unknown
        }
        dialog.showMessageBox(win, {
          type: 'info',
          title: `QuickBoard: ${quickboardDesc}`,
          message: 'QuickBoard is a simple and efficient whiteboard application built with Electron.\n\nIf you have any questions or feedback, please visit our GitHub repository at https://github.com/jmfcomo/QuickBoard',
        });
      },
    }],   
  };

  const undoMenu = {
    label: 'Undo',
    accelerator: 'CmdOrCtrl+Z',
    click: () => {
      win.webContents.send('quickboard:undo');
    },
  };

  const redoMenu = {
    label: 'Redo',
    accelerator: 'CmdOrCtrl+Shift+Z',
    click: () => {
      win.webContents.send('quickboard:redo');
    },
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
