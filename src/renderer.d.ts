export {};

declare global {
  interface Window {
    quickboard?: {
      // for handling menu options in menu js file
      onRequestSave: (handler: (payload: { filePath: string }) => void) => () => void;
      onLoadData: (
        handler: (payload: { filePath: string; content: string; isBinary?: boolean }) => void,
      ) => () => void;
      sendSaveData: (payload: { filePath: string; data: string }) => void;
      sendSaveBinary: (payload: { filePath: string; data: Uint8Array }) => void;
      onThemeChanged: (handler: (theme: 'system' | 'light' | 'dark') => void) => () => void;
      getThemeSource: () => Promise<'system' | 'light' | 'dark'>;
      onUndo: (handler: () => void) => () => void;
      onRedo: (handler: () => void) => () => void;
      onRequestPngExport: (handler: (payload: { dirPath: string }) => void) => () => void;
      sendPngExportData: (payload: {
        dirPath: string;
        frames: { name: string; dataUrl: string }[];
      }) => void;
      onPngExportProgress: (
        handler: (payload: { current: number; total: number; fileName: string }) => void,
      ) => () => void;
      onPngExportResult: (
        handler: (payload: { success: boolean; count?: number; message?: string }) => void,
      ) => () => void;
    };
  }
}
