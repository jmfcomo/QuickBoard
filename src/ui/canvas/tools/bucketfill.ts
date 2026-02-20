import { LCInstance } from '../literally-canvas-interfaces';

// Fill Tool - fills an area with a color
export class BucketFill {
  name = 'Bucket Fill';
  iconName = 'bucket-fill';
  optionsStyle = '';
  usesSimpleAPI = true;

  // Render source image at half resolution for faster flood fill (4× fewer pixels).
  // The saved Image shape uses scale: 2 to stretch it back to full world size.
  private static readonly SRC_SCALE = 0.5;

  constructor(private lc: LCInstance) { /* no-op */ }

  begin(x: number, y: number, lc: LCInstance): void {
    const color = lc.getColor('secondary') || '#000000';
    const fillColor = this.hexToRgba(color);
    if (!fillColor) return;

    const srcScale = BucketFill.SRC_SCALE;

    // Get a composite snapshot (background color + all shapes) at reduced resolution.
    const sourceCanvas = lc.getImage({ scale: srcScale });
    if (!sourceCanvas) return;

    const { width, height } = sourceCanvas;
    const sourceCtx = sourceCanvas.getContext('2d');
    if (!sourceCtx) return;

    // x, y are world coordinates — scale them to match the source canvas.
    const px = Math.round(x * srcScale);
    const py = Math.round(y * srcScale);
    if (px < 0 || py < 0 || px >= width || py >= height) return;

    const imageData = sourceCtx.getImageData(0, 0, width, height);
    const targetColor = this.getPixel(imageData, px, py);
    if (!targetColor || this.colorsMatch(targetColor, fillColor)) return;

    // Flood fill into a separate transparent canvas (only filled pixels are set).
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d')!;
    const fillData = new ImageData(width, height); // all transparent initially
    this.floodFill(imageData, fillData, px, py, targetColor, fillColor);
    offCtx.putImageData(fillData, 0, 0);

    // Create the Image element and save the shape immediately (without waiting for
    // onload). LC's image renderer has a built-in retry mechanism: if the image
    // isn't loaded when a repaint occurs, it sets img.onload = retryCallback so
    // another repaint fires as soon as the image is ready.
    const img = new Image();
    img.src = offscreen.toDataURL('image/png');

    const shape = LC.createShape('Image', {
      x: 0,
      y: 0,
      image: img,
      scale: 1 / srcScale, // stretches the half-res image back to full world size
    });
    lc.saveShape(shape);
  }

  // Flood fill from source ImageData into output ImageData (separate read/write
  // buffers prevent the fill from consuming its own written pixels).
  private floodFill(
    source: ImageData,
    output: ImageData,
    x: number,
    y: number,
    target: number[],
    fill: number[],
  ): void {
    const { width, height } = source;
    const visited = new Uint8Array(width * height);
    const stack: [number, number][] = [[x, y]];

    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
      const flat = cy * width + cx;
      if (visited[flat]) continue;
      visited[flat] = 1;

      const idx = flat * 4;
      if (!this.colorsMatch(source.data.slice(idx, idx + 4), target)) continue;

      for (let i = 0; i < 4; i++) output.data[idx + i] = fill[i];

      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  private getPixel(imageData: ImageData, x: number, y: number): number[] | null {
    const { width, height, data } = imageData;
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const idx = (y * width + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  }

  private colorsMatch(a: number[] | Uint8ClampedArray, b: number[], tolerance = 16): boolean {
    for (let i = 0; i < 4; i++) {
      if (Math.abs(a[i] - b[i]) > tolerance) return false;
    }
    return true;
  }

  // Returns null for non-hex colors (e.g. 'transparent' → 'hsla(...)').
  private hexToRgba(hex: string): number[] | null {
    const clean = hex.replace('#', '');
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(clean)) return null;
    const expanded = clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean;
    const num = parseInt(expanded, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
  }

  end(): void { /* no-op */ }
  ['continue'](): void { /* no-op */ }

  willBecomeActive(): void { /* no-op */ }
  didBecomeActive(): void { /* no-op */ }
  willBecomeInactive(): void { /* no-op */ }
  didBecomeInactive(): void { /* no-op */ }
}
