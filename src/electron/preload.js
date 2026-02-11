const { contextBridge, ipcRenderer } = require('electron');

const validateSavePayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload: must be an object');
  }
  if (typeof payload.data !== 'string') {
    throw new Error('Invalid payload: data must be a string');
  }
  if (typeof payload.path !== 'string' || !payload.path.length) {
    throw new Error('Invalid payload: path must be a non-empty string');
  }
  // Prevent directory traversal
  if (payload.path.includes('..') || payload.path.startsWith('/')) {
    throw new Error('Invalid payload: path contains invalid characters');
  }
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
    try {
      validateSavePayload(payload);
    } catch (err) {
      // catch invalid payloads
      console.error('quickboard: rejected invalid save payload', err);
      return;
    }

    ipcRenderer.send('quickboard:save-data', payload);
  },
});
