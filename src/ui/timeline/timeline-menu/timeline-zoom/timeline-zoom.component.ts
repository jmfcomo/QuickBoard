import { Component, inject, computed } from '@angular/core';
import { TimelineZoomService } from '../../../../services/timeline-zoom.service';

@Component({
  selector: 'app-timeline-zoom',
  imports: [],
  templateUrl: './timeline-zoom.component.html',
  styleUrl: './timeline-zoom.component.css',
})
export class TimelineZoomComponent {
  private readonly zoom = inject(TimelineZoomService);

  readonly zoomScale = this.zoom.scale;
  readonly sliderPosition = this.zoom.sliderPosition;
  readonly zoomPercent = this.zoom.zoomPercent;
  readonly sliderMin = this.zoom.SLIDER_MIN;
  readonly sliderMax = this.zoom.SLIDER_MAX;
  readonly isMinZoom = computed(() => this.sliderPosition() <= this.sliderMin);
  readonly isMaxZoom = computed(() => this.sliderPosition() >= this.sliderMax);

  updateZoom(value: string) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      this.zoom.setSliderPosition(n);
    }
  }

  zoomIn() {
    this.zoom.zoomIn();
  }

  zoomOut() {
    this.zoom.zoomOut();
  }

  resetZoom() {
    this.zoom.reset();
  }
}
