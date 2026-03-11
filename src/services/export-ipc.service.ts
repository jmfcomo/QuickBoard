import { Injectable, inject, signal } from '@angular/core';
import { ImageExportService } from './export-image.service';
import type { ExportResolution } from '../ui/export-settings/export-resolutions';

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

  private pendingDirPath: string | null = null;

  init(): () => void {
    const cleanups: (() => void)[] = [];

    if (window.quickboard?.onRequestPngExport) {
      cleanups.push(
        window.quickboard.onRequestPngExport((payload) => {
          this.pendingDirPath = payload.dirPath;
          this.settingsBoardCount.set(this.imageExport.store.boards().length);
          this.settingsVisible.set(true);
        }),
      );
    }

    if (window.quickboard?.onPngExportProgress) {
      cleanups.push(
        window.quickboard.onPngExportProgress((payload) => {
          this.exportCurrent.set(payload.current);
          this.exportFileName.set(payload.fileName);
        }),
      );
    }

    if (window.quickboard?.onPngExportResult) {
      cleanups.push(
        window.quickboard.onPngExportResult((payload) => {
          if (payload.success) {
            this.exportStatus.set('success');
            setTimeout(() => this.exportVisible.set(false), 2500);
          } else {
            this.exportStatus.set('error');
            this.exportMessage.set(payload.message ?? 'An unknown error occurred.');
          }
        }),
      );
    }

    return () => cleanups.forEach((fn) => fn());
  }

  async onSettingsConfirm(resolution: ExportResolution): Promise<void> {
    this.settingsVisible.set(false);
    const dirPath = this.pendingDirPath;
    this.pendingDirPath = null;
    if (!dirPath) return;

    this.exportTotal.set(this.imageExport.store.boards().length);
    this.exportCurrent.set(0);
    this.exportFileName.set('');
    this.exportStatus.set('exporting');
    this.exportVisible.set(true);

    const frames = await this.imageExport.renderBoardsAtScale(
      resolution.scale,
      (current, _total, fileName) => {
        this.exportCurrent.set(current);
        this.exportFileName.set(fileName);
      },
    );

    window.quickboard?.sendPngExportData({ dirPath, frames });
  }

  onSettingsCancel(): void {
    this.settingsVisible.set(false);
    this.pendingDirPath = null;
  }
}
