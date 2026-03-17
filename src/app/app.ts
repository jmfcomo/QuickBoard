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

@Component({
  selector: 'app-root',
  host: { '[class.dialog-mode]': 'dialogMode() !== null' },
  imports: [
    CanvasComponent,
    ScriptComponent,
    TimelineComponent,
    ExportProgressComponent,
    ExportSettingsComponent,
    AboutWindowComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('QuickBoard');
  protected readonly dialogMode = signal<'about' | null>(null);
  private readonly canvas = viewChild(CanvasComponent);
  private readonly sbd = inject(SbdService);
  private readonly sbd = inject(SbdService);
  private readonly el = inject(ElementRef);
  private readonly canvas = viewChild(CanvasComponent);
  private readonly themeService = inject(ThemeService);
  private readonly windowScalingService = inject(WindowScalingService);
  protected readonly exportIpc = inject(ExportIpcService);
  private removeRequestSaveListener?: () => void;
  private removeLoadDataListener?: () => void;
  private removeThemeListener?: () => void;
  private removeUndoListener?: () => void;
  private removeRedoListener?: () => void;
  private removeWindowScalingListener?: () => void;
  private removeExportIpcListeners?: () => void;

  ngOnInit() {
    this.removeThemeListener = this.themeService.initTheme();

    // Check if this window was opened as a dialog by the main process
    const params = new URLSearchParams(window.location.search);
    const dialog = params.get('dialog');
    if (dialog === 'about') {
      this.dialogMode.set(dialog);
      return;
    }

  ngOnInit(): void {
    if (window.quickboard?.onRequestSave) {
      this.removeRequestSaveListener = window.quickboard.onRequestSave(async (payload) => {
        try {
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
          if (payload.isBinary) {
            await this.sbd.loadSbdZip(payload.content);
          } else {
            // Legacy plain-JSON fallback
            this.sbd.loadLegacyJson(payload.content);
          }
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

    this.removeThemeListener = this.themeService.initTheme();
    this.removeExportIpcListeners = this.exportIpc.init();

    if (window.quickboard?.onUndo) {
      this.removeUndoListener = window.quickboard.onUndo(() => {
        this.canvas()?.undoStroke();
      });
    }

    if (window.quickboard?.onRedo) {
      this.removeRedoListener = window.quickboard.onRedo(() => {
        this.canvas()?.redoStroke();
      });
    }

    this.removeWindowScalingListener = this.windowScalingService.init(
      this.el.nativeElement as HTMLElement,
    );
  }

  onResizeMouseDown(event: MouseEvent): void {
    this.windowScalingService.onResizeMouseDown(event, this.el.nativeElement as HTMLElement);
  }

  ngOnDestroy(): void {
    this.removeRequestSaveListener?.();
    this.removeLoadDataListener?.();
    this.removeThemeListener?.();
    this.removeUndoListener?.();
    this.removeRedoListener?.();
    this.removeWindowScalingListener?.();
    this.removeExportIpcListeners?.();
  }
}
