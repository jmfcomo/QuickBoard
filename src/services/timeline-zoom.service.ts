import { Injectable, computed, signal } from '@angular/core';
import appSettings from '@econfig/appsettings.json';

@Injectable({ providedIn: 'root' })
export class TimelineZoomService {
  readonly DEFAULT_SCALE = appSettings.timeline.zoom.defaultZoom;
  readonly MIN_SCALE = appSettings.timeline.zoom.minZoom;
  readonly MAX_SCALE = appSettings.timeline.zoom.maxZoom;
  readonly STEP = appSettings.timeline.zoom.zoomStep;
  readonly SLIDER_MIN = 0;
  readonly SLIDER_MAX = 100;
  readonly SLIDER_DEFAULT = 50;

  private readonly _scale = signal(this.DEFAULT_SCALE);
  private readonly _sliderPosition = signal(this.SLIDER_DEFAULT);

  readonly scale = this._scale.asReadonly();
  readonly sliderPosition = this._sliderPosition.asReadonly();
  readonly zoomPercent = computed(() => Math.round((this._scale() / this.DEFAULT_SCALE) * 100));

  setScale(scale: number) {
    const clamped = this.clamp(scale);
    this._scale.set(clamped);
    this._sliderPosition.set(this.scaleToSliderPosition(clamped));
  }

  setSliderPosition(position: number) {
    const bounded = Math.max(this.SLIDER_MIN, Math.min(this.SLIDER_MAX, position));
    this._sliderPosition.set(bounded);
    this._scale.set(this.sliderPositionToScale(bounded));
  }

  zoomIn() {
    this._sliderPosition.update((pos) =>
      Math.min(this.SLIDER_MAX, pos + 5),
    );
    this._scale.set(this.sliderPositionToScale(this._sliderPosition()));
  }

  zoomOut() {
    this._sliderPosition.update((pos) =>
      Math.max(this.SLIDER_MIN, pos - 5),
    );
    this._scale.set(this.sliderPositionToScale(this._sliderPosition()));
  }

  reset() {
    this._scale.set(this.DEFAULT_SCALE);
    this._sliderPosition.set(this.SLIDER_DEFAULT);
  }

  private scaleToSliderPosition(scale: number): number {
    if (scale === this.DEFAULT_SCALE) {
      return this.SLIDER_DEFAULT;
    }

    if (scale < this.DEFAULT_SCALE) {
      const normalized = (scale - this.MIN_SCALE) / (this.DEFAULT_SCALE - this.MIN_SCALE);
      const eased = Math.sqrt(Math.max(0, normalized));
      return eased * this.SLIDER_DEFAULT;
    }

    const normalized = (scale - this.DEFAULT_SCALE) / (this.MAX_SCALE - this.DEFAULT_SCALE);
    const eased = Math.sqrt(Math.max(0, normalized));
    return this.SLIDER_DEFAULT + eased * (this.SLIDER_MAX - this.SLIDER_DEFAULT);
  }

  private sliderPositionToScale(position: number): number {
    if (position === this.SLIDER_DEFAULT) {
      return this.DEFAULT_SCALE;
    }

    if (position < this.SLIDER_DEFAULT) {
      const t = position / this.SLIDER_DEFAULT;
      const eased = t * t;
      return this.MIN_SCALE + eased * (this.DEFAULT_SCALE - this.MIN_SCALE);
    }

    const t = (position - this.SLIDER_DEFAULT) / (this.SLIDER_MAX - this.SLIDER_DEFAULT);
    const eased = t * t;
    return this.DEFAULT_SCALE + eased * (this.MAX_SCALE - this.DEFAULT_SCALE);
  }

  private clamp(value: number): number {
    return Math.min(this.MAX_SCALE, Math.max(this.MIN_SCALE, value));
  }
}
