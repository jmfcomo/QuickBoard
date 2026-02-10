const { Menu } = require('electron');
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
  } else {
    template.push(fileMenu);
    template.push({ role: 'quit' });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}

module.exports = { buildMenu };
