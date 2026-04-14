import { LCInstance, LCTool } from '../literally-canvas-interfaces';

export interface ZoomClientPoint {
  x: number;
  y: number;
}

type ZoomAdjustHandler = (deltaLevel: number, point: ZoomClientPoint) => void;

export class ZoomTool implements LCTool {
  name = 'Zoom';
  iconName = 'zoom';
  usesSimpleAPI = false;

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    const shouldZoomOut = event.button === 2 || event.shiftKey || event.metaKey || event.ctrlKey;
    const delta = shouldZoomOut ? -this.clickStep : this.clickStep;

    this.adjustZoom(delta, { x: event.clientX, y: event.clientY });
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    const normalizedDelta = this.normalizeWheelDelta(event);
    if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) {
      return;
    }

    const direction = normalizedDelta < 0 ? 1 : -1;
    const sensitivity = event.ctrlKey ? 0.12 : 0.06;
    const magnitude = Math.max(1, Math.min(15, Math.abs(normalizedDelta) * sensitivity));

    this.adjustZoom(direction * magnitude, { x: event.clientX, y: event.clientY });
  };

  constructor(
    private readonly lc: LCInstance,
    private readonly adjustZoom: ZoomAdjustHandler,
    private readonly clickStep = 6,
  ) {}

  willBecomeActive(): void {
    // No-op
  }

  didBecomeActive(): void {
    this.lc.canvas.style.cursor = 'zoom-in';
    this.lc.canvas.addEventListener('mousedown', this.onMouseDown);
    this.lc.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.lc.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  willBecomeInactive(): void {
    this.lc.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.lc.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.lc.canvas.removeEventListener('wheel', this.onWheel);
    this.lc.canvas.style.cursor = 'default';
  }

  didBecomeInactive(): void {
    // No-op
  }

  private normalizeWheelDelta(event: WheelEvent): number {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return event.deltaY * 16;
    }

    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return event.deltaY * 120;
    }

    return event.deltaY;
  }
}
