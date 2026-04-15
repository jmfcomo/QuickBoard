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

  constructor(
    private readonly lc: LCInstance,
    private readonly adjustZoom: ZoomAdjustHandler,
    private readonly clickStep = 12,
  ) {}

  didBecomeActive(): void {
    this.lc.canvas.style.cursor = 'zoom-in';
    this.lc.canvas.addEventListener('mousedown', this.onMouseDown);
    this.lc.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  willBecomeInactive(): void {
    this.lc.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.lc.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.lc.canvas.style.cursor = 'default';
  }
}
