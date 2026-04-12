const { contextBridge, ipcRenderer } = require('electron');

const validateFilePath = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload: must be an object');
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

const validateSavePayload = (payload) => {
  const filePath = validateFilePath(payload);
  if (typeof payload.data !== 'string') {
    throw new Error('Invalid payload: data must be a string');
  }
  return filePath;
};

// works with app ts file and renderer ts file to handle menu requests
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
      console.error('quickboard: rejected invalid save payload', err);
      return;
    }
    ipcRenderer.send('quickboard:save-data', { filePath, data: payload.data });
  },
  sendSaveBinary: (payload) => {
    let filePath;
    try {
      filePath = validateFilePath(payload);
    } catch (err) {
      console.error('quickboard: rejected invalid binary save payload', err);
      return;
    }
    if (!(payload.data instanceof Uint8Array)) {
      console.error('quickboard: binary save data must be Uint8Array');
      return;
    }
    ipcRenderer.send('quickboard:save-binary', { filePath, data: payload.data });
  },
  onThemeChanged: (handler) => {
    const listener = (_event, theme) => handler(theme);
    ipcRenderer.on('quickboard:theme-changed', listener);
    return () => ipcRenderer.removeListener('quickboard:theme-changed', listener);
  },
  getThemeSource: () => ipcRenderer.invoke('quickboard:get-theme-source'),
  setCustomTheme: (theme) => {
    ipcRenderer.send('quickboard:set-custom-theme', theme);
  },
  onNewBoard: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('quickboard:new-board', listener);
    return () => ipcRenderer.removeListener('quickboard:new-board', listener);
  },
  onNewLane: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('quickboard:new-lane', listener);
    return () => ipcRenderer.removeListener('quickboard:new-lane', listener);
  },
  onClearBoard: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('quickboard:clear-board', listener);
    return () => ipcRenderer.removeListener('quickboard:clear-board', listener);
  },
  onDuplicateBoard: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('quickboard:duplicate-board', listener);
    return () => ipcRenderer.removeListener('quickboard:duplicate-board', listener);
  },
  onUndo: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('quickboard:undo', listener);
    return () => ipcRenderer.removeListener('quickboard:undo', listener);
  },
  onRedo: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('quickboard:redo', listener);
    return () => ipcRenderer.removeListener('quickboard:redo', listener);
  },
  onSaveResult: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('quickboard:save-result', listener);
    return () => ipcRenderer.removeListener('quickboard:save-result', listener);
  },
  onRequestExport: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('quickboard:request-export', listener);
    return () => ipcRenderer.removeListener('quickboard:request-export', listener);
  },
  sendPngExportFrame: async (payload) => {
    if (
      !payload ||
      typeof payload.dirPath !== 'string' ||
      typeof payload.name !== 'string' ||
      !(payload.buffer instanceof Uint8Array) ||
      typeof payload.index !== 'number' ||
      typeof payload.total !== 'number'
    ) {
      console.error('quickboard: invalid PNG export frame payload');
      return { success: false, message: 'Invalid payload' };
    }
    // Prevent path traversal in caller-supplied file name
    if (payload.name.includes('..') || payload.name.includes('/') || payload.name.includes('\\')) {
      console.error('quickboard: rejected frame payload with invalid name');
      return { success: false, message: 'Invalid file name' };
    }
    return ipcRenderer.invoke('quickboard:png-export-frame', {
      dirPath: payload.dirPath,
      name: payload.name,
      buffer: payload.buffer,
      index: payload.index,
      total: payload.total,
    });
  },
  pickExportDir: () => ipcRenderer.invoke('quickboard:pick-export-dir'),
  sendVideoFile: async (payload) => {
    if (
      !payload ||
      typeof payload.dirPath !== 'string' ||
      typeof payload.name !== 'string' ||
      !(payload.buffer instanceof Uint8Array)
    ) {
      console.error('quickboard: invalid video file payload');
      return { success: false, message: 'Invalid payload' };
    }
    if (payload.name.includes('..') || payload.name.includes('/') || payload.name.includes('\\')) {
      console.error('quickboard: rejected video payload with invalid name');
      return { success: false, message: 'Invalid file name' };
    }
    return ipcRenderer.invoke('quickboard:save-video-file', {
      dirPath: payload.dirPath,
      name: payload.name,
      buffer: payload.buffer,
    });
  },
});
