// Master custom tools file

import { LCInstance } from '../literally-canvas-interfaces';

interface Point {
  x: number;
  y: number;
}

// Brush Tool - paints with squares for a pixel effect
export class Brush {
  name = 'Brush';
  iconName = 'brush';
  strokeWidth = 5;
  optionsStyle = 'stroke-width';
  usesSimpleAPI = true;

  private points: Point[] = [];
  private color = '#000000';

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
    this.strokeWidth = lc.tool.strokeWidth || 10;
    this.color = lc.getColor('primary');
    this.points = [];
    this.addPoint(x, y, lc);
  }

  ['continue'](x: number, y: number, lc: LCInstance): void {
    this.addPoint(x, y, lc);
  }

  end(x: number, y: number, lc: LCInstance): void {
    this.addPoint(x, y, lc);
    this.points = [];
  }

  private addPoint(x: number, y: number, lc: LCInstance): void {
    const lastPoint = this.points[this.points.length - 1];

    // If we have a previous point, interpolate between them if distance is too large
    if (lastPoint) {
      const dx = x - lastPoint.x;
      const dy = y - lastPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Create intermediate points if the distance is larger than half the brush size
      if (distance > this.strokeWidth / 2) {
        const steps = Math.ceil(distance / (this.strokeWidth / 2));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const interpX = Math.round(lastPoint.x + dx * t);
          const interpY = Math.round(lastPoint.y + dy * t);
          this.drawSquare(interpX, interpY, lc);
        }
        return;
      }
    }

    // Otherwise draw at the current point
    this.drawSquare(x, y, lc);
  }

  private drawSquare(x: number, y: number, lc: LCInstance): void {
    // Check if we've already drawn a square at this position
    const isDuplicate = this.points.some((pt) => {
      return Math.abs(pt.x - x) < this.strokeWidth / 2 && Math.abs(pt.y - y) < this.strokeWidth / 2;
    });

    if (!isDuplicate) {
      this.points.push({ x, y });

      // Create and immediately save a rectangle (square) shape using LC.createShape
      const square = LC.createShape('Rectangle', {
        x: Math.round(x - this.strokeWidth / 2),
        y: Math.round(y - this.strokeWidth / 2),
        width: this.strokeWidth,
        height: this.strokeWidth,
        strokeWidth: 0, // No border
        strokeColor: 'transparent',
        fillColor: this.color,
      });

      lc.saveShape(square);
    }
  }
}
