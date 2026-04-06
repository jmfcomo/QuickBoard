import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-clear-canvas-confirm',
  templateUrl: './clear-canvas-confirm.component.html',
  styleUrls: ['./clear-canvas-confirm.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClearCanvasConfirmComponent {
  readonly visible = input(false);

  readonly cancelRequested = output<void>();
  readonly confirmRequested = output<void>();
}