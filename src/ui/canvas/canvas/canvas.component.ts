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
import { Brush } from '../../canvas/tools/tools';
import { LCInstance, LCTool } from '../literally-canvas-interfaces';

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css'],
})
export class CanvasComponent implements AfterViewInit, OnDestroy {
  private readonly defaultCanvasSize = { width: 1920, height: 1080 };
  readonly canvasContainer = viewChild.required<ElementRef<HTMLElement>>('canvasContainer');
  readonly canvasStage = viewChild.required<ElementRef<HTMLElement>>('canvasStage');
  readonly activeTool = signal<string>('pencil');
  readonly strokeColor = signal<string>('#000000');
  readonly fillColor = signal<string>('#ffffff');
  readonly backgroundColor = signal<string>('#ffffff');

  readonly tools = [
    { id: 'pencil', label: 'Pencil', icon: '✏️' },
    { id: 'brush', label: 'Brush', icon: '🖌️' },
    { id: 'eraser', label: 'Eraser', icon: '🧽' },
    { id: 'rectangle', label: 'Rectangle', icon: '⬜' },
  ];

  readonly colorPickers = [
    { label: 'Stroke', signal: this.strokeColor, setter: this.setStrokeColor.bind(this), quickColors: ['transparent', '#000000'] },
    { label: 'Fill', signal: this.fillColor, setter: this.setFillColor.bind(this), quickColors: ['transparent', '#ffffff'] },
    { label: 'BG', signal: this.backgroundColor, setter: this.setBackgroundColor.bind(this), quickColors: ['#ffffff', '#000000'] },
  ];

  readonly store = inject(AppStore);
  private lc: LCInstance | null = null;
  private toolInstances = new Map<string, LCTool>();
  private platformId = inject(PLATFORM_ID);
  private currentBoardId: string | null = null;
  private updateCanvasTimeout: number | null = null;
  private initCanvasTimeout: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    // Watch for board changes and reload canvas data
    effect(() => {
      const selectedBoardId = this.store.currentBoardId();
      if (this.lc && selectedBoardId && selectedBoardId !== this.currentBoardId) {
        // Save current board data before switching
        if (this.currentBoardId && this.lc) {
          this.store.updateCanvasData(this.currentBoardId, this.lc.getSnapshot());
          this.store.updateBackgroundColor(this.currentBoardId, this.lc.getColor('background'));
        }
        this.loadBoardData(selectedBoardId);
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

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clear tool instances to release references
    this.toolInstances.clear();
  }

  private initializeCanvas(): void {
    // Clear the init timeout reference as it has already fired
    this.initCanvasTimeout = null;

    const container = this.canvasContainer().nativeElement;
    const stage = this.canvasStage().nativeElement;

    // Size the container BEFORE LC.init so LC reads the correct dimensions
    // from the very first frame — this eliminates the snap/flash bug.
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    if (stageW > 0 && stageH > 0) {
      const initScale = Math.min(
        stageW / this.defaultCanvasSize.width,
        stageH / this.defaultCanvasSize.height
      );
      container.style.width = `${Math.round(this.defaultCanvasSize.width * initScale)}px`;
      container.style.height = `${Math.round(this.defaultCanvasSize.height * initScale)}px`;
      // Force layout so LC.init reads the updated dimensions
      void container.offsetWidth;
    }

    // Get the current board or first board
    const boards = this.store.boards();
    const currentBoard = boards.find((b) => b.id === this.store.currentBoardId()) || boards[0];
    if (currentBoard) {
      this.currentBoardId = currentBoard.id;
    }

    // Initialize Literally Canvas — container is already at the correct size
    this.lc = LC.init(container, {
      imageURLPrefix: 'assets/lc-images',
    });

    this.lc.setImageSize(this.defaultCanvasSize.width, this.defaultCanvasSize.height);

    if (currentBoard?.canvasData) {
      this.lc.loadSnapshot(currentBoard.canvasData);
    }
    const initialBackground = currentBoard?.backgroundColor ?? '#ffffff';
    this.lc.setColor('background', initialBackground);
    this.backgroundColor.set(initialBackground);

    // Apply the initial zoom now (synchronously, no rAF needed)
    this.fitCanvasToContainer();
    this.observeCanvasResize();

    this.lc.on('drawingChange', () => {
      if (this.lc) {
        // Debounce the canvas data update to avoid excessive store updates
        if (this.updateCanvasTimeout !== null) {
          clearTimeout(this.updateCanvasTimeout);
        }
        this.updateCanvasTimeout = window.setTimeout(() => {
          if (this.lc && this.currentBoardId) {
            const preview = this.lc.getImage({ scale: 0.2 }).toDataURL('image/png');
            this.store.updateCanvasData(this.currentBoardId, this.lc.getSnapshot(), preview);
          }
          this.updateCanvasTimeout = null;
        }, 300); // Wait 300ms after the last drawing change
      }
    });

    // Initialize tool instances
    this.toolInstances.set('pencil', new LC.tools.Pencil(this.lc));
    this.toolInstances.set('eraser', new LC.tools.Eraser(this.lc));
    this.toolInstances.set('brush', new Brush(this.lc));
    this.toolInstances.set('rectangle', new LC.tools.Rectangle(this.lc));

    // Activate the default tool
    this.setTool('pencil');
  }

  private loadBoardData(boardId: string) {
    if (!this.lc) return;

    const boards = this.store.boards();
    const board = boards.find((b) => b.id === boardId);

    this.currentBoardId = boardId;

    // Clear canvas
    this.lc.shapes = [];
    this.lc.backgroundShapes = [];

    // Load new board data
    if (board?.canvasData) {
      this.lc.loadSnapshot(board.canvasData);
    } else {
      this.lc.repaintLayer('main');
    }
    this.lc.setImageSize(this.defaultCanvasSize.width, this.defaultCanvasSize.height);
    const boardBackground = board?.backgroundColor ?? '#ffffff';
    this.lc.setColor('background', boardBackground);
    this.backgroundColor.set(boardBackground);
    this.fitCanvasToContainer();
  }

  private observeCanvasResize(): void {
    if (!this.lc || typeof ResizeObserver === 'undefined') return;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    const container = this.canvasStage().nativeElement;
    this.resizeObserver = new ResizeObserver(() => this.scheduleCanvasFit());
    this.resizeObserver.observe(container);
  }

  private scheduleCanvasFit(): void {
    if (!this.lc) return;

    window.requestAnimationFrame(() => this.fitCanvasToContainer());
  }

  private fitCanvasToContainer(): void {
    if (!this.lc) return;

    const stage = this.canvasStage().nativeElement;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width <= 0 || height <= 0) return;

    const scale = Math.min(
      width / this.defaultCanvasSize.width,
      height / this.defaultCanvasSize.height
    );

    if (!Number.isFinite(scale) || scale <= 0) return;

    const container = this.canvasContainer().nativeElement;
    const targetWidth = Math.round(this.defaultCanvasSize.width * scale);
    const targetHeight = Math.round(this.defaultCanvasSize.height * scale);
    container.style.width = `${targetWidth}px`;
    container.style.height = `${targetHeight}px`;

    void container.offsetWidth;

    if (this.lc.respondToSizeChange) {
      this.lc.respondToSizeChange();
    }

    this.lc.setZoom(scale);
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

  public setStrokeColor(color: string): void {
    if (!this.lc) return;
    
    // Handle transparent color
    const colorValue = color === 'transparent' ? 'hsla(0, 0%, 0%, 0)' : color;
    this.strokeColor.set(color);
    this.lc.setColor('primary', colorValue);
  }

  public setFillColor(color: string): void {
    if (!this.lc) return;
    
    // Handle transparent color
    const colorValue = color === 'transparent' ? 'hsla(0, 0%, 100%, 0)' : color;
    this.fillColor.set(color);
    this.lc.setColor('secondary', colorValue);
  }

  public setBackgroundColor(color: string): void {
    if (!this.lc) return;
    this.backgroundColor.set(color);
    this.lc.setColor('background', color);
    if (this.currentBoardId) {
      this.store.updateBackgroundColor(this.currentBoardId, color);
    }
  }
}
