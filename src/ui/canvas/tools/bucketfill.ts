import { LCInstance } from '../literally-canvas-interfaces';

// Fill Tool - fills an area with a color
export class BucketFill {
  name = 'Bucket Fill';
  iconName = 'bucket-fill';
  optionsStyle = '';
  usesSimpleAPI = true;

  private color = '#000000';
  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  constructor(private lc: LCInstance) {
    // Try to get the canvas/context from LCInstance
    // Use type guard to avoid 'any'
    const maybeCtx = (lc as unknown as { ctx?: unknown }).ctx;
    if (maybeCtx && typeof (maybeCtx as CanvasRenderingContext2D).getImageData === 'function') {
      this.ctx = maybeCtx as CanvasRenderingContext2D;
      this.canvas = this.ctx.canvas;
    } else {
      this.ctx = null;
      this.canvas = null;
    }
  }
  // Called when user clicks to fill
  begin(x: number, y: number, lc: LCInstance): void {
    if (!this.ctx || !this.canvas) return;
    // Get fill color from LCInstance (secondary is fill)
    this.color = lc.getColor('secondary') || '#000000';
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const targetColor = this.getPixel(imageData, Math.round(x), Math.round(y));
    const fillColor = this.hexToRgba(this.color);
    if (!targetColor || !fillColor || this.colorsMatch(targetColor, fillColor)) return;
    this.floodFill(imageData, Math.round(x), Math.round(y), targetColor, fillColor);
    this.ctx.putImageData(imageData, 0, 0);
    lc.trigger('drawingChange');
  }

  // Flood fill algorithm (4-way)
  private floodFill(imageData: ImageData, x: number, y: number, target: number[], fill: number[]): void {
    const { width, height, data } = imageData;
    const stack: [number, number][] = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      const idx = (cy * width + cx) * 4;
      if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
      if (!this.colorsMatch(data.slice(idx, idx + 4), target)) continue;
      // Set pixel to fill color
      for (let i = 0; i < 4; i++) data[idx + i] = fill[i];
      stack.push([cx + 1, cy]);
      stack.push([cx - 1, cy]);
      stack.push([cx, cy + 1]);
      stack.push([cx, cy - 1]);
    }
  }

  // Get RGBA array for pixel at (x, y)
  private getPixel(imageData: ImageData, x: number, y: number): number[] | null {
    const { width, height, data } = imageData;
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const idx = (y * width + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  }

  // Compare two RGBA arrays (tolerance for anti-aliasing)
  private colorsMatch(a: number[] | Uint8ClampedArray, b: number[], tolerance = 16): boolean {
    for (let i = 0; i < 4; i++) {
      if (Math.abs(a[i] - b[i]) > tolerance) return false;
    }
    return true;
  }

  // Convert hex color to RGBA array
  private hexToRgba(hex: string): number[] {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map((ch) => ch + ch).join('');
    const num = parseInt(c, 16);
    return [
      (num >> 16) & 255,
      (num >> 8) & 255,
      num & 255,
      255,
    ];
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
  
}