import { Component, computed, input, output, signal } from '@angular/core';
import { EXPORT_RESOLUTIONS, ExportResolution } from './export-resolutions';

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
  confirmExport = output<ExportResolution>();
  cancelExport = output<void>();

  protected readonly resolutions = EXPORT_RESOLUTIONS;
  protected selectedIndex = signal(2); // default: Full HD

  protected readonly selectedResolution = computed(() => this.resolutions[this.selectedIndex()]);

  protected onSelectChange(event: Event): void {
    const idx = Number((event.target as HTMLSelectElement).value);
    this.selectedIndex.set(idx);
  }

  protected onConfirm(): void {
    this.confirmExport.emit(this.selectedResolution());
  }

  protected onCancel(): void {
    this.cancelExport.emit();
  }
}
