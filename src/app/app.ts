import { Component, ElementRef, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { CanvasComponent } from '../ui/canvas/canvas/canvas.component';
import { ScriptComponent } from '../ui/script/script/script.component';
import { TimelineComponent } from '../ui/timeline/timeline/timeline.component';
import { AboutWindowComponent } from '../ui/dialogs/about-window/about-window.component';
import { ExportProgressComponent } from '../ui/export-progress/export-progress.component';
import { ExportSettingsComponent } from '../ui/export-settings/export-settings.component';
import { AppStore } from 'src/data';
import { SbdService } from './app.sbd.service';
import { ThemeService } from '../services/theme.service';
import { SaveService } from '../services/save.service';
import { ExportIpcService } from '../services/export-ipc.service';
import { WindowScalingService } from '../services/window-scaling.service';
import { UndoRedoService } from '../services/undo-redo.service';
import { PlaybackService } from '../services/playback.service';
import { WebToolbarComponent } from '../ui/web-toolbar/web-toolbar.component';

@Component({
  selector: 'app-root',
  host: {
    '[class.dialog-mode]': 'dialogMode() !== null',
    '(document:keydown)': 'onKeyDown($event)',
    '[class.is-web]': '!isElectron',
  },
  imports: [
    CanvasComponent,
    ScriptComponent,
    TimelineComponent,
    ExportProgressComponent,
    ExportSettingsComponent,
    AboutWindowComponent,
    WebToolbarComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('QuickBoard');
  protected readonly saveService = inject(SaveService);
  protected readonly dialogMode = signal<'about' | null>(null);
  private readonly canvas = viewChild(CanvasComponent);
  private readonly sbd = inject(SbdService);
  private readonly el = inject(ElementRef);
  private readonly themeService = inject(ThemeService);
  private readonly windowScalingService = inject(WindowScalingService);
  protected readonly exportIpc = inject(ExportIpcService);
  protected readonly isElectron = !!window.quickboard;
  private readonly undoRedo = inject(UndoRedoService);
  private readonly playback = inject(PlaybackService);
  private store = inject(AppStore);
  private removeThemeListener?: () => void;
  private removeUndoListener?: () => void;
  private removeRedoListener?: () => void;
  private removeAddBoardListener?: () => void;
  private removeAddLaneListener?: () => void;
  private removeClearBoardListener?: () => void;
  private removeWindowScalingListener?: () => void;
  private removeExportIpcListeners?: () => void;

  ngOnInit(): void {
    this.removeThemeListener = this.themeService.initTheme();

    // Check if this window was opened as a dialog by the main process
    const params = new URLSearchParams(window.location.search);
    const dialog = params.get('dialog');
    if (dialog === 'about') {
      this.dialogMode.set(dialog);
      return;
    }

    this.saveService.init();

    this.removeExportIpcListeners = this.exportIpc.init();

    if(window.quickboard?.onNewBoard) {
      this.removeAddBoardListener = window.quickboard.onNewBoard(() => {
        this.store.addBoard();
      });
    }

    if(window.quickboard?.onNewLane) {
      this.removeAddLaneListener = window.quickboard.onNewLane(() => {
        this.store.addAudioLane();
      });
    }
    
    if(window.quickboard?.onClearBoard) {
      this.removeClearBoardListener = window.quickboard.onClearBoard(() => {
        this.canvas()?.requestClearCanvas();
      });
    }

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
    this.saveService.destroy();
    this.removeThemeListener?.();
    this.removeUndoListener?.();
    this.removeRedoListener?.();
    this.removeAddBoardListener?.();
    this.removeAddLaneListener?.();
    this.removeClearBoardListener?.();
    this.removeWindowScalingListener?.();
    this.removeExportIpcListeners?.();
  }
}
