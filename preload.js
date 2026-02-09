const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quickboard', {
  onRequestSave: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('quickboard:request-save', listener);
    return () => ipcRenderer.removeListener('quickboard:request-save', listener);
  },
  onLoadData: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('quickboard:load-data', listener);
    return () => ipcRenderer.removeListener('quickboard:load-data', listener);
  },
  sendSaveData: (payload) => ipcRenderer.send('quickboard:save-data', payload),
});
