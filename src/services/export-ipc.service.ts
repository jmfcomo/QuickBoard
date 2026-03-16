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

  setProjectName(name: string): void {
    this.projectName.set(name);
  }

  init(): () => void {
    const cleanups: (() => void)[] = [];

    if (window.quickboard?.onRequestPngExport) {
      cleanups.push(
        window.quickboard.onRequestPngExport((payload) => {
          this.systemDocumentsPath.set(payload.defaultDirPath ?? '');
          this.settingsBoardCount.set(this.exportService.store.boards().length);
          this.settingsMode.set('png');
          this.settingsVisible.set(true);
        }),
      );
    }

    if (window.quickboard?.onRequestVideoExport) {
      cleanups.push(
        window.quickboard.onRequestVideoExport((payload) => {
          this.systemDocumentsPath.set(payload.defaultDirPath ?? '');
          this.settingsBoardCount.set(this.exportService.store.boards().length);
          this.settingsMode.set('video');
          this.settingsVisible.set(true);

          // Debug trigger
          setTimeout(() => {
            this.onSettingsConfirm({
              resolution: { width: 3840, height: 2160, scale: 2, label: '4K' },
              prefix: 'test4k',
              dirPath: payload.defaultDirPath ?? '',
            });
          }, 1000);
        }),
      );
    }

    return () => cleanups.forEach((fn) => fn());
  }

  async onSettingsConfirm(settings: ExportSettings): Promise<void> {
    if (this.settingsMode() === 'video') {
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
    this.exportCurrent.set(0);
    this.exportFileName.set('');
    this.exportStatus.set('exporting');
    this.exportVisible.set(true);

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
      );
      this.exportStatus.set('success');
      this.successTimeout = setTimeout(() => {
        this.successTimeout = null;
        this.exportVisible.set(false);
      }, 2500);
    } catch (err) {
      this.exportStatus.set('error');
      this.exportMessage.set(err instanceof Error ? err.message : String(err));
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

    const totalFrames = this.exportService.store.boards().length;
    this.exportTotal.set(totalFrames);
    this.exportCurrent.set(0);
    this.exportFileName.set('');
    this.exportMessage.set('');
    this.exportStatus.set('exporting');
    this.exportVisible.set(true);

    try {
      const mp4Bytes = await this.exportService.exportVideoWithSettings(
        settings,
        (current, total, fileName) => {
          this.exportCurrent.set(current);
          this.exportTotal.set(total);
          this.exportFileName.set(fileName);
          this.exportMessage.set('');
        },
        (message) => {
          this.exportCurrent.set(totalFrames);
          this.exportMessage.set(message);
          this.exportFileName.set('');
        },
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

      this.exportStatus.set('success');
      this.successTimeout = setTimeout(() => {
        this.successTimeout = null;
        this.exportVisible.set(false);
      }, 2500);
    } catch (err) {
      console.error('Video export failed:', err);
      this.exportStatus.set('error');
      this.exportMessage.set(err instanceof Error ? err.message : String(err));
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
