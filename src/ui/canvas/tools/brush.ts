import { LCInstance } from '../literally-canvas-interfaces';

interface Point {
  x: number;
  y: number;
  size: number;
  color: string;
}

interface LinePathLikeShape {
  points: Point[];
  spacing?: number;
  addPoint(point: Point): void;
}

interface ExtendedLCAPI {
  createShape: (type: string, args?: Record<string, unknown>) => unknown;
  defineShape?: (name: string, props: Record<string, unknown>) => void;
  defineCanvasRenderer?: (
    name: string,
    draw: (ctx: CanvasRenderingContext2D, shape: LinePathLikeShape) => void,
    drawLatest?: (
      ctx: CanvasRenderingContext2D,
      bufferCtx: CanvasRenderingContext2D,
      shape: LinePathLikeShape
    ) => void
  ) => void;
  defineSVGRenderer?: (name: string, draw: (shape: LinePathLikeShape) => string) => void;
}

const SQUARE_LINE_PATH_CLASS = 'SquareLinePath';

let squareBrushShapeRegistered = false;

function getExtendedLCAPI(): ExtendedLCAPI {
  return LC as unknown as ExtendedLCAPI;
}

function drawSquareLinePath(ctx: CanvasRenderingContext2D, shape: LinePathLikeShape): void {
  const points = shape.points;
  if (!points || points.length === 0) {
    return;
  }

  const size = Math.max(1, points[0].size);
  const half = size / 2;
  const spacingRatio = Math.max(0.1, (shape.spacing ?? 45) / 100);
  const stepDistance = Math.max(1, size * spacingRatio);
  ctx.fillStyle = points[0].color;

  const stampSquare = (x: number, y: number): void => {
    const px = Math.round(x - half);
    const py = Math.round(y - half);
    ctx.fillRect(px, py, size, size);
  };

  stampSquare(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(distance / stepDistance));

    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      stampSquare(a.x + dx * t, a.y + dy * t);
    }
  }
}

function registerSquareBrushShapeIfNeeded(): void {
  if (squareBrushShapeRegistered) {
    return;
  }

  const lcAPI = getExtendedLCAPI();
  if (!lcAPI.defineShape || !lcAPI.defineCanvasRenderer || !lcAPI.defineSVGRenderer) {
    return;
  }

  lcAPI.defineShape(SQUARE_LINE_PATH_CLASS, {
    constructor(this: LinePathLikeShape, args?: { points?: Point[]; spacing?: number }) {
      this.points = args?.points ?? [];
      this.spacing = args?.spacing ?? 45;
    },
    addPoint(this: LinePathLikeShape, point: Point) {
      this.points.push(point);
    },
    getBoundingRect(this: LinePathLikeShape) {
      if (this.points.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }

      let left = Number.POSITIVE_INFINITY;
      let top = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;

      for (const point of this.points) {
        const half = point.size / 2;
        left = Math.min(left, point.x - half);
        top = Math.min(top, point.y - half);
        right = Math.max(right, point.x + half);
        bottom = Math.max(bottom, point.y + half);
      }

      return { x: left, y: top, width: right - left, height: bottom - top };
    },
    toJSON(this: LinePathLikeShape) {
      const points = this.points ?? [];
      if (points.length === 0) {
        return { points: [] };
      }

      const first = points[0];
      const sharedStyle = points.every((point) => point.size === first.size && point.color === first.color);

      if (sharedStyle) {
        return {
          pointCoordinatePairs: points.map((point) => [point.x, point.y]),
          pointSize: first.size,
          pointColor: first.color,
          spacing: this.spacing ?? 45,
        };
      }

      return {
        spacing: this.spacing ?? 45,
        points: points.map((point) => ({
          className: 'Point',
          data: {
            x: point.x,
            y: point.y,
            size: point.size,
            color: point.color,
          },
        })),
      };
    },
    fromJSON(data: {
      points?: { data?: Point }[];
      pointCoordinatePairs?: [number, number][];
      pointSize?: number;
      pointColor?: string;
      spacing?: number;
    }) {
      const points = data.points
        ? data.points
            .map((pointJSON) => pointJSON.data)
            .filter((point): point is Point => Boolean(point))
        : (data.pointCoordinatePairs ?? []).map(([x, y]) => ({
            x,
            y,
            size: data.pointSize ?? 1,
            color: data.pointColor ?? '#000000',
          }));

      return lcAPI.createShape(SQUARE_LINE_PATH_CLASS, {
        points,
        spacing: data.spacing ?? 45,
      });
    },
  });

  lcAPI.defineCanvasRenderer(SQUARE_LINE_PATH_CLASS, drawSquareLinePath, (_ctx, bufferCtx, shape) => {
    drawSquareLinePath(bufferCtx, shape);
  });

  lcAPI.defineSVGRenderer(SQUARE_LINE_PATH_CLASS, (shape) => {
    const points = shape.points;
    if (!points || points.length === 0) {
      return '<g />';
    }

    const size = Math.max(1, points[0].size);
    const color = points[0].color;
    const pointList = points.map((point) => `${point.x},${point.y}`).join(' ');
    return `<polyline points='${pointList}' fill='none' stroke='${color}' stroke-width='${size}' stroke-linecap='square' stroke-linejoin='miter' />`;
  });

  squareBrushShapeRegistered = true;
}

// Brush Tool - draws stroke objects that render as square stamps.
export class Brush {
  name = 'Brush';
  iconName = 'brush';
  strokeWidth = 5;
  optionsStyle = 'stroke-width';
  usesSimpleAPI = true;
  eventTimeThreshold = 10;
  spacing = 45;

  private currentShape: LinePathLikeShape | null = null;
  private color = '#000000';
  private lastEventTime = 0;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_lc: LCInstance) {
    registerSquareBrushShapeIfNeeded();
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
    this.strokeWidth = lc.tool.strokeWidth || 10;
    this.color = lc.getColor('primary');
    registerSquareBrushShapeIfNeeded();

    this.currentShape = this.makeShape();
    this.currentShape.addPoint(this.makePoint(x, y));
    this.drawShapeInProgress(lc);
    this.lastEventTime = Date.now();
  }

  ['continue'](x: number, y: number, lc: LCInstance): void {
    if (!this.currentShape) {
      return;
    }

    const timeDiff = Date.now() - this.lastEventTime;
    if (timeDiff <= this.eventTimeThreshold) {
      return;
    }

    this.lastEventTime += timeDiff;
    this.currentShape.addPoint(this.makePoint(x, y));
    this.drawShapeInProgress(lc);
  }

  end(x: number, y: number, lc: LCInstance): void {
    if (!this.currentShape) {
      return;
    }

    this.currentShape.addPoint(this.makePoint(x, y));
    lc.saveShape(this.currentShape);
    lc.setShapesInProgress([]);
    this.currentShape = null;
  }

  private makePoint(x: number, y: number): Point {
    return LC.createShape('Point', {
      x,
      y,
      size: this.strokeWidth,
      color: this.color,
    }) as unknown as Point;
  }

  private makeShape(): LinePathLikeShape {
    if (squareBrushShapeRegistered) {
      return LC.createShape(SQUARE_LINE_PATH_CLASS, {
        spacing: this.spacing,
      }) as unknown as LinePathLikeShape;
    }

    // Fallback path if custom shape APIs are unavailable.
    return LC.createShape('LinePath', { smooth: false }) as unknown as LinePathLikeShape;
  }

  private drawShapeInProgress(lc: LCInstance): void {
    const typedLC = lc as LCInstance & {
      drawShapeInProgress?: (shape: unknown) => void;
    };

    if (typedLC.drawShapeInProgress && this.currentShape) {
      typedLC.drawShapeInProgress(this.currentShape);
      return;
    }

    if (this.currentShape) {
      lc.setShapesInProgress([this.currentShape]);
      lc.repaintLayer('main');
    }
  }

}