import { Component, ElementRef, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { CanvasComponent } from '../ui/canvas/canvas/canvas.component';
import { ScriptComponent } from '../ui/script/script/script.component';
import { TimelineComponent } from '../ui/timeline/timeline/timeline.component';
import { TimelineActions } from '../ui/timeline/helpers/timeline.actions';
import { AboutWindowComponent } from '../ui/dialogs/about-window/about-window.component';
import { SettingsComponent } from '../ui/dialogs/settings/settings.component';
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
import { appSettings } from 'src/settings-loader';

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
    SettingsComponent,
    WebToolbarComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('QuickBoard');
  protected readonly isCanvasFullscreen = signal(false);
  protected readonly saveService = inject(SaveService);
  protected readonly dialogMode = signal<'about' | 'settings' | null>(null);
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
  private actions = inject(TimelineActions);
  private settings = appSettings;
  private removeThemeListener?: () => void;
  private removeShortcutListener?: () => void | undefined;
  private removeWindowScalingListener?: () => void;
  private removeExportIpcListeners?: () => void;

  ngOnInit(): void {
    this.removeThemeListener = this.themeService.initTheme();

    // Check if this window was opened as a dialog by the main process
    const params = new URLSearchParams(window.location.search);
    const dialog = params.get('dialog');
    if (dialog === 'about' || dialog === 'settings') {
      this.dialogMode.set(dialog as 'about' | 'settings');
      return;
    }

    this.saveService.init();

    this.removeExportIpcListeners = this.exportIpc.init();

    // for shortcuts attached to appmenu options (working through electron side)
    if(window.quickboard?.onShortcut) {
      this.removeShortcutListener = window.quickboard.onShortcut((option: string) => {
        switch (option) {
          case 'undo':
            this.undoRedo.triggerUndo();
            break;
          case 'redo':
            this.undoRedo.triggerRedo();
            break;          
          default:
            break;
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

  toggleCanvasFullscreen(): void {
    this.isCanvasFullscreen.update((fullscreen) => !fullscreen);
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
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
    if (!ctrl) {
      switch(key) {
        case 's':
          this.canvas()?.switchTools('select');
          break;
        case 'i': {
          this.canvas()?.switchTools('image');
          const input = this.canvas()?.document.createElement('input') as HTMLInputElement;
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
              this.canvas()?.toolbar()?.imageSelected.emit(target.files[0]);
            }
          };
          input.click();
          break;
        }
        case 'd':
          this.canvas()?.switchTools('pencil');
          break;
        case 'h':
          this.canvas()?.switchTools('rectangle');
          break;
        case 'e':
          this.canvas()?.switchTools('eraser');
          break;
        case 'f':
          this.canvas()?.switchTools('bucket-fill');
          break;
        case 'enter': {
          event.preventDefault();

          if(this.canvas()?.toolbar()?.isDrawToolActive()) {
            const option = this.canvas()?.toolbar()?.selectedDrawToolOption();
            if(option?.id === 'pencil') {
              this.canvas()?.switchTools('brush');
            } else {
              this.canvas()?.switchTools('pencil');
            }
          } else if (this.canvas()?.toolbar()?.isEditToolActive()) {
            const option = this.canvas()?.toolbar()?.selectedEditToolOption();
            if(option?.id === 'select') {
              this.canvas()?.switchTools('image');
              this.canvas()?.toolbar()?.onActiveSubmenuSelect('image');
            } else {
              this.canvas()?.switchTools('select');
            }
          } else if (this.canvas()?.toolbar()?.isShapeToolActive()) {
            const option = this.canvas()?.toolbar()?.selectedShapeTool();
            switch(option?.id) {
              case 'rectangle':
                this.canvas()?.switchTools('circle');
                break;
              case 'circle':
                this.canvas()?.switchTools('polygon');
                break;
              default:
                this.canvas()?.switchTools('rectangle');
            }
          } else if (this.canvas()?.toolbar()?.isEraserToolActive()){
            const option = this.canvas()?.toolbar()?.selectedEraserToolOption();
            if(option?.id === 'eraser') {
              this.canvas()?.switchTools('object-eraser');
            } else {
              this.canvas()?.switchTools('eraser');
            }
          } else if (this.canvas()?.activeTool() === 'zoom') {
            const zoomCenter = this.canvas()?.lc?.canvas?.getBoundingClientRect
              ? (() => {
                  const rect = this.canvas()?.lc!.canvas.getBoundingClientRect();
                  return { x: (rect as DOMRect).left + (rect as DOMRect).width / 2, y: (rect as DOMRect).top + (rect as DOMRect).height / 2 };
                })()
              : { x: this.canvas()?.canvasContainer().nativeElement.offsetLeft as number + (this.canvas()?.canvasContainer().nativeElement.offsetWidth as number) / 2, 
                y: this.canvas()?.canvasContainer().nativeElement.offsetTop as number + (this.canvas()?.canvasContainer().nativeElement.offsetHeight as number) / 2  };

            if (event.shiftKey) {
              this.canvas()?.viewport.adjustZoomLevel(-(this.canvas()?.viewport.getClickZoomStep() as number), zoomCenter);
            } else {
              this.canvas()?.viewport.adjustZoomLevel(this.canvas()?.viewport.getClickZoomStep() as number, zoomCenter);
            }
          }
          break;
        }
        case 'tab': {
          event.preventDefault();
          if(this.canvas()?.toolbar()?.isDrawToolActive()) {
            this.canvas()?.switchTools(this.canvas()?.toolbar()?.selectedShapeTool()?.id as string);
          } else if (this.canvas()?.toolbar()?.isShapeToolActive()) {
            this.canvas()?.switchTools(this.canvas()?.toolbar()?.selectedEraserToolOption()?.id as string);
          } else if (this.canvas()?.toolbar()?.isEraserToolActive()) {
            this.canvas()?.switchTools('bucket-fill');
          } else if (this.canvas()?.toolbar()?.isEditToolActive()) {
            this.canvas()?.switchTools(this.canvas()?.toolbar()?.selectedDrawToolOption()?.id as string);
          } else if (this.canvas()?.activeTool() === 'bucket-fill') {
            this.canvas()?.switchTools('zoom');
          } else if (this.canvas()?.activeTool() === 'zoom') {
            this.canvas()?.switchTools('select'); 
          }
          break;
        } 
        default:
          return;
      }
    }

    if (this.isEditableTarget(event)) {
      const target = event.target as HTMLElement | null;
      // Allow global undo for EditorJS so its history interleaves perfectly with the canvas,
      // but let regular inputs/textareas use the browser's native undo.
      if (!target?.closest('#editorjs')) {
        return;
      }
    }

    event.preventDefault();
    switch (key) {
      case 'z': {
        if (event.shiftKey) {
          // Redo
          this.undoRedo.triggerRedo();
        } else {
          // Undo
          this.undoRedo.triggerUndo();
        }
        break;
      }
      case 'y': {
        this.undoRedo.triggerRedo();
        break;
      }
      case 'n': {
        if (event.shiftKey) {
          // Add Lane
          this.store.addAudioLane();
        } else {
          // Add Board
          this.store.addBoard();
        }
        break;
      }
      case 'd': {
        const currentBoardId = this.store.currentBoardId();
        if (currentBoardId) {
          this.actions.duplicateBoard(currentBoardId);
        }
        break;
      }
      case 'backspace': {
        if (event.shiftKey) {
          this.canvas()?.requestClearCanvas();
        } else {
          const currentBoardId = this.store.currentBoardId();
          if (currentBoardId) {
            this.actions.deleteBoard(currentBoardId);
          }
        }
        break;
      }
      case 's': {
        if (event.shiftKey) {
          window.quickboard?.requestSaveAs();
        } else {
          window.quickboard?.requestSave();
        }
        break;
      }
      case 'o': 
        window.quickboard?.loadIn();
        break;
      case 'e':
        window.quickboard?.requestExport();
        break;
      default:
        return;
    };

  }

  ngOnDestroy(): void {
    this.saveService.destroy();
    this.removeThemeListener?.();
    this.removeShortcutListener?.();
    this.removeWindowScalingListener?.();
    this.removeExportIpcListeners?.();
  }
}
