import {
  Component,
  ElementRef,
  AfterViewInit,
  signal,
  viewChild,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

interface LCTool {
  willBecomeActive?(lc: LCInstance): void;
  didBecomeActive?(lc: LCInstance): void;
}

interface LCInstance {
  setTool(tool: LCTool): void;
  backgroundShapes: unknown[];
  shapes: unknown[];
  repaintLayer(layer: string): void;
  trigger(event: string, data?: unknown): void;
}

type LiterallyCanvasTool = new (lc: LCInstance) => LCTool;

interface LiterallyCanvas {
  init(element: HTMLElement, options?: { imageURLPrefix?: string }): LCInstance;
  tools: {
    Pencil: LiterallyCanvasTool;
    Eraser: LiterallyCanvasTool;
  };
}

declare const LC: LiterallyCanvas;

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css'],
})
export class CanvasComponent implements AfterViewInit {
  readonly canvasContainer = viewChild.required<ElementRef<HTMLElement>>('canvasContainer');
  readonly activeTool = signal<string>('pencil');

  readonly tools = [
    { id: 'pencil', label: 'Pencil', icon: '✏️' },
    { id: 'eraser', label: 'Eraser', icon: '🧹' },
  ];

  private lc: LCInstance | null = null;
  private toolInstances = new Map<string, LCTool>();
  private platformId = inject(PLATFORM_ID);

  ngAfterViewInit() {
    // Ensure we are in the browser and not in a test runner that might lack global objects
    if (isPlatformBrowser(this.platformId) && typeof LC !== 'undefined') {
      // Use a small timeout to let the view settle/paint if necessary
      setTimeout(() => this.initializeCanvas(), 0);
    }
  }

  private initializeCanvas(): void {
    const container = this.canvasContainer().nativeElement;

    // Initialize Literally Canvas
    this.lc = LC.init(container, {
      imageURLPrefix: 'assets/lc-images',
    });

    // Initialize tool instances
    this.toolInstances.set('pencil', new LC.tools.Pencil(this.lc));
    this.toolInstances.set('eraser', new LC.tools.Eraser(this.lc));

    // Activate the default tool
    this.setTool('pencil');
  }

  public setTool(toolId: string): void {
    if (!this.lc || !this.toolInstances.has(toolId)) return;

    const tool = this.toolInstances.get(toolId);
    if (tool) {
      this.lc.setTool(tool);
      this.activeTool.set(toolId);
    }
  }

  public clearCanvas(): void {
    if (!this.lc) return;

    // Clear all shapes
    this.lc.shapes = [];
    this.lc.backgroundShapes = [];
    this.lc.repaintLayer('main');

    // Trigger clear event
    this.lc.trigger('clear');
  }
}
