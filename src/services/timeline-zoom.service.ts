import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TimelineZoomService {
  readonly DEFAULT_SCALE = 40;
  readonly MIN_SCALE = 5;
  readonly MAX_SCALE = 500;
  readonly STEP = 10;

  private readonly _scale = signal(this.DEFAULT_SCALE);

  readonly scale = this._scale.asReadonly();
  readonly zoomPercent = computed(() => Math.round((this._scale() / this.DEFAULT_SCALE) * 100));

  setScale(scale: number) {
    this._scale.set(this.clamp(scale));
  }

  zoomIn() {
    this._scale.update((value) => this.clamp(value + this.STEP));
  }

  zoomOut() {
    this._scale.update((value) => this.clamp(value - this.STEP));
  }

  reset() {
    this._scale.set(this.DEFAULT_SCALE);
  }

  private clamp(value: number): number {
    const bounded = Math.min(this.MAX_SCALE, Math.max(this.MIN_SCALE, value));
    const snapped =
      this.MIN_SCALE + Math.round((bounded - this.MIN_SCALE) / this.STEP) * this.STEP;
    return Math.min(this.MAX_SCALE, Math.max(this.MIN_SCALE, snapped));
  }
}
