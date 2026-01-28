export interface LCTool {
  name?: string;
  iconName?: string;
  strokeWidth?: number;
  optionsStyle?: string;
  willBecomeActive?(lc: LCInstance): void;
  didBecomeActive?(lc: LCInstance): void;
  begin?(x: number, y: number, lc: LCInstance): void;
  ['continue']?(x: number, y: number, lc: LCInstance): void;
  end?(x: number, y: number, lc: LCInstance): void;
  willBecomeInactive?(lc: LCInstance): void;
  didBecomeInactive?(lc: LCInstance): void;
}

export interface LCInstance {
  setTool(tool: LCTool): void;
  backgroundShapes: unknown[];
  shapes: unknown[];
  repaintLayer(layer: string): void;
  trigger(event: string, data?: unknown): void;
  tool: LCTool;
  getColor(type: string): string;
  setShapesInProgress(shapes: unknown[]): void;
  saveShape(shape: unknown): void;
  on(event: string, handler: (data: unknown) => void): void;
  getSnapshot(): Record<string, unknown>;
  loadSnapshot(snapshot: Record<string, unknown>): void;
}

export type LiterallyCanvasTool = new (lc: LCInstance) => LCTool;

export interface LiterallyCanvas {
  init(element: HTMLElement, options?: { imageURLPrefix?: string }): LCInstance;
  tools: {
    Pencil: LiterallyCanvasTool;
    Eraser: LiterallyCanvasTool;
  };
  createShape(type: string, args: Record<string, unknown>): unknown;
}

declare global {
  const LC: LiterallyCanvas;
}
