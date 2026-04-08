import { Component, ElementRef, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { CanvasComponent } from '../ui/canvas/canvas/canvas.component';
import { ScriptComponent } from '../ui/script/script/script.component';
import { TimelineComponent } from '../ui/timeline/timeline/timeline.component';
import { AboutWindowComponent } from '../ui/dialogs/about-window/about-window.component';
import { ExportProgressComponent } from '../ui/export-progress/export-progress.component';
import { ExportSettingsComponent } from '../ui/export-settings/export-settings.component';
import { SbdService } from './app.sbd.service';
import { ThemeService } from '../services/theme.service';
import { ExportIpcService } from '../services/export-ipc.service';
import { WindowScalingService } from '../services/window-scaling.service';
import { UndoRedoService } from '../services/undo-redo.service';
import { PlaybackService } from '../services/playback.service';
import appSettings from '@econfig/appsettings.json';

@Component({
  selector: 'app-root',
  host: {
    '[class.dialog-mode]': 'dialogMode() !== null',
    '(document:keydown)': 'onKeyDown($event)',
  },
  imports: [
    CanvasComponent,
    ScriptComponent,
    TimelineComponent,
    ExportProgressComponent,
    ExportSettingsComponent,
    AboutWindowComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('QuickBoard');
  protected readonly dialogMode = signal<'about' | null>(null);
  private readonly canvas = viewChild(CanvasComponent);
  private readonly sbd = inject(SbdService);
  private readonly el = inject(ElementRef);
  private readonly themeService = inject(ThemeService);
  private readonly windowScalingService = inject(WindowScalingService);
  protected readonly exportIpc = inject(ExportIpcService);
  private readonly undoRedo = inject(UndoRedoService);
  private readonly playback = inject(PlaybackService);
  private removeRequestSaveListener?: () => void;
  private removeLoadDataListener?: () => void;
  private removeThemeListener?: () => void;
  private removeUndoListener?: () => void;
  private removeRedoListener?: () => void;
  private removeWindowScalingListener?: () => void;
  private removeExportIpcListeners?: () => void;
  private removeSaveResultListener?: () => void;
  private currentFilePath: string | null = null;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.removeThemeListener = this.themeService.initTheme();

    // Check if this window was opened as a dialog by the main process
    const params = new URLSearchParams(window.location.search);
    const dialog = params.get('dialog');
    if (dialog === 'about') {
      this.dialogMode.set(dialog);
      return;
    }

    if (window.quickboard?.onRequestSave) {
      this.removeRequestSaveListener = window.quickboard.onRequestSave(async (payload) => {
        try {
          this.currentFilePath = payload.filePath;
          const zipData = await this.sbd.buildSbdZip();
          window.quickboard?.sendSaveBinary({ filePath: payload.filePath, data: zipData });
        } catch (err) {
          console.error('Failed to build .sbd file:', err);
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
          if (this.currentFilePath && window.quickboard?.sendSaveBinary) {
            try {
              const zipData = await this.sbd.buildSbdZip();
              window.quickboard.sendSaveBinary({
                filePath: this.currentFilePath,
                data: zipData,
              });
            } catch (err) {
              console.error('Autosave failed:', err);
            }
          }
        },
        5 * 60 * 1000,
      );
    }

    this.removeExportIpcListeners = this.exportIpc.init();

    if (window.quickboard?.onUndo) {
      this.removeUndoListener = window.quickboard.onUndo(() => {
        this.undoRedo.triggerUndo();
      });
    }

    if (window.quickboard?.onRedo) {
      this.removeRedoListener = window.quickboard.onRedo(() => {
        this.undoRedo.triggerRedo();
      });
    }

    if (window.quickboard?.onSaveResult) {
      this.removeSaveResultListener = window.quickboard.onSaveResult((payload) => {
        if (payload.success) {
          const oldTitle = this.title();
          this.title.set('Saved!');
          setTimeout(() => {
            if (this.title() === 'Saved!') {
              this.title.set(oldTitle);
            }
          }, 2000);
        }
      });
    }

    this.removeWindowScalingListener = this.windowScalingService.init(
      this.el.nativeElement as HTMLElement,
    );
  }

  onResizeMouseDown(event: MouseEvent): void {
    this.windowScalingService.onResizeMouseDown(event, this.el.nativeElement as HTMLElement);
  }

  private isEditableTarget(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return false;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return true;
    }

    if (target.isContentEditable) {
      return true;
    }

    return !!target.closest('[contenteditable="true"]');
  }

  onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    if (key === 'escape' && this.exportIpc.settingsVisible()) {
      event.preventDefault();
      this.exportIpc.onSettingsCancel();
      return;
    }

    if ((key === ' ' || key === 'spacebar') && !event.ctrlKey && !event.metaKey) {
      if (event.repeat || this.isEditableTarget(event) || this.dialogMode() !== null) {
        return;
      }
      event.preventDefault();
      this.playback.togglePlayback();
      return;
    }

    const ctrl = event.ctrlKey || event.metaKey;
    if (!ctrl) return;

    const isUndo = key === 'z' && !event.shiftKey;
    const isRedo = (key === 'z' && event.shiftKey) || key === 'y';

    if (!isUndo && !isRedo) return;

    if (this.isEditableTarget(event)) {
      const target = event.target as HTMLElement | null;
      // Allow global undo for EditorJS so its history interleaves perfectly with the canvas,
      // but let regular inputs/textareas use the browser's native undo.
      if (!target?.closest('#editorjs')) {
        return;
      }
    }

    event.preventDefault();
    if (isUndo) {
      this.undoRedo.triggerUndo();
    } else {
      this.undoRedo.triggerRedo();
    }
  }

  ngOnDestroy(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
    }
    this.removeRequestSaveListener?.();
    this.removeLoadDataListener?.();
    this.removeSaveResultListener?.();
    this.removeThemeListener?.();
    this.removeUndoListener?.();
    this.removeRedoListener?.();
    this.removeWindowScalingListener?.();
    this.removeExportIpcListeners?.();
  }
}
