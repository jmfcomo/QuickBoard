import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  computed,
  input,
  output,
} from '@angular/core';
import { ColorPickerComponent } from 'src/ui/canvas/color-picker/color-picker.component';

export interface ColorPicker {
  label: string;
  signal: WritableSignal<string>;
  setter: (color: string) => void;
  quickColors: string[];
}

@Component({
  selector: 'app-properties-bar',
  imports: [ColorPickerComponent],
  templateUrl: './properties-bar.component.html',
  styleUrls: ['./properties-bar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesBarComponent {
  readonly activeTool = input.required<string>();
  readonly zoomLevel = input.required<number>();
  readonly zoomKeepOn = input.required<boolean>();
  readonly strokeSize = input.required<number>();
  readonly brushSpacing = input.required<number>();
  readonly colorTolerance = input.required<number>();
  readonly colorPickers = input.required<ColorPicker[]>();

  readonly zoomLevelChange = output<number>();
  readonly zoomLevelFromSliderChange = output<number>();
  readonly zoomKeepOnChange = output<boolean>();
  readonly strokeSizeChange = output<number>();
  readonly strokeSizeFromSliderChange = output<number>();
  readonly brushSpacingChange = output<number>();
  readonly colorToleranceChange = output<number>();

  readonly showZoomLevel = computed(() => this.activeTool() === 'zoom');
  readonly showStrokeSize = computed(() =>
    ['pencil', 'brush', 'rectangle', 'circle', 'polygon', 'eraser'].includes(this.activeTool())
  );
  readonly showColorTolerance = computed(() => this.activeTool() === 'bucket-fill');
  readonly showBrushSpacing = computed(() => this.activeTool() === 'brush');
  readonly showColorPickers = computed(() => this.activeTool() !== 'zoom');

  readonly propertyLabel = computed(() =>
    ['rectangle', 'circle', 'polygon'].includes(this.activeTool()) ? 'Stroke' : 'Size'
  );

  readonly strokeSizeSliderPos = computed(() => {
    const v = this.strokeSize();
    if (v <= 1) return 0;
    return Math.min(100, Math.round((Math.log(v) / Math.log(500)) * 100));
  });

  readonly zoomLevelSliderPos = computed(() => {
    const v = Math.max(1, this.zoomLevel());
    if (v <= 1) return 0;
    return Math.min(100, Math.round((Math.log(v) / Math.log(1000)) * 100));
  });
}
