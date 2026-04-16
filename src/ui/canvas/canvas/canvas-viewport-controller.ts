import { signal } from '@angular/core';
import { LCInstance } from '../literally-canvas-interfaces';
import { ZoomClientPoint } from '../tools/zoom';

export interface CanvasViewportControllerOptions {
  activeTool: () => string;
  syncViewportRects: () => void;
  zoomKeepOnDefault: boolean;
  zoomClickStep?: number;
}

export class CanvasViewportController {
  readonly zoomLevel = signal<number>(1);
  readonly zoomKeepOn = signal<boolean>(true);

  private lc: LCInstance | null = null;
  private readonly minZoomLevel = 1;
  private readonly maxZoomLevel = 1000;
  private readonly maxCanvasScale = 10;
  private minCanvasScale = 1;
  private pinchTouchDistance: number | null = null;
  private isMiddleMousePanning = false;
  private middleMousePanStart: ZoomClientPoint | null = null;
  private middleMousePanStartPosition: { x: number; y: number } | null = null;

  private readonly onCanvasWheel = (event: WheelEvent) => this.handleCanvasWheel(event);
  private readonly onCanvasTouchStart = (event: TouchEvent) => this.handleCanvasTouchStart(event);
  private readonly onCanvasTouchMove = (event: TouchEvent) => this.handleCanvasTouchMove(event);
  private readonly onCanvasTouchEnd = () => this.handleCanvasTouchEnd();
  private readonly onCanvasMouseDown = (event: MouseEvent) => this.handleCanvasMouseDown(event);
  private readonly onWindowMouseMove = (event: MouseEvent) => this.handleWindowMouseMove(event);
  private readonly onWindowMouseUp = (event: MouseEvent) => this.handleWindowMouseUp(event);
  private readonly onWindowBlur = () => this.stopMiddleMousePan();

  constructor(private readonly options: CanvasViewportControllerOptions) {
    this.zoomKeepOn.set(!!this.options.zoomKeepOnDefault);
  }

  getClickZoomStep(): number {
    return this.normalizeZoomClickStep(this.options.zoomClickStep);
  }

  attach(lc: LCInstance): void {
    this.lc = lc;
    const canvas = lc.canvas;
    canvas.addEventListener('mousedown', this.onCanvasMouseDown, true);
    canvas.addEventListener('wheel', this.onCanvasWheel, { passive: false });
    canvas.addEventListener('touchstart', this.onCanvasTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onCanvasTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onCanvasTouchEnd);
    canvas.addEventListener('touchcancel', this.onCanvasTouchEnd);
  }

  detach(): void {
    if (!this.lc) {
      return;
    }

    this.stopMiddleMousePan();

    const canvas = this.lc.canvas;
    canvas.removeEventListener('mousedown', this.onCanvasMouseDown, true);
    canvas.removeEventListener('wheel', this.onCanvasWheel);
    canvas.removeEventListener('touchstart', this.onCanvasTouchStart);
    canvas.removeEventListener('touchmove', this.onCanvasTouchMove);
    canvas.removeEventListener('touchend', this.onCanvasTouchEnd);
    canvas.removeEventListener('touchcancel', this.onCanvasTouchEnd);
    this.lc = null;
  }

  setZoomKeepOn(keepOn: boolean): void {
    this.zoomKeepOn.set(!!keepOn);
  }

  setZoomLevel(level: number, point?: ZoomClientPoint): void {
    if (!this.lc || !Number.isFinite(level)) {
      return;
    }

    const clampedLevel = this.clampZoomLevel(level);
    this.setCanvasScale(this.zoomLevelToScale(clampedLevel), point);
  }

  setZoomLevelFromSlider(position: number): void {
    if (!Number.isFinite(position)) {
      return;
    }

    const bounded = Math.max(0, Math.min(100, position));
    const level = Math.round(Math.pow(this.maxZoomLevel, bounded / 100));
    this.setZoomLevel(level);
  }

  adjustZoomLevel(deltaLevel: number, point: ZoomClientPoint): void {
    this.setZoomLevel(this.zoomLevel() + deltaLevel, point);
  }

  applyFitScale(scale: number): void {
    this.minCanvasScale = scale;
    this.setCanvasScale(this.zoomLevelToScale(this.zoomLevel()));
  }

  private isZoomGestureEnabled(): boolean {
    return this.options.activeTool() === 'zoom' || this.zoomKeepOn();
  }

  private canPanAtCurrentZoom(): boolean {
    return !!this.lc && this.zoomLevel() > 1;
  }

  private handleCanvasWheel(event: WheelEvent): void {
    if (!this.lc) {
      return;
    }

    // Trackpad pinch arrives as ctrl+wheel; external mouse wheels are line-based deltas.
    const isPinchGesture = event.ctrlKey;
    const isMouseWheel = !isPinchGesture && event.deltaMode === WheelEvent.DOM_DELTA_LINE;
    const isTrackpadScroll = !isPinchGesture && event.deltaMode === WheelEvent.DOM_DELTA_PIXEL;

    if (isTrackpadScroll && this.canPanAtCurrentZoom()) {
      event.preventDefault();
      event.stopPropagation();
      this.panCanvasByDeltas(event.deltaX, event.deltaY);
      return;
    }

    if (!this.isZoomGestureEnabled()) {
      return;
    }

    if (!isPinchGesture && !isMouseWheel) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const delta = Number.isFinite(event.deltaY) ? event.deltaY : 0;
    if (delta === 0) {
      return;
    }

    const clampedDelta = Math.max(-50, Math.min(50, delta));
    const sensitivity = isPinchGesture ? 0.016 : 0.22;
    const factor = Math.exp(-clampedDelta * sensitivity);

    this.setCanvasScale(this.lc.scale * factor, { x: event.clientX, y: event.clientY });
  }

  private handleCanvasMouseDown(event: MouseEvent): void {
    if (event.button !== 1 || !this.canPanAtCurrentZoom() || !this.lc) {
      return;
    }

    this.isMiddleMousePanning = true;
    this.middleMousePanStart = {
      x: event.clientX,
      y: event.clientY,
    };
    this.middleMousePanStartPosition = {
      x: this.lc.position.x,
      y: this.lc.position.y,
    };

    this.lc.canvas.style.cursor = 'grabbing';
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
    window.addEventListener('blur', this.onWindowBlur);

    event.preventDefault();
    event.stopPropagation();
  }

  private handleWindowMouseMove(event: MouseEvent): void {
    if (
      !this.isMiddleMousePanning ||
      !this.lc ||
      !this.middleMousePanStart ||
      !this.middleMousePanStartPosition ||
      !this.lc.setPan
    ) {
      return;
    }

    const dx = event.clientX - this.middleMousePanStart.x;
    const dy = event.clientY - this.middleMousePanStart.y;
    const backingScale = this.lc.backingScale || 1;

    this.lc.setPan(
      this.middleMousePanStartPosition.x + dx * backingScale,
      this.middleMousePanStartPosition.y + dy * backingScale,
    );
    this.options.syncViewportRects();

    event.preventDefault();
  }

  private handleWindowMouseUp(event: MouseEvent): void {
    if (event.button !== 1) {
      return;
    }

    this.stopMiddleMousePan();
  }

  private stopMiddleMousePan(): void {
    if (!this.isMiddleMousePanning) {
      return;
    }

    this.isMiddleMousePanning = false;
    this.middleMousePanStart = null;
    this.middleMousePanStartPosition = null;

    if (this.lc) {
      this.lc.canvas.style.cursor = this.options.activeTool() === 'zoom' ? 'zoom-in' : 'default';
    }

    window.removeEventListener('mousemove', this.onWindowMouseMove);
    window.removeEventListener('mouseup', this.onWindowMouseUp);
    window.removeEventListener('blur', this.onWindowBlur);
  }

  private handleCanvasTouchStart(event: TouchEvent): void {
    if (!this.isZoomGestureEnabled() || event.touches.length !== 2) {
      this.pinchTouchDistance = null;
      return;
    }

    this.pinchTouchDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
  }

  private handleCanvasTouchMove(event: TouchEvent): void {
    if (!this.lc || !this.isZoomGestureEnabled() || event.touches.length !== 2) {
      this.pinchTouchDistance = null;
      return;
    }

    const currentDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
    const previousDistance = this.pinchTouchDistance;

    if (!previousDistance || previousDistance <= 0 || currentDistance <= 0) {
      this.pinchTouchDistance = currentDistance;
      return;
    }

    event.preventDefault();

    const factor = Math.pow(currentDistance / previousDistance, 1.35);
    const midpoint = this.getTouchMidpoint(event.touches[0], event.touches[1]);
    this.setCanvasScale(this.lc.scale * factor, midpoint);

    this.pinchTouchDistance = currentDistance;
  }

  private handleCanvasTouchEnd(): void {
    this.pinchTouchDistance = null;
  }

  private getTouchDistance(first: Touch, second: Touch): number {
    const dx = first.clientX - second.clientX;
    const dy = first.clientY - second.clientY;
    return Math.hypot(dx, dy);
  }

  private getTouchMidpoint(first: Touch, second: Touch): ZoomClientPoint {
    return {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    };
  }

  private panCanvasByDeltas(deltaX: number, deltaY: number): void {
    if (!this.lc) {
      return;
    }

    if (this.lc.pan) {
      this.lc.pan(deltaX, deltaY);
    } else if (this.lc.setPan) {
      const backingScale = this.lc.backingScale || 1;
      this.lc.setPan(
        this.lc.position.x - deltaX * backingScale,
        this.lc.position.y - deltaY * backingScale,
      );
    }

    this.options.syncViewportRects();
  }

  private normalizeZoomClickStep(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 12;
    }

    return Math.max(1, Math.round(value));
  }

  private setCanvasScale(scale: number, point?: ZoomClientPoint): void {
    if (!this.lc) {
      return;
    }

    const minScale = this.minCanvasScale;
    const maxScale = Math.max(minScale, this.maxCanvasScale);
    const targetScale = Math.max(minScale, Math.min(maxScale, scale));

    if (
      point &&
      this.lc.clientCoordsToDrawingCoords &&
      this.lc.drawingCoordsToClientCoords &&
      this.lc.setPan
    ) {
      const rect = this.lc.canvas.getBoundingClientRect();
      const localX = point.x - rect.left;
      const localY = point.y - rect.top;
      const isInsideCanvas =
        localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height;

      if (isInsideCanvas) {
        const drawingPoint = this.lc.clientCoordsToDrawingCoords(localX, localY);
        this.lc.setZoom(targetScale);
        const clientPointAfterZoom = this.lc.drawingCoordsToClientCoords(
          drawingPoint.x,
          drawingPoint.y,
        );
        const backingScale = this.lc.backingScale || 1;

        this.lc.setPan(
          this.lc.position.x + localX * backingScale - clientPointAfterZoom.x,
          this.lc.position.y + localY * backingScale - clientPointAfterZoom.y,
        );

        this.zoomLevel.set(this.scaleToZoomLevel(this.lc.scale));
        this.options.syncViewportRects();
        return;
      }
    }

    this.lc.setZoom(targetScale);
    this.zoomLevel.set(this.scaleToZoomLevel(this.lc.scale));
    this.options.syncViewportRects();
  }

  private clampZoomLevel(level: number): number {
    return Math.max(this.minZoomLevel, Math.min(this.maxZoomLevel, Math.round(level)));
  }

  private zoomLevelToScale(level: number): number {
    const minScale = this.minCanvasScale;
    const baselineScale = Math.max(1, minScale);
    const maxScale = Math.max(baselineScale, this.maxCanvasScale);
    const clampedLevel = this.clampZoomLevel(level);

    if (clampedLevel <= 100) {
      const range = 100 - this.minZoomLevel;
      if (range <= 0 || baselineScale <= minScale) {
        return minScale;
      }

      const t = (clampedLevel - this.minZoomLevel) / range;
      return minScale + t * (baselineScale - minScale);
    }

    if (maxScale <= baselineScale) {
      return baselineScale;
    }

    const normalized = (clampedLevel - 100) / (this.maxZoomLevel - 100);
    return baselineScale + normalized * (maxScale - baselineScale);
  }

  private scaleToZoomLevel(scale: number): number {
    const minScale = this.minCanvasScale;
    const baselineScale = Math.max(1, minScale);
    const maxScale = Math.max(baselineScale, this.maxCanvasScale);
    const clampedScale = Math.max(minScale, Math.min(maxScale, scale));

    if (clampedScale <= baselineScale || maxScale <= baselineScale) {
      const range = baselineScale - minScale;
      if (range <= 0) {
        return this.clampZoomLevel(100);
      }

      const t = (clampedScale - minScale) / range;
      const level = this.minZoomLevel + t * (100 - this.minZoomLevel);
      return this.clampZoomLevel(level);
    }

    const normalized = (clampedScale - baselineScale) / (maxScale - baselineScale);
    const level = 100 + normalized * (this.maxZoomLevel - 100);
    return this.clampZoomLevel(level);
  }
}
