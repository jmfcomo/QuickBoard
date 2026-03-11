import { Injectable, computed, inject, signal } from '@angular/core';
import { ImageExportService } from './export-image.service';
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
  private readonly imageExport = inject(ImageExportService);

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
          this.settingsBoardCount.set(this.imageExport.store.boards().length);
          this.settingsVisible.set(true);
        }),
      );
    }

    return () => cleanups.forEach((fn) => fn());
  }

  async onSettingsConfirm(settings: ExportSettings): Promise<void> {
    this.settingsVisible.set(false);
    const { resolution, prefix, dirPath } = settings;

    if (this.successTimeout !== null) {
      clearTimeout(this.successTimeout);
      this.successTimeout = null;
    }

    // Persist the chosen path for next export
    try {
      localStorage.setItem('quickboard:lastExportPath', dirPath);
    } catch {
      // localStorage may be unavailable (e.g. private browsing); silently ignore
    }
    this._lastExportPath.set(dirPath);

    this.exportTotal.set(this.imageExport.store.boards().length);
    this.exportCurrent.set(0);
    this.exportFileName.set('');
    this.exportStatus.set('exporting');
    this.exportVisible.set(true);

    try {
      await this.imageExport.renderBoardsAtScaleStreaming(
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

  onDismiss(): void {
    if (this.successTimeout !== null) {
      clearTimeout(this.successTimeout);
      this.successTimeout = null;
    }
    this.exportVisible.set(false);
  }
}
