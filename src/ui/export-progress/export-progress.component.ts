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
  frameCount = input<number>(0);
  fileName = input<string>('');
  status = input<'exporting' | 'success' | 'error'>('exporting');
  message = input<string>('');
  dismiss = output<void>();
  cancelExport = output<void>();

  protected percent = computed(() => {
    const t = this.total();
    if (t === 0) return 0;
    const rawPercent = Math.round((this.current() / t) * 100);
    return Math.max(0, Math.min(100, rawPercent));
  });
}
