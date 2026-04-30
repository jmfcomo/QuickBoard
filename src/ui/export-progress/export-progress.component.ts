import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-export-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    return Math.max(0, Math.min(100, Math.round(this.progressPercent())));
  });
}
