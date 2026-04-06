import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { OnionOverlayRect, OnionSkinLayer } from './onion-skin.types';

@Component({
  selector: 'app-onion-skin-overlay',
  templateUrl: './onion-skin-overlay.component.html',
  styleUrls: ['./onion-skin-overlay.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnionSkinOverlayComponent {
  readonly layers = input.required<readonly OnionSkinLayer[]>();
  readonly layerRect = input.required<OnionOverlayRect>();
  readonly imageRect = input.required<OnionOverlayRect>();
}