import { Injectable, computed, inject, signal } from '@angular/core';
import { ExportService } from './export.service';
import type { ExportSettings } from '../ui/export-settings/export-resolutions';
import { NewSettings } from 'src/ui/dialogs/settings-window/settings-inputs';

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

@Injectable({ providedIn: 'root' })
export class ExportIpcService {
  private readonly exportService = inject(ExportService);

  readonly settingsMode = signal<'png' | 'video'>('png');
  readonly settingsVisible = signal(false);
  readonly settingsBoardCount = signal(0);

  readonly theme = signal<'system' | 'white' | 'light' | 'sepia' | 'dark' | 'black'>('system');
  readonly warning = signal<boolean>(true);
  readonly framerate = signal<'30' | '24' | '60'>('30');

  readonly exportVisible = signal(false);
  readonly exportStatus = signal<'exporting' | 'success' | 'error'>('exporting');
  readonly exportCurrent = signal(0);
  readonly exportTotal = signal(0);
  readonly exportFrameCount = signal(0);
  readonly exportFileName = signal('');
  readonly exportMessage = signal('');

  readonly projectName = signal('');
  readonly defaultPrefix = computed(() => this.projectName() || 'board');

  private readonly systemDocumentsPath = signal('');
  private readonly _lastExportPath = signal<string>(
    (() => {
      try {
        return localStorage.getItem('quickboard:lastExportPath') ?? '';
      } catch {
        return '';
      }
    })(),
  );
  readonly defaultDirPath = computed(() => this._lastExportPath() || this.systemDocumentsPath());
  private successTimeout: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;

  setProjectName(name: string): void {
    this.projectName.set(name);
  }

  init(): () => void {
    const cleanups: (() => void)[] = [];

    if (window.quickboard?.onRequestExport) {
      cleanups.push(
        window.quickboard.onRequestExport((payload) => {
          this.systemDocumentsPath.set(payload.defaultDirPath ?? '');
          this.settingsBoardCount.set(this.exportService.store.boards().length);
          this.settingsVisible.set(true);
        }),
      );
    }

    return () => cleanups.forEach((fn) => fn());
  }

  async onSettingsConfirm(settings: ExportSettings): Promise<void> {
    this.settingsMode.set(settings.format);
    if (settings.format === 'video') {
      await this.runVideoExport(settings);
    } else {
      await this.runPngExport(settings);
    }
  }

  async onApplySettings(settings: NewSettings): Promise<void> {
    this.theme.set(settings.theme);
    this.warning.set(settings.warning);
    this.framerate.set(settings.framerate);
  }

  private async runPngExport(settings: ExportSettings): Promise<void> {
    this.settingsVisible.set(false);
    const { resolution, prefix, dirPath } = settings;

    if (this.successTimeout !== null) {
      clearTimeout(this.successTimeout);
      this.successTimeout = null;
    }

    try {
      localStorage.setItem('quickboard:lastExportPath', dirPath);
    } catch {
      /* empty */
    }
    this._lastExportPath.set(dirPath);

    const frameCount = settings.endIndex - settings.startIndex + 1;
    this.exportTotal.set(frameCount);
    this.exportFrameCount.set(frameCount);
    this.exportCurrent.set(0);
    this.exportFileName.set('');
    this.exportStatus.set('exporting');
    this.exportVisible.set(true);
    this.abortController = new AbortController();
    try {
      await this.exportService.renderBoardsAtScaleStreaming(
        resolution.scale,
        prefix,
        async (frame, current, total) => {
          const buffer = dataUrlToUint8Array(frame.dataUrl);
          const result = await window.quickboard?.sendPngExportFrame({
            dirPath,
            name: frame.name,
            buffer,
            index: current - 1,
            total,
          });
          if (!result?.success) {
            throw new Error(result?.message ?? 'An unknown error occurred.');
          }
          this.exportCurrent.set(current);
          this.exportFileName.set(frame.name);
        },
        'image/png',
        this.abortController.signal,
        settings.startIndex,
        settings.endIndex,
      );
      this.exportStatus.set('success');
      this.successTimeout = setTimeout(() => {
        this.successTimeout = null;
        this.exportVisible.set(false);
      }, 2500);
    } catch (err) {
      if (this.abortController?.signal.aborted) {
        this.exportVisible.set(false);
      } else {
        this.exportStatus.set('error');
        this.exportMessage.set(err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.abortController = null;
    }
  }

  onSettingsCancel(): void {
    this.settingsVisible.set(false);
  }

  private async runVideoExport(settings: ExportSettings): Promise<void> {
    this.settingsVisible.set(false);
    const { prefix, dirPath } = settings;

    if (this.successTimeout !== null) {
      clearTimeout(this.successTimeout);
      this.successTimeout = null;
    }

    try {
      localStorage.setItem('quickboard:lastExportPath', dirPath);
    } catch {
      /* empty */
    }
    this._lastExportPath.set(dirPath);

    this.exportTotal.set(settings.endIndex - settings.startIndex + 1);
    this.exportFrameCount.set(settings.endIndex - settings.startIndex + 1);
    this.exportCurrent.set(0);
    this.exportFileName.set('');
    this.exportMessage.set('');
    this.exportStatus.set('exporting');
    this.exportVisible.set(true);

    this.abortController = new AbortController();

    try {
      const frameCount = settings.endIndex - settings.startIndex + 1;
      const mp4Bytes = await this.exportService.exportVideoWithSettings(
        settings,
        (current, total, fileName) => {
          this.exportCurrent.set(current);
          this.exportFileName.set(fileName);
          this.exportMessage.set(`Rendering frames... (${current}/${total})`);
        },
        (message) => {
          this.exportMessage.set(message);
          this.exportFileName.set('');
          if (message === 'Encoding video...' || message === 'Processing audio...') {
            this.exportCurrent.set(frameCount);
          } else if (message === 'Saving file...') {
            this.exportCurrent.set(frameCount);
          }
        },
        (progress) => {
          this.exportMessage.set(`Encoding video... ${progress}%`);
        },
        this.abortController.signal,
      );

      const outputName = `${prefix}.mp4`;
      const result = await window.quickboard?.sendVideoFile({
        dirPath,
        name: outputName,
        buffer: mp4Bytes,
      });

      if (!result?.success) {
        throw new Error(result?.message ?? 'Failed to save video file.');
      }

      this.exportCurrent.set(frameCount);

      this.exportCurrent.set(100);
      this.exportStatus.set('success');
      this.successTimeout = setTimeout(() => {
        this.successTimeout = null;
        this.exportVisible.set(false);
      }, 2500);
    } catch (err) {
      if (this.abortController?.signal.aborted) {
        this.exportVisible.set(false);
      } else {
        console.error('Video export failed:', err);
        this.exportStatus.set('error');
        this.exportMessage.set(err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.abortController = null;
    }
  }

  onCancelExport(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  onDismiss(): void {
    if (this.successTimeout !== null) {
      clearTimeout(this.successTimeout);
      this.successTimeout = null;
    }
    this.exportVisible.set(false);
  }
}
