export {};

declare global {
  interface Window {
    quickboard?: {
      onRequestSave: (handler: (payload: { filePath: string }) => void) => () => void;
      onLoadData: (handler: (payload: { filePath: string; content: string }) => void) => () => void;
      sendSaveData: (payload: { filePath: string; data: string }) => void;
    };
  }
}
