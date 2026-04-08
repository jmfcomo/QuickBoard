import { Injectable, inject, signal } from '@angular/core';
import { SbdService } from '../app/app.sbd.service';
import { UndoRedoService } from './undo-redo.service';
import { ExportIpcService } from './export-ipc.service';
import appSettings from '@econfig/appsettings.json';

@Injectable({
  providedIn: 'root',
})
export class SaveService {
  private readonly sbd = inject(SbdService);
  private readonly undoRedo = inject(UndoRedoService);
  private readonly exportIpc = inject(ExportIpcService);

  private currentFilePath: string | null = null;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private saveInProgress = false;

  public readonly saveStatus = signal<string | null>(null);

  private removeRequestSaveListener?: () => void;
  private removeLoadDataListener?: () => void;
  private removeSaveResultListener?: () => void;

  init(): void {
    if (window.quickboard?.onRequestSave) {
      this.removeRequestSaveListener = window.quickboard.onRequestSave(async (payload) => {
        if (this.saveInProgress) return;
        this.saveInProgress = true;
        try {
          this.currentFilePath = payload.filePath;
          const zipData = await this.sbd.buildSbdZip();
          window.quickboard?.sendSaveBinary({ filePath: payload.filePath, data: zipData });
        } catch (err) {
          console.error('Failed to build .sbd file:', err);
          this.saveInProgress = false;
        }
      });
    }

    if (window.quickboard?.onLoadData) {
      this.removeLoadDataListener = window.quickboard.onLoadData(async (payload) => {
        try {
          this.currentFilePath = payload.filePath;
          if (payload.isBinary) {
            await this.sbd.loadSbdZip(payload.content);
          } else {
            // Legacy plain-JSON fallback
            this.sbd.loadLegacyJson(payload.content);
          }
          // Clear history — the newly-loaded project starts with a clean slate
          this.undoRedo.clear();
          // Derive default export prefix from the opened file's name.
          const stem =
            payload.filePath
              .split(/[\\/]/)
              .pop()
              ?.replace(/\.[^.]+$/, '') ?? '';
          if (stem) this.exportIpc.setProjectName(stem);
        } catch (err) {
          console.error('Failed to load data from file:', err);
          const message = err instanceof Error ? err.message : String(err);
          window.alert(`Failed to load file: ${message}`);
        }
      });
    }

    if (appSettings.autosave) {
      this.autosaveTimer = setInterval(
        async () => {
          if (this.saveInProgress) return;
          if (this.currentFilePath && window.quickboard?.sendSaveBinary) {
            this.saveInProgress = true;
            try {
              const zipData = await this.sbd.buildSbdZip();
              window.quickboard.sendSaveBinary({
                filePath: this.currentFilePath,
                data: zipData,
              });
            } catch (err) {
              console.error('Autosave failed:', err);
              this.saveInProgress = false;
            }
          }
        },
        5 * 60 * 1000,
      );
    }

    if (window.quickboard?.onSaveResult) {
      this.removeSaveResultListener = window.quickboard.onSaveResult((payload) => {
        this.saveInProgress = false;
        if (payload.success) {
          this.saveStatus.set('Saved!');
          setTimeout(() => {
            if (this.saveStatus() === 'Saved!') {
              this.saveStatus.set(null);
            }
          }, 2000);
        }
      });
    }
  }

  destroy(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
    }
    this.removeRequestSaveListener?.();
    this.removeLoadDataListener?.();
    this.removeSaveResultListener?.();
  }
}
