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
      openExternal: (url: string) => void;
      onRequestPngExport: (handler: (payload: { defaultDirPath: string }) => void) => () => void;
      onRequestVideoExport: (handler: (payload: { defaultDirPath: string }) => void) => () => void;
      pickExportDir: () => Promise<string | null>;
      sendPngExportFrame: (payload: {
        dirPath: string;
        name: string;
        buffer: Uint8Array;
        index: number;
        total: number;
      }) => Promise<{ success: boolean; message?: string }>;
      sendVideoFile: (payload: {
        dirPath: string;
        name: string;
        buffer: Uint8Array;
      }) => Promise<{ success: boolean; message?: string }>;
    };
  }
}
