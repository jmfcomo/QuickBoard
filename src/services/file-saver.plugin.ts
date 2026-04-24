import { PluginListenerHandle, registerPlugin } from '@capacitor/core';

export interface FileSaverPlugin {
  /** Open ACTION_CREATE_DOCUMENT so the user picks a save location. Android only. */
  saveFile(options: { data: string; fileName: string; mimeType?: string }): Promise<void>;
  /**
   * Check whether the app was launched by tapping a .sbd file.
   * Resolves with `{ data, fileName }` if a file intent is present, or an
   * empty object `{}` when there is no pending file intent.
   */
  getOpenFileData(): Promise<{ data?: string; fileName?: string }>;
  /**
   * Fires when the app is already running and the user opens a .sbd file.
   * Analogous to onNewIntent on Android.
   */
  addListener(
    eventName: 'fileOpened',
    listener: (event: { data: string; fileName: string }) => void,
  ): Promise<PluginListenerHandle>;
}

/**
 * Capacitor plugin that wraps Android's ACTION_CREATE_DOCUMENT (save) and
 * ACTION_VIEW (open) intents for .sbd files. Only functional on Android — on
 * other platforms the methods are no-ops provided by the web implementation.
 */
export const FileSaver = registerPlugin<FileSaverPlugin>('FileSaver');
