import { Component, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { CanvasComponent } from '../ui/canvas/canvas/canvas.component';
import { ScriptComponent } from '../ui/script/script/script.component';
import { TimelineComponent } from '../ui/timeline/timeline/timeline.component';
import { VersionDialogComponent, AboutDialogComponent } from '../ui/dialogs';
import type { VersionInfo, AboutInfo } from '../ui/dialogs';
import { SbdService } from './app.sbd.service';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-root',
  imports: [
    CanvasComponent,
    ScriptComponent,
    TimelineComponent,
    VersionDialogComponent,
    AboutDialogComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('QuickBoard');
  protected readonly versionInfo = signal<VersionInfo | null>(null);
  protected readonly aboutInfo = signal<AboutInfo | null>(null);
  private readonly canvas = viewChild(CanvasComponent);
  private readonly sbd = inject(SbdService);
  // for listening to the electron data so that it can be processed in angular
  private removeRequestSaveListener?: () => void;
  private removeLoadDataListener?: () => void;
  private removeThemeListener?: () => void;
  private removeUndoListener?: () => void;
  private removeRedoListener?: () => void;
  private removeShowVersionListener?: () => void;
  private removeShowAboutListener?: () => void;
  private readonly themeService = inject(ThemeService);

  ngOnInit() {
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
        } catch (err) {
          console.error('Failed to load data from file:', err);
          const message = err instanceof Error ? err.message : String(err);
          window.alert(`Failed to load file: ${message}`);
        }
      });
    }

    this.removeThemeListener = this.themeService.initTheme();

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

    if (window.quickboard?.onShowVersion) {
      this.removeShowVersionListener = window.quickboard.onShowVersion((data) => {
        this.versionInfo.set(data);
      });
    }

    if (window.quickboard?.onShowAbout) {
      this.removeShowAboutListener = window.quickboard.onShowAbout((data) => {
        this.aboutInfo.set(data);
      });
    }
  }

  ngOnDestroy() {
    this.removeRequestSaveListener?.();
    this.removeLoadDataListener?.();
    this.removeThemeListener?.();
    this.removeUndoListener?.();
    this.removeRedoListener?.();
    this.removeShowVersionListener?.();
    this.removeShowAboutListener?.();
  }
}
