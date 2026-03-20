import { Injectable, computed, inject, signal } from '@angular/core';
import { ExportService } from './export.service';
import type { ExportSettings } from '../ui/export-settings/export-resolutions';

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

    this.exportTotal.set(this.exportService.store.boards().length);
    this.exportFrameCount.set(this.exportService.store.boards().length);
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

    this.exportTotal.set(100);
    this.exportFrameCount.set(this.exportService.store.boards().length);
    this.exportCurrent.set(0);
    this.exportFileName.set('');
    this.exportMessage.set('');
    this.exportStatus.set('exporting');
    this.exportVisible.set(true);

    this.abortController = new AbortController();

    try {
      const mp4Bytes = await this.exportService.exportVideoWithSettings(
        settings,
        (current, total, fileName) => {
          // Frame rendering: 0–20%
          this.exportCurrent.set(Math.round((current / total) * 20));
          this.exportFileName.set(fileName);
          this.exportMessage.set('Rendering frames...');
        },
        (message) => {
          this.exportMessage.set(message);
          this.exportFileName.set('');
          if (message === 'Encoding video...') {
            this.exportCurrent.set(20);
          } else if (message === 'Processing audio...') {
            this.exportCurrent.set(20);
          } else if (message === 'Saving file...') {
            this.exportCurrent.set(96);
          }
        },
        (progress) => {
          // Encoding: 20–95%
          this.exportCurrent.set(20 + Math.round(progress * 0.75));
          this.exportMessage.set('Encoding video...');
        },
        this.abortController.signal,
      );

      const outputName = `${prefix}.mp4`;
      this.exportCurrent.set(98);
      const result = await window.quickboard?.sendVideoFile({
        dirPath,
        name: outputName,
        buffer: mp4Bytes,
      });

      if (!result?.success) {
        throw new Error(result?.message ?? 'Failed to save video file.');
      }

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
