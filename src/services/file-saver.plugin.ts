import { registerPlugin } from '@capacitor/core';

export interface FileSaverPlugin {
  saveFile(options: { data: string; fileName: string; mimeType?: string }): Promise<void>;
}

/**
 * Android-only Capacitor plugin that opens ACTION_CREATE_DOCUMENT so the user
 * can choose where to save a file. Only resolved/rejected on Android — not
 * present on other platforms, so always check Capacitor.getPlatform() before
 * calling.
 */
export const FileSaver = registerPlugin<FileSaverPlugin>('FileSaver');
