import {
  Component,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  signal,
  viewChild,
  inject,
  PLATFORM_ID,
  effect,
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
export class CanvasComponent implements AfterViewInit, OnDestroy {
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
  private currentFrameId: string | null = null;
  private updateCanvasTimeout: number | null = null;
  private initCanvasTimeout: number | null = null;

  constructor() {
    // Watch for frame changes and reload canvas data
    effect(() => {
      const selectedFrameId = this.store.currentFrameId();
      if (this.lc && selectedFrameId && selectedFrameId !== this.currentFrameId) {
        // Save current frame data before switching
        if (this.currentFrameId && this.lc) {
          this.store.updateCanvasData(this.currentFrameId, this.lc.getSnapshot());
        }
        this.loadFrameData(selectedFrameId);
      }
    });
  }

  ngAfterViewInit() {
    // Ensure we are in the browser and not in a test runner that might lack global objects
    if (isPlatformBrowser(this.platformId) && typeof LC !== 'undefined') {
      // Use a small timeout to let the view settle/paint if necessary
      this.initCanvasTimeout = window.setTimeout(() => this.initializeCanvas(), 0);
    }
  }

  ngOnDestroy() {
    // Clear the initialization timeout to prevent it from executing after destruction
    if (this.initCanvasTimeout !== null) {
      clearTimeout(this.initCanvasTimeout);
      this.initCanvasTimeout = null;
    }

    // Clear the update timeout to prevent memory leaks and errors after component destruction
    if (this.updateCanvasTimeout !== null) {
      clearTimeout(this.updateCanvasTimeout);
      this.updateCanvasTimeout = null;
    }

    // Clean up LiterallyCanvas instance and event listeners
    if (this.lc) {
      this.lc.teardown();
      this.lc = null;
    }

    // Clear tool instances to release references
    this.toolInstances.clear();
  }

  private initializeCanvas(): void {
    // Clear the init timeout reference as it has already fired
    this.initCanvasTimeout = null;

    const container = this.canvasContainer().nativeElement;

    // Get the current frame or first frame
    const frames = this.store.frames();
    const currentFrame = frames.find((f) => f.id === this.store.currentFrameId()) || frames[0];
    if (currentFrame) {
      this.currentFrameId = currentFrame.id;
    }

    // Initialize Literally Canvas
    this.lc = LC.init(container, {
      imageURLPrefix: 'assets/lc-images',
    });

    if (currentFrame?.canvasData) {
      this.lc.loadSnapshot(currentFrame.canvasData);
    }

    this.lc.on('drawingChange', () => {
      if (this.lc) {
        // Debounce the canvas data update to avoid excessive store updates
        if (this.updateCanvasTimeout !== null) {
          clearTimeout(this.updateCanvasTimeout);
        }
        this.updateCanvasTimeout = window.setTimeout(() => {
          if (this.lc && this.currentFrameId) {
            this.store.updateCanvasData(this.currentFrameId, this.lc.getSnapshot());
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

  private loadFrameData(frameId: string) {
    if (!this.lc) return;

    const frames = this.store.frames();
    const frame = frames.find(f => f.id === frameId);
    
    this.currentFrameId = frameId;
    
    // Clear canvas
    this.lc.shapes = [];
    this.lc.backgroundShapes = [];
    
    // Load new frame data
    if (frame?.canvasData) {
      this.lc.loadSnapshot(frame.canvasData);
    } else {
      this.lc.repaintLayer('main');
    }
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
