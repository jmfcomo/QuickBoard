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
import { AppStore } from '../../../data/store/app.store';
import { Brush } from '../../canvas/tools/brush';
import { LCInstance, LCTool } from '../literally-canvas-interfaces';

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
    { id: 'brush', label: 'Brush', icon: '🖌️' },
    { id: 'eraser', label: 'Eraser', icon: '🧹' },
  ];

  readonly store = inject(AppStore);
  private lc: LCInstance | null = null;
  private toolInstances = new Map<string, LCTool>();
  private platformId = inject(PLATFORM_ID);
  private updateCanvasTimeout: number | null = null;

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
    const existingData = this.store.canvasData();
    if (existingData) {
      this.lc.loadSnapshot(existingData);
    }

    this.lc.on('drawingChange', () => {
      if (this.lc) {
        // Debounce the canvas data update to avoid excessive store updates
        if (this.updateCanvasTimeout !== null) {
          clearTimeout(this.updateCanvasTimeout);
        }
        this.updateCanvasTimeout = window.setTimeout(() => {
          if (this.lc) {
            this.store.updateCanvasData(this.lc.getSnapshot());
          }
          this.updateCanvasTimeout = null;
        }, 300); // Wait 300ms after the last drawing change
      }
    });

    // Initialize tool instances
    this.toolInstances.set('pencil', new LC.tools.Pencil(this.lc));
    this.toolInstances.set('eraser', new LC.tools.Eraser(this.lc));
    this.toolInstances.set('brush', new Brush(this.lc));

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
