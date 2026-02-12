const { contextBridge, ipcRenderer } = require('electron');

const validateSavePayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload: must be an object');
  }
  if (typeof payload.data !== 'string') {
    throw new Error('Invalid payload: data must be a string');
  }
  const filePath = payload.filePath ?? payload.path;
  if (typeof filePath !== 'string' || !filePath.length) {
    throw new Error('Invalid payload: filePath must be a non-empty string');
  }
  // Prevent directory traversal
  if (filePath.includes('..')) {
    throw new Error('Invalid payload: filePath contains invalid characters');
  }
  return filePath;
};

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
  sendSaveData: (payload) => {
    let filePath;
    try {
      filePath = validateSavePayload(payload);
    } catch (err) {
      // catch invalid payloads
      console.error('quickboard: rejected invalid save payload', err);
      return;
    }
    ipcRenderer.send('quickboard:save-data', { filePath, data: payload.data });
  },
  onThemeChanged: (handler) => {
    const listener = (_event, theme) => handler(theme);
    ipcRenderer.on('quickboard:theme-changed', listener);
    return () => ipcRenderer.removeListener('quickboard:theme-changed', listener);
  },
  getThemeSource: () => ipcRenderer.invoke('quickboard:get-theme-source'),
});
