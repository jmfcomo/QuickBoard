import { Component, computed, effect, input, output, signal } from '@angular/core';
import { EXPORT_RESOLUTIONS } from './export-resolutions';
import type { ExportSettings } from './export-resolutions';

@Component({
  selector: 'app-export-settings',
  standalone: true,
  imports: [],
  templateUrl: './export-settings.component.html',
  styleUrl: './export-settings.component.css',
})
export class ExportSettingsComponent {
  visible = input<boolean>(false);
  boardCount = input<number>(0);
  defaultPrefix = input<string>('board');
  defaultDirPath = input<string>('');
  exportType = input<'png' | 'video'>('png');
  confirmExport = output<ExportSettings>();
  cancelExport = output<void>();

  protected readonly resolutions = EXPORT_RESOLUTIONS;
  protected selectedIndex = signal(Math.min(2, this.resolutions.length - 1)); // default: Full HD
  protected startIndex = signal(0);
  protected endIndex = signal(this.boardCount() - 1);
  protected startRaw = signal('1');
  protected endRaw = signal(String(this.boardCount()));
  protected selectedFormat = signal<'png' | 'video'>('png');
  protected prefix = signal('board');
  protected dirPath = signal('');
  protected isBrowsing = signal(false);

  protected readonly selectedResolution = computed(() => {
    const idx = Math.max(0, Math.min(this.selectedIndex(), this.resolutions.length - 1));
    return this.resolutions[idx] ?? this.resolutions[0];
  });

  constructor() {
    // Sync internal signals from inputs each time the dialog opens.
    effect(() => {
      if (this.visible()) {
        this.selectedFormat.set(this.exportType());
        this.prefix.set(this.defaultPrefix() || 'board');
        this.dirPath.set(this.defaultDirPath());
        this.startIndex.set(0);
        this.endIndex.set(this.boardCount() - 1);
        this.startRaw.set('1');
        this.endRaw.set(String(this.boardCount()));
      }
    });
  }

  protected onFormatChange(event: Event): void {
    const nextValue = (event.target as HTMLSelectElement).value;
    this.selectedFormat.set(nextValue === 'video' ? 'video' : 'png');
  }

  protected onSelectChange(event: Event): void {
    const parsed = parseInt((event.target as HTMLSelectElement).value, 10);
    const clamped = Number.isNaN(parsed)
      ? this.selectedIndex()
      : Math.max(0, Math.min(parsed, this.resolutions.length - 1));
    this.selectedIndex.set(clamped);
  }

  protected onPrefixChange(event: Event): void {
    this.prefix.set((event.target as HTMLInputElement).value);
  }

  protected onStartInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.startRaw.set(raw);
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.max(1, Math.min(parsed, this.boardCount()));
      this.startIndex.set(clamped - 1);
      if (this.endIndex() < clamped - 1) {
        this.endIndex.set(clamped - 1);
        this.endRaw.set(String(clamped));
      }
    }
  }

  protected onStartBlur(): void {
    this.startRaw.set(String(this.startIndex() + 1));
  }

  protected onEndInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.endRaw.set(raw);
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.max(1, Math.min(parsed, this.boardCount()));
      this.endIndex.set(clamped - 1);
      if (this.startIndex() > clamped - 1) {
        this.startIndex.set(clamped - 1);
        this.startRaw.set(String(clamped));
      }
    }
  }

  protected onEndBlur(): void {
    this.endRaw.set(String(this.endIndex() + 1));
  }

  protected async onBrowse(): Promise<void> {
    this.isBrowsing.set(true);
    try {
      const chosen = await window.quickboard?.pickExportDir();
      if (chosen) this.dirPath.set(chosen);
    } finally {
      this.isBrowsing.set(false);
    }
  }

  protected onConfirm(): void {
    const rawPrefix = this.prefix().trim();
    const safePrefix = rawPrefix.length > 0 ? rawPrefix : 'board';
    this.confirmExport.emit({
      format: this.selectedFormat(),
      resolution: this.selectedResolution(),
      prefix: safePrefix,
      dirPath: this.dirPath(),
      startIndex: this.startIndex(),
      endIndex: this.endIndex(),
    });
  }

  protected onCancel(): void {
    this.cancelExport.emit();
  }
}
