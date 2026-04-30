import {
  Injectable,
  inject,
  signal,
  effect,
  Injector,
  type EffectRef,
  DestroyRef,
} from '@angular/core';
import { SbdService } from '../app/app.sbd.service';
import { UndoRedoService } from './undo-redo.service';
import { ExportIpcService } from './export-ipc.service';
import { appSettings } from 'src/settings-loader';

interface RuntimeSavingSettings {
  autosave?: boolean;
  autosaveDuration?: number;
  savedToast?: boolean;
  initialSave?: boolean;
}

interface RuntimeAppSettings {
  autosave?: boolean;
  autosaveDuration?: number;
  saving?: RuntimeSavingSettings;
}

@Injectable({
  providedIn: 'root',
})
export class SaveService {
  private readonly sbd = inject(SbdService);
  private readonly undoRedo = inject(UndoRedoService);
  private readonly exportIpc = inject(ExportIpcService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private currentFilePath: string | null = null;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private saveInProgress = false;
  private initialSavePrompted = false;
  private initialSaveEffectRef?: EffectRef;

  public readonly saveStatus = signal<string | null>(null);

  private removeRequestSaveListener?: () => void;
  private removeLoadDataListener?: () => void;
  private removeSaveResultListener?: () => void;

  constructor() {
    // Automatically clean up resources on service destruction
    this.destroyRef.onDestroy(() => {
      this.cleanup();
    });
  }

  private getSavingSettings(): {
    autosave: boolean;
    autosaveDurationMs: number;
    savedToast: boolean;
    initialSave: boolean;
  } {
    const runtimeSettings = appSettings as unknown as RuntimeAppSettings;
    const saving = runtimeSettings.saving;

    const resolvedAutosave = saving?.autosave ?? runtimeSettings.autosave ?? true;
    const resolvedAutosaveDuration =
      saving?.autosaveDuration ?? runtimeSettings.autosaveDuration ?? 300_000;

    const autosaveDurationMs =
      typeof resolvedAutosaveDuration === 'number' && resolvedAutosaveDuration > 0
        ? resolvedAutosaveDuration
        : 300_000;

    return {
      autosave: resolvedAutosave,
      autosaveDurationMs,
      savedToast: saving?.savedToast ?? true,
      initialSave: saving?.initialSave ?? true,
    };
  }

  private requestSave(): void {
    window.quickboard?.requestSave?.();
  }

  init(): void {
    this.initialSavePrompted = false;

    this.initialSaveEffectRef?.destroy();
    this.initialSaveEffectRef = effect(
      () => {
        const hasUndoHistory = this.undoRedo.canUndo();

        if (!hasUndoHistory) {
          this.initialSavePrompted = false;
          return;
        }

        if (!this.getSavingSettings().initialSave) {
          return;
        }

        if (this.initialSavePrompted || this.currentFilePath || this.saveInProgress) {
          return;
        }

        this.initialSavePrompted = true;
        this.requestSave();
      },
      { injector: this.injector }
    );

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

    const { autosave, autosaveDurationMs } = this.getSavingSettings();

    if (autosave) {
      this.autosaveTimer = setInterval(async () => {
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
      }, autosaveDurationMs);
    }

    if (window.quickboard?.onSaveResult) {
      this.removeSaveResultListener = window.quickboard.onSaveResult((payload) => {
        this.saveInProgress = false;
        if (payload.success) {
          if (this.getSavingSettings().savedToast) {
            this.saveStatus.set('Saved!');
            setTimeout(() => {
              if (this.saveStatus() === 'Saved!') {
                this.saveStatus.set(null);
              }
            }, 2000);
          } else {
            this.saveStatus.set(null);
          }
        }
      });
    }
  }

  destroy(): void {
    // Note: cleanup is now handled automatically by DestroyRef in constructor
    // This method is kept for backward compatibility if called manually
    this.cleanup();
  }

  private cleanup(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
    }
    this.removeRequestSaveListener?.();
    this.removeLoadDataListener?.();
    this.removeSaveResultListener?.();
    this.initialSaveEffectRef?.destroy();
    this.initialSaveEffectRef = undefined;
  }
}
