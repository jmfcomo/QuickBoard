import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { OnionOverlayRect } from '../onion-skin/onion-skin.types';

@Component({
  selector: 'app-boil-overlay',
  templateUrl: './boil-overlay.component.html',
  styleUrls: ['./boil-overlay.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoilOverlayComponent {
  readonly image = input.required<string | null>();
  readonly imageRect = input.required<OnionOverlayRect>();
}
