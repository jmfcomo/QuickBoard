import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-export-progress',
  standalone: true,
  imports: [],
  templateUrl: './export-progress.component.html',
  styleUrl: './export-progress.component.css',
})
export class ExportProgressComponent {
  visible = input<boolean>(false);
  current = input<number>(0);
  total = input<number>(0);
  progressPercent = input<number>(0);
  frameCount = input<number>(0);
  fileName = input<string>('');
  status = input<'exporting' | 'success' | 'error'>('exporting');
  message = input<string>('');
  dismiss = output<void>();
  cancelExport = output<void>();

  protected percent = computed(() => {
    const accuratePercent = this.progressPercent();
    if (Number.isFinite(accuratePercent)) {
      return Math.max(0, Math.min(100, Math.round(accuratePercent)));
    }

    const t = this.total();
    if (t === 0) return 0;
    const fallbackPercent = Math.round((this.current() / t) * 100);
    return Math.max(0, Math.min(100, fallbackPercent));
  });
}
