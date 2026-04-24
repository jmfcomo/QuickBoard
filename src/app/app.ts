import {
  Component,
  ElementRef,
  EffectRef,
  Injector,
  OnDestroy,
  OnInit,
  inject,
  signal,
  viewChild,
  effect,
} from '@angular/core';
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
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { NativeToolbarService, type ThemeId } from '../services/native-toolbar.service';
import { AppShortcutsService } from 'src/services';
import { PlatformFileService } from '../services/platform-file.service';
import { FileSaver } from '../services/file-saver.plugin';

@Component({
  selector: 'app-root',
  host: {
    '[class.dialog-mode]': 'dialogMode() !== null',
    '(document:keydown)': 'onKeyDown($event)',
    '[class.is-web]': 'useSafeArea',
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
  protected readonly isIos = Capacitor.getPlatform() === 'ios';
  protected readonly showWebToolbar = !this.isElectron && !this.isIos;
  protected readonly useSafeArea = !this.isElectron;
  private readonly undoRedo = inject(UndoRedoService);
  private readonly playback = inject(PlaybackService);
  private readonly nativeToolbar = inject(NativeToolbarService);
  private readonly platformFile = inject(PlatformFileService);
  private readonly injector = inject(Injector);
  private store = inject(AppStore);
  private actions = inject(TimelineActions);
  private settings = appSettings;
  private readonly shortcuts = inject(AppShortcutsService);
  private readonly platformFile = inject(PlatformFileService);
  private removeThemeListener?: () => void;
  private removeShortcutListener?: () => void | undefined;
  private removeNativeMenuListener?: () => void;
  private removeWindowScalingListener?: () => void;
  private removeExportIpcListeners?: () => void;
  private iosAutosaveTimer: ReturnType<typeof setInterval> | null = null;
  private iosSaveInProgress = false;
  private iosHasActiveDocument = false;
  private iosInitialSavePrompted = false;
  private iosInitialSaveEffectRef?: EffectRef;
  private androidFileListener?: PluginListenerHandle;

  constructor() {
    effect(() => {
      if (this.isIos) {
        this.nativeToolbar.setTitle(this.title());
        this.nativeToolbar.configureMenu(this.themeService.currentTheme() as ThemeId);
      }
    });
  }

  ngOnInit(): void {
    this.removeThemeListener = this.themeService.initTheme();

    if (this.isIos) {
      void this.nativeToolbar.onMenuAction((actionId) => {
        void this.handleNativeMenuAction(actionId);
      }).then((removeListener) => {
        this.removeNativeMenuListener = removeListener;
      });
    }

    // Check if this window was opened as a dialog by the main process
    const params = new URLSearchParams(window.location.search);
    const dialog = params.get('dialog');
    if (dialog === 'about' || dialog === 'settings') {
      this.dialogMode.set(dialog as 'about' | 'settings');
      return;
    }

    this.saveService.init();

    if (this.isIos) {
      this.initIosSaveFlow();
    }

    this.removeExportIpcListeners = this.exportIpc.init();

    // for shortcuts attached to appmenu options (working through electron side)
    if (window.quickboard?.onShortcut) {
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
      this.el.nativeElement as HTMLElement
    );

    // Android: open a .sbd file that was tapped in the file manager.
    if (Capacitor.getPlatform() === 'android') {
      void this.platformFile.checkAndroidOpenFile().then((file) => {
        if (file) void this.openFile(file);
      });
      FileSaver.addListener('fileOpened', (event) => {
        const binary = atob(event.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        void this.openFile({ data: bytes, name: event.fileName });
      }).then((handle) => {
        this.androidFileListener = handle;
      });
    }
  }

  private async openFile(file: { data: Uint8Array; name: string }): Promise<void> {
    try {
      await this.sbd.loadSbdZip(file.data);
      this.undoRedo.clear();
      const stem = file.name.replace(/\.[^.]+$/, '');
      if (stem) this.exportIpc.setProjectName(stem);
    } catch (err) {
      console.error('Failed to open file:', err);
      window.alert('Failed to open file: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  onResizeMouseDown(event: MouseEvent): void {
    this.windowScalingService.onResizeMouseDown(event, this.el.nativeElement as HTMLElement);
  }

  onResizeTouchStart(event: TouchEvent): void {
    this.windowScalingService.onResizeTouchStart(event, this.el.nativeElement as HTMLElement);
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

    if (key === 'escape' && this.dialogMode() !== null) {
      event.preventDefault();
      this.closeDialog();
      return;
    }

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

    if (this.isEditableTarget(event)) {
      const target = event.target as HTMLElement | null;
      // Allow global undo for EditorJS so its history interleaves perfectly with the canvas,
      // but let regular inputs/textareas use the browser's native undo.
      if (!target?.closest('#editorjs')) {
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl) {
        return;
      }
    }

    const ctrl = event.ctrlKey || event.metaKey;
    // actions depending on ctrl/cmd key is active
    if (ctrl) {
      this.shortcuts.onCtrlKeyShortcuts(event, this.canvas() as CanvasComponent, event.shiftKey);
    } else if (event.altKey) {
      this.shortcuts.onAltKeyShortcuts(event);
    } else {
      this.shortcuts.onNotCtrlKeyShortcuts(event, this.canvas() as CanvasComponent, event.shiftKey);
    }
  }

  ngOnDestroy(): void {
    this.saveService.destroy();
    this.removeThemeListener?.();
    this.removeShortcutListener?.();
    this.removeNativeMenuListener?.();
    this.removeWindowScalingListener?.();
    this.removeExportIpcListeners?.();
    this.iosInitialSaveEffectRef?.destroy();
    if (this.iosAutosaveTimer) {
      clearInterval(this.iosAutosaveTimer);
      this.iosAutosaveTimer = null;
    }
    void this.androidFileListener?.remove();
  }

  private getIosSavingSettings(): {
    autosave: boolean;
    autosaveDurationMs: number;
    initialSave: boolean;
  } {
    const saving = this.settings.saving;
    const resolvedAutosave = saving?.autosave ?? this.settings.autosave ?? true;
    const resolvedAutosaveDuration =
      saving?.autosaveDuration ?? this.settings.autosaveDuration ?? 300_000;
    const autosaveDurationMs =
      typeof resolvedAutosaveDuration === 'number' && resolvedAutosaveDuration > 0
        ? resolvedAutosaveDuration
        : 300_000;

    return {
      autosave: resolvedAutosave,
      autosaveDurationMs,
      initialSave: saving?.initialSave ?? true,
    };
  }

  private initIosSaveFlow(): void {
    this.iosInitialSavePrompted = false;

    this.iosInitialSaveEffectRef?.destroy();
    this.iosInitialSaveEffectRef = effect(
      () => {
        const hasUndoHistory = this.undoRedo.canUndo();

        if (!hasUndoHistory) {
          this.iosInitialSavePrompted = false;
          return;
        }

        if (!this.getIosSavingSettings().initialSave) {
          return;
        }

        if (this.iosInitialSavePrompted || this.iosHasActiveDocument || this.iosSaveInProgress) {
          return;
        }

        this.iosInitialSavePrompted = true;
        void this.triggerIosSave(false);
      },
      { injector: this.injector },
    );

    const { autosave, autosaveDurationMs } = this.getIosSavingSettings();
    if (autosave) {
      this.iosAutosaveTimer = setInterval(() => {
        if (!this.iosHasActiveDocument || this.iosSaveInProgress) {
          return;
        }
        void this.triggerIosSave(false, false, true);
      }, autosaveDurationMs);
    }
  }

  private async handleNativeMenuAction(actionId: string): Promise<void> {
    switch (actionId) {
      case 'app.about':
        this.openMobileDialog('about');
        return;
      case 'app.settings':
        this.openMobileDialog('settings');
        return;
      case 'file.save':
        await this.triggerIosSave(false);
        return;
      case 'file.saveAs':
        await this.triggerIosSave(true);
        return;
      case 'file.load':
        await this.triggerIosLoad();
        return;
      case 'file.export':
        this.triggerIosExport();
        return;
      case 'edit.undo':
        this.undoRedo.triggerUndo();
        return;
      case 'edit.redo':
        this.undoRedo.triggerRedo();
        return;
      default:
        if (actionId.startsWith('theme.')) {
          const [, theme] = actionId.split('.') as [string, ThemeId];
          this.themeService.applyTheme(theme);
        }
    }
  }

  private openMobileDialog(dialog: 'about' | 'settings'): void {
    this.exportIpc.onSettingsCancel();
    this.dialogMode.set(dialog);
  }

  protected closeDialog(): void {
    this.dialogMode.set(null);
  }

  private async triggerIosSave(
    promptForName: boolean,
    showToast = true,
    isAutosave = false,
  ): Promise<boolean> {
    if (this.iosSaveInProgress) {
      return false;
    }

    this.iosSaveInProgress = true;

    try {
      const isModernWeb = !window.quickboard && 'showSaveFilePicker' in window;

      if (promptForName && !isModernWeb && !this.isIos) {
        const newName = window.prompt(
          'Enter file name without extension:',
          this.exportIpc.defaultPrefix() || 'project',
        );
        if (newName) {
          this.exportIpc.setProjectName(newName);
        } else {
          return false;
        }
      }

      this.canvas()?.flushCurrentBoardState(true);

      const zipData = await this.sbd.buildSbdZip();
      const fileName = `${this.exportIpc.defaultPrefix() || 'project'}.sbd`;
      const saved = await this.platformFile.saveFile(zipData, fileName, undefined, promptForName);

      if (!saved) {
        if (!isAutosave) {
          this.iosInitialSavePrompted = false;
        }
        return false;
      }

      this.iosHasActiveDocument = true;

      if (showToast) {
        this.saveService.saveStatus.set('Saved!');
        setTimeout(() => {
          if (this.saveService.saveStatus() === 'Saved!') {
            this.saveService.saveStatus.set(null);
          }
        }, 2000);
      }

      return true;
    } catch (error) {
      console.error('Save failed from native iPad menu', error);
      window.alert(`Failed to save file: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      this.iosSaveInProgress = false;
    }
  }

  private async triggerIosLoad(): Promise<void> {
    try {
      this.canvas()?.prepareForProjectLoad();
      const result = await this.platformFile.pickAndReadFile('.sbd');
      if (!result) {
        return;
      }

      await this.sbd.loadSbdZip(result.data);
      this.undoRedo.clear();

      const stem = result.name.replace(/\.[^.]+$/, '');
      if (stem) {
        this.exportIpc.setProjectName(stem);
      }

      this.iosHasActiveDocument = true;
      this.iosInitialSavePrompted = true;
    } catch (error) {
      console.error('Load failed from native iPad menu', error);
      window.alert(`Failed to load file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private triggerIosExport(): void {
    this.dialogMode.set(null);
    this.exportIpc.settingsBoardCount.set(this.store.boards().length);
    this.exportIpc.settingsVisible.set(true);
  }
}
