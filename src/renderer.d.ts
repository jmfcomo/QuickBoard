export {};

declare global {
  interface Window {
    quickboard?: {
      saveBoard: (data: string) => Promise<{ canceled: boolean; filePath?: string }>;
      loadBoard: () => Promise<{
        canceled: boolean;
        filePath?: string;
        content?: string;
      }>;
    };
  }
}
