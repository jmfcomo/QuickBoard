// Brush Tool - paints with squares for a pixel effect

interface LCShape {
  className: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
  strokeColor: string;
  fillColor: string;
}

interface LCInstance {
  tool: { strokeWidth?: number };
  getColor(type: string): string;
  saveShape(shape: unknown): void;
}

interface Point {
  x: number;
  y: number;
}

export class Brush {
  name = 'Brush';
  iconName = 'brush';
  strokeWidth = 10;
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
    // Check if we've already drawn a square at this position
    const isDuplicate = this.points.some((pt) => {
      return Math.abs(pt.x - x) < this.strokeWidth / 2 && 
             Math.abs(pt.y - y) < this.strokeWidth / 2;
    });

    if (!isDuplicate) {
      this.points.push({x, y});
      
      // Create and immediately save a rectangle (square) shape
      const square: LCShape = {
        className: 'Rectangle',
        x: Math.round(x - this.strokeWidth / 2),
        y: Math.round(y - this.strokeWidth / 2),
        width: this.strokeWidth,
        height: this.strokeWidth,
        strokeWidth: 0, // No border
        strokeColor: 'transparent',
        fillColor: this.color
      };
      
      lc.saveShape(square);
    }
  }
}