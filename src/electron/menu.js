const { Menu, nativeTheme } = require('electron');


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

  const template = [];

  if (process.platform === 'darwin') {
    // macOS
    template.push({
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
    });
    template.push(fileMenu);
    template.push(viewMenu);
  } else {
    template.push(fileMenu);
    template.push(viewMenu);
    template.push({ role: 'quit' });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}

module.exports = { buildMenu };
