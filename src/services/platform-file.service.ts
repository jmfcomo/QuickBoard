import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FileSaver } from './file-saver.plugin';

/**
 * Abstracts file save/load across all platforms:
 * - Electron: delegates to window.quickboard IPC (not used here, handled by SaveService)
 * - Android: uses ACTION_CREATE_DOCUMENT via FileSaver plugin (system file picker)
 * - iOS: uses @capacitor/share sheet (shows "Save to Files" reliably)
 * - Browser (web): uses blob URL download + <input type="file">
 */
@Injectable({ providedIn: 'root' })
export class PlatformFileService {
  readonly isElectron = !!window.quickboard;
  readonly isNative = Capacitor.isNativePlatform();

  /**
   * Save a binary file.
   * - Native (Android/iOS): writes to a temp cache file and opens the OS share
   *   sheet so the user can choose where to save it. Returns false because we
   *   cannot confirm the user actually completed the save.
   * - Web: uses the File System Access API (showSaveFilePicker) when available,
   *   falling back to a blob download. Returns true on confirmed save.
   */
  async saveFile(data: Uint8Array, fileName: string, suggestedName?: string): Promise<boolean> {
    if (this.isNative) {
      await this.saveNative(data, suggestedName || fileName);
      // Share sheet was shown but we can't confirm the user saved.
      return false;
    } else {
      return this.saveWeb(data, suggestedName || fileName);
    }
  }

  /**
   * Open a file picker and return the file contents as a Uint8Array.
   * On all platforms this uses a hidden <input type="file"> which works in
   * both the browser and Capacitor WebViews.
   */
  pickAndReadFile(accept: string): Promise<{ data: Uint8Array; name: string } | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.display = 'none';
      document.body.appendChild(input);

      input.onchange = async () => {
        const file = input.files?.[0];
        document.body.removeChild(input);
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const buffer = await file.arrayBuffer();
          resolve({ data: new Uint8Array(buffer), name: file.name });
        } catch (e) {
          console.error('Failed to read file:', e);
          resolve(null);
        }
      };

      input.oncancel = () => {
        document.body.removeChild(input);
        resolve(null);
      };

      input.click();
    });
  }

  private async saveNative(data: Uint8Array, fileName: string): Promise<void> {
    if (Capacitor.getPlatform() === 'android') {
      // ACTION_CREATE_DOCUMENT opens the system file picker — the user chooses
      // the folder and confirms the filename before the write happens.
      const base64 = this.toBase64(data);
      try {
        await FileSaver.saveFile({ data: base64, fileName });
      } catch (e) {
        // Swallow silent cancels; re-throw real errors.
        if (e instanceof Error && e.message === 'cancelled') return;
        if (
          typeof e === 'object' &&
          e !== null &&
          (e as { message?: string }).message === 'cancelled'
        )
          return;
        throw e;
      }
      return;
    }

    // iOS: the share sheet reliably shows "Save to Files".
    const base64 = this.toBase64(data);
    const tmpPath = `tmp_${Date.now()}_${fileName}`;

    await Filesystem.writeFile({
      path: tmpPath,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });

    const { uri } = await Filesystem.getUri({
      path: tmpPath,
      directory: Directory.Cache,
    });

    try {
      await Share.share({
        title: fileName,
        url: uri,
        dialogTitle: `Save ${fileName}`,
      });
    } finally {
      await Filesystem.deleteFile({
        path: tmpPath,
        directory: Directory.Cache,
      }).catch((deleteError) => {
        console.warn(`Failed to cleanup temporary file: ${tmpPath}`, deleteError);
      });
    }
  }

  private toBase64(data: Uint8Array): string {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private async saveWeb(data: Uint8Array, fileName: string): Promise<boolean> {
    // Attempt File System Access API for native "Save As"
    if ('showSaveFilePicker' in window) {
      try {
        const picker = window as unknown as {
          showSaveFilePicker: (opts: unknown) => Promise<{
            createWritable: () => Promise<{
              write: (d: Uint8Array) => Promise<void>;
              close: () => Promise<void>;
            }>;
          }>;
        };
        const handle = await picker.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: 'QuickBoard Project',
              accept: { 'application/octet-stream': ['.sbd'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        return true;
      } catch (e) {
        // User cancelled — no toast.
        if (e instanceof Error && e.name === 'AbortError') return false;
        console.warn('File System Access API failed, falling back to download', e);
      }
    }

    // Standard download fallback
    const blob = new Blob([data as unknown as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Failed to read file as base64.'));
          return;
        }
        const commaIndex = reader.result.indexOf(',');
        if (commaIndex === -1) {
          reject(new Error('Invalid data URL format.'));
          return;
        }
        resolve(reader.result.slice(commaIndex + 1));
      };
      reader.onerror = () => reject(reader.error ?? new Error('File read error.'));
      reader.readAsDataURL(file);
    });
  }
}
