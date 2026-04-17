import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Abstracts file save/load across all platforms:
 * - Electron: delegates to window.quickboard IPC (not used here, handled by SaveService)
 * - Android/iOS native (Capacitor): uses @capacitor/filesystem + @capacitor/share
 * - Browser (web): uses blob URL download + <input type="file">
 */
@Injectable({ providedIn: 'root' })
export class PlatformFileService {
  readonly isElectron = !!window.quickboard;
  readonly isNative = Capacitor.isNativePlatform();

  /**
   * Save a binary file. On Android/iOS uses the Capacitor Share sheet so the
   * user can choose where to save it. On web, attempts to use the File System
   * Access API (showSaveFilePicker) for a native "Save As" experience, falling
   * back to a normal download.
   */
  async saveFile(data: Uint8Array, fileName: string, suggestedName?: string): Promise<void> {
    if (this.isNative) {
      await this.saveNative(data, suggestedName || fileName);
    } else {
      await this.saveWeb(data, suggestedName || fileName);
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
    // Convert Uint8Array → base64
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);

    try {
      // On Android, we can attempt to save to the Documents folder directly
      // using the Filesystem API. This avoids the share sheet requirement.
      await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      });

      // If we made it here, notify the user where it was saved
      window.alert(`Saved to Documents/${fileName}`);
    } catch (e) {
      console.warn('Direct file save failed, falling back to share sheet', e);

      const tmpPath = `tmp_${fileName}`;
      await Filesystem.writeFile({
        path: tmpPath,
        data: base64,
        directory: Directory.Cache,
      });

      const { uri } = await Filesystem.getUri({
        path: tmpPath,
        directory: Directory.Cache,
      });

      // Let the OS share sheet handle where to save it as a fallback
      try {
        await Share.share({
          title: `Save ${fileName}`,
          url: uri,
          dialogTitle: `Save ${fileName}`,
        });
      } finally {
        await Filesystem.deleteFile({
          path: tmpPath,
          directory: Directory.Cache,
        }).catch((deleteError) => {
          console.warn(`Failed to cleanup temporary shared file: ${tmpPath}`, deleteError);
        });
      }
    }
  }

  private async saveWeb(data: Uint8Array, fileName: string): Promise<void> {
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
        return;
      } catch (e) {
        // User cancelled, or other error. Fall back to standard download.
        if (e instanceof Error && e.name === 'AbortError') return;
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
