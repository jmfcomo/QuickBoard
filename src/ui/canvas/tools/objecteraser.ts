import { LCInstance } from '../literally-canvas-interfaces';

interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Object Eraser Tool - removes entire shapes it touches
export class ObjectEraser {
  name = 'Object Eraser';
  iconName = 'object-eraser';
  strokeWidth = 20;
  optionsStyle = 'stroke-width';
  usesSimpleAPI = true;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_lc: LCInstance) {
    // Constructor for LiterallyCanvas tool
  }

  willBecomeActive(): void {
    // Called before the tool becomes active
  }

  didBecomeActive(): void {
    // Called after the tool becomes active
  }

  willBecomeInactive(): void {
    // Called before the tool becomes inactive
  }

  didBecomeInactive(): void {
    // Called after the tool becomes inactive
  }

  begin(x: number, y: number, lc: LCInstance): void {
    this.strokeWidth = lc.tool.strokeWidth || 20;
    this.eraseAtPoint(x, y, lc);
  }

  ['continue'](x: number, y: number, lc: LCInstance): void {
    this.eraseAtPoint(x, y, lc);
  }

  end(x: number, y: number, lc: LCInstance): void {
    this.eraseAtPoint(x, y, lc);
  }

  private eraseAtPoint(x: number, y: number, lc: LCInstance): void {
    const radius = this.strokeWidth / 2;
    const shapes = lc.shapes as unknown as {
      id?: string;
      className?: string;
      getBoundingRect?: (...args: unknown[]) => BoundingRect;
      points?: { x: number; y: number; size?: number }[];
      smoothedPoints?: { x: number; y: number; size?: number }[];
    }[];
    if (!Array.isArray(shapes) || shapes.length === 0) {
      return;
    }

    const ctx = (lc as unknown as { ctx?: CanvasRenderingContext2D }).ctx;
    let didErase = false;
    const remainingShapes = [] as typeof shapes;

    for (const shape of shapes) {
      const className = shape?.className;
      if (className === 'ErasedLinePath') {
        remainingShapes.push(shape);
        continue;
      }

      if (className === 'LinePath') {
        if (this.isLinePathHit(shape, x, y, radius)) {
          didErase = true;
          continue;
        }
        remainingShapes.push(shape);
        continue;
      }
      if (!shape?.getBoundingRect) {
        remainingShapes.push(shape);
        continue;
      }

      const rect = this.getBoundingRectSafe(shape, ctx);
      if (!rect) {
        remainingShapes.push(shape);
        continue;
      }

      if (this.isPointInExpandedRect(x, y, rect, radius)) {
        didErase = true;
        continue;
      }

      remainingShapes.push(shape);
    }

    if (didErase) {
      lc.shapes = remainingShapes;
      lc.repaintLayer('main');
      lc.trigger('drawingChange', {});
    }
  }

  private getBoundingRectSafe(
    shape: { getBoundingRect?: (...args: unknown[]) => BoundingRect },
    ctx?: CanvasRenderingContext2D
  ): BoundingRect | null {
    try {
      const rect = ctx ? shape.getBoundingRect?.(ctx) : shape.getBoundingRect?.();
      if (!rect) {
        return null;
      }
      return this.normalizeRect(rect);
    } catch {
      try {
        const rect = shape.getBoundingRect?.();
        return rect ? this.normalizeRect(rect) : null;
      } catch {
        return null;
      }
    }
  }

  private normalizeRect(rect: BoundingRect): BoundingRect {
    const x = Math.min(rect.x, rect.x + rect.width);
    const y = Math.min(rect.y, rect.y + rect.height);
    const width = Math.abs(rect.width);
    const height = Math.abs(rect.height);
    return { x, y, width, height };
  }

  private isPointInExpandedRect(x: number, y: number, rect: BoundingRect, padding: number): boolean {
    return (
      x >= rect.x - padding &&
      x <= rect.x + rect.width + padding &&
      y >= rect.y - padding &&
      y <= rect.y + rect.height + padding
    );
  }

  private isLinePathHit(
    shape: {
      points?: { x: number; y: number; size?: number }[];
      smoothedPoints?: { x: number; y: number; size?: number }[];
    },
    x: number,
    y: number,
    radius: number
  ): boolean {
    const points = (shape.smoothedPoints && shape.smoothedPoints.length > 1)
      ? shape.smoothedPoints
      : shape.points;
    if (!points || points.length === 0) {
      return false;
    }

    const defaultSize = points[0]?.size ?? 0;
    if (points.length === 1) {
      return this.distanceToPoint(x, y, points[0].x, points[0].y) <= radius + defaultSize / 2;
    }

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const strokeRadius = ((a.size ?? defaultSize) + (b.size ?? defaultSize)) / 4;
      if (this.distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= radius + strokeRadius) {
        return true;
      }
    }

    return false;
  }

  private distanceToPoint(x: number, y: number, px: number, py: number): number {
    const dx = x - px;
    const dy = y - py;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private distanceToSegment(
    x: number,
    y: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) {
      return this.distanceToPoint(x, y, x1, y1);
    }

    const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    if (t <= 0) {
      return this.distanceToPoint(x, y, x1, y1);
    }
    if (t >= 1) {
      return this.distanceToPoint(x, y, x2, y2);
    }

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return this.distanceToPoint(x, y, projX, projY);
  }
}
