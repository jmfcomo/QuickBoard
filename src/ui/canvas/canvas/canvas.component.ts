import { Component, ViewChild, ElementRef, AfterViewInit } from '@angular/core';

interface LCTool {
  willBecomeActive?(lc: LCInstance): void;
  didBecomeActive?(lc: LCInstance): void;
}

interface LCInstance {
  setTool(tool: LCTool): void;
  backgroundShapes: unknown[];
  shapes: unknown[];
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

interface CanvasTool {
  name: string;
  el: HTMLElement | null;
  tool: LCTool;
}

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css'],
})
export class CanvasComponent implements AfterViewInit {
  @ViewChild('canvasContainer') canvasContainer!: ElementRef;
  private lc: LCInstance | null = null;
  tools: CanvasTool[] = [];

  ngAfterViewInit() {
    setTimeout(() => this.initializeCanvas(), 0);
  }

  private initializeCanvas(): void {
    if (!this.canvasContainer) {
      console.error('Canvas container not found');
      return;
    }

    if (typeof LC === 'undefined') {
      console.error('Literally Canvas library not loaded');
      return;
    }

    // Initialize Literally Canvas
    this.lc = LC.init(this.canvasContainer.nativeElement, {
      imageURLPrefix: 'assets/lc-images',
    });

    // Define tools
    this.tools = [
      {
        name: 'pencil',
        el: document.getElementById('tool-pencil'),
        tool: new LC.tools.Pencil(this.lc),
      },
      {
        name: 'eraser',
        el: document.getElementById('tool-eraser'),
        tool: new LC.tools.Eraser(this.lc),
      },
    ];

    // Setup tool click handlers
    this.tools.forEach((t) => {
      if (t.el) {
        t.el.style.cursor = 'pointer';
        t.el.onclick = (e: Event) => {
          e.preventDefault();
          this.activateTool(t);
        };
      }
    });

    // Activate first tool by default
    if (this.tools.length > 0) {
      this.activateTool(this.tools[0]);
    }
  }

  private activateTool(tool: CanvasTool): void {
    if (!this.lc) return;

    this.lc.setTool(tool.tool);

    this.tools.forEach((t) => {
      if (tool === t) {
        if (t.el) t.el.style.backgroundColor = '#fbbf24';
      } else {
        if (t.el) t.el.style.backgroundColor = 'transparent';
      }
    });
  }
}
