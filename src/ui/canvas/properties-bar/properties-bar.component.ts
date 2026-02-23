import { Component, input, output, computed } from '@angular/core';
import { WritableSignal } from '@angular/core';

export interface ColorPicker {
  label: string;
  signal: WritableSignal<string>;
  setter: (color: string) => void;
  quickColors: string[];
}

@Component({
  selector: 'app-properties-bar',
  templateUrl: './properties-bar.component.html',
  styleUrls: ['./properties-bar.component.css'],
})
export class PropertiesBarComponent {
  readonly activeTool = input.required<string>();
  readonly strokeSize = input.required<number>();
  readonly colorTolerance = input.required<number>();
  readonly colorPickers = input.required<ColorPicker[]>();

  readonly strokeSizeChange = output<number>();
  readonly strokeSizeFromSliderChange = output<number>();
  readonly colorToleranceChange = output<number>();

  readonly showStrokeSize = computed(() =>
    ['pencil', 'brush', 'rectangle', 'eraser'].includes(this.activeTool())
  );
  readonly showColorTolerance = computed(() => this.activeTool() === 'bucket-fill');

  readonly propertyLabel = computed(() =>
    this.activeTool() === 'rectangle' ? 'Stroke' : 'Size'
  );

  readonly strokeSizeSliderPos = computed(() => {
    const v = this.strokeSize();
    if (v <= 1) return 0;
    return Math.min(100, Math.round(Math.log(v) / Math.log(4000) * 100));
  });
}
