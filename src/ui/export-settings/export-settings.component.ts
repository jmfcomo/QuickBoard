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
  confirmExport = output<ExportSettings>();
  cancelExport = output<void>();

  protected readonly resolutions = EXPORT_RESOLUTIONS;
  protected selectedIndex = signal(Math.min(2, this.resolutions.length - 1)); // default: Full HD
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
        this.prefix.set(this.defaultPrefix() || 'board');
        this.dirPath.set(this.defaultDirPath());
      }
    });
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
      resolution: this.selectedResolution(),
      prefix: safePrefix,
      dirPath: this.dirPath(),
    });
  }

  protected onCancel(): void {
    this.cancelExport.emit();
  }
}
