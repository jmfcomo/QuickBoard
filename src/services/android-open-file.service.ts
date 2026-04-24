import { Injectable, inject } from '@angular/core';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SbdService } from '../app/app.sbd.service';
import { ExportIpcService } from './export-ipc.service';
import { FileSaver } from './file-saver.plugin';
import { PlatformFileService } from './platform-file.service';
import { UndoRedoService } from './undo-redo.service';

export interface AndroidCanvasDelegate {
  prepareForProjectLoad(): void;
}

@Injectable({ providedIn: 'root' })
export class AndroidOpenFileService {
  private readonly sbd = inject(SbdService);
  private readonly exportIpc = inject(ExportIpcService);
  private readonly platformFile = inject(PlatformFileService);
  private readonly undoRedo = inject(UndoRedoService);

  private readonly isAndroid = Capacitor.getPlatform() === 'android';
  private fileOpenedListener?: PluginListenerHandle;

  init(delegate: AndroidCanvasDelegate): void {
    if (!this.isAndroid) {
      return;
    }

    void this.fileOpenedListener?.remove();
    this.fileOpenedListener = undefined;

    void this.platformFile.checkAndroidOpenFile().then((file) => {
      if (file) {
        void this.openFile(file, delegate);
      }
    });

    void FileSaver.addListener('fileOpened', (event) => {
      void this.openFile({ data: this.decodeBase64(event.data), name: event.fileName }, delegate);
    }).then((handle) => {
      this.fileOpenedListener = handle;
    });
  }

  destroy(): void {
    void this.fileOpenedListener?.remove();
    this.fileOpenedListener = undefined;
  }

  private decodeBase64(data: string): Uint8Array {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  private async openFile(
    file: { data: Uint8Array; name: string },
    delegate: AndroidCanvasDelegate
  ): Promise<void> {
    try {
      delegate.prepareForProjectLoad();
      await this.sbd.loadSbdZip(file.data);
      this.undoRedo.clear();

      const stem = file.name.replace(/\.[^.]+$/, '');
      if (stem) {
        this.exportIpc.setProjectName(stem);
      }
    } catch (error) {
      console.error('Failed to open Android file:', error);
      window.alert(
        `Failed to open file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
