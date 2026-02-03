const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quickboard', {
  saveBoard: (data) => ipcRenderer.invoke('quickboard:save-board', data),
  loadBoard: () => ipcRenderer.invoke('quickboard:load-board'),
});
