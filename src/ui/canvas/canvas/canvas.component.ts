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
import { ObjectEraser } from '../../canvas/tools/objecteraser';
import { BucketFill } from '../tools/bucketfill';
import { LCInstance, LCTool } from '../literally-canvas-interfaces';

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css'],
})
export class CanvasComponent implements AfterViewInit, OnDestroy {
  private readonly defaultCanvasSize = { width: 1920, height: 1080 };
  readonly canvasContainer = viewChild.required<ElementRef<HTMLElement>>('canvasContainer');
  readonly activeTool = signal<string>('pencil');
  readonly strokeColor = signal<string>('#000000');
  readonly fillColor = signal<string>('#ffffff');
  readonly backgroundColor = signal<string>('#ffffff');

  readonly tools = [
    { id: 'pencil', label: 'Pencil', icon: '✏️' },
    { id: 'brush', label: 'Brush', icon: '🖌️' },
    { id: 'rectangle', label: 'Rectangle', icon: '⬜' },
    { id: 'eraser', label: 'Eraser', icon: '🧽' },
    { id: 'object-eraser', label: 'Object Eraser', icon: '🧹' },
    { id: 'bucket-fill', label: 'Bucket Fill', icon: '🪣' }
  ];

  readonly colorPickers = [
    {
      label: 'Stroke',
      signal: this.strokeColor,
      setter: this.setStrokeColor.bind(this),
      quickColors: ['transparent', '#000000'],
    },
    {
      label: 'Fill',
      signal: this.fillColor,
      setter: this.setFillColor.bind(this),
      quickColors: ['transparent', '#ffffff'],
    },
    {
      label: 'BG',
      signal: this.backgroundColor,
      setter: this.setBackgroundColor.bind(this),
      quickColors: ['#ffffff', '#000000'],
    },
  ];

  readonly store = inject(AppStore);
  private lc: LCInstance | null = null;
  private toolInstances = new Map<string, LCTool>();
  private platformId = inject(PLATFORM_ID);
  private currentBoardId: string | null = null;
  private updateCanvasTimeout: number | null = null;
  private initCanvasTimeout: number | null = null;
  private lastLoadedCanvasData: Record<string, unknown> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Tooltip
  readonly tooltipText = signal('');
  readonly tooltipVisible = signal(false);
  readonly tooltipTop = signal(0);
  readonly tooltipLeft = signal(0);
  private tooltipDelay: number | null = null;
  private tooltipCooldown: number | null = null;
  private tooltipWarm = false;

  constructor() {
    effect(() => {
      const selectedBoardId = this.store.currentBoardId();
      const boards = this.store.boards();

      if (!this.lc || !selectedBoardId) return;

      const currentBoard = boards.find((b) => b.id === selectedBoardId);
      const boardIdChanged = selectedBoardId !== this.currentBoardId;
      const canvasDataChanged = currentBoard?.canvasData !== this.lastLoadedCanvasData;

      // Only reload when switching boards or when the canvas data reference changes
      if (boardIdChanged) {
        // Save current board data before switching
        if (this.currentBoardId && this.lc) {
          this.store.updateCanvasData(this.currentBoardId, this.lc.getSnapshot());
          this.store.updateBackgroundColor(this.currentBoardId, this.lc.getColor('background'));
        }
        this.loadBoardData(selectedBoardId);
      } else if (canvasDataChanged) {
        this.loadBoardData(selectedBoardId);
      }
    });
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId) && typeof LC !== 'undefined') {
      this.initCanvasTimeout = window.setTimeout(() => {
        this.initializeCanvas();
        // Ensure preview is generated for the first board if missing
        const boards = this.store.boards();
        const firstBoard = boards[0];
        if (firstBoard && !firstBoard.previewUrl) {
          // Generate preview for empty board
          if (this.lc) {
            // Render background color
            this.lc.setColor('background', firstBoard.backgroundColor ?? '#ffffff');
            this.lc.repaintLayer('main');
            // Save preview
            const snapshot = this.lc.getSnapshot();
            const preview = this.lc.getImage({ scale: 0.2 }).toDataURL('image/png');
            this.store.updateCanvasData(firstBoard.id, snapshot, preview);
          }
        }
      }, 0);
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

    this.clearTimer('tooltipDelay');
    this.clearTimer('tooltipCooldown');
  }

  private initializeCanvas(): void {
    // Clear the init timeout reference as it has already fired
    this.initCanvasTimeout = null;

    const container = this.canvasContainer().nativeElement;

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
            const snapshot = this.lc.getSnapshot();
            this.lastLoadedCanvasData = snapshot;

            const preview = this.lc.getImage({ scale: 0.2 }).toDataURL('image/png');

            this.store.updateCanvasData(this.currentBoardId, snapshot, preview);
          }
          this.updateCanvasTimeout = null;
        }, 300);
      }
    });

    // Initialize tool instances
    this.toolInstances.set('pencil', new LC.tools.Pencil(this.lc));
    this.toolInstances.set('eraser', new LC.tools.Eraser(this.lc));
    this.toolInstances.set('brush', new Brush(this.lc));
    this.toolInstances.set('object-eraser', new ObjectEraser(this.lc));
    this.toolInstances.set('rectangle', new LC.tools.Rectangle(this.lc));
    this.toolInstances.set('bucket-fill', new BucketFill(this.lc));

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
      // Track the loaded data reference
      this.lastLoadedCanvasData = board.canvasData;
    } else {
      this.lc.repaintLayer('main');
      this.lastLoadedCanvasData = null;
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

    const container = this.canvasContainer().nativeElement;
    this.resizeObserver = new ResizeObserver(() => this.scheduleCanvasFit());
    this.resizeObserver.observe(container);
  }

  private scheduleCanvasFit(): void {
    if (!this.lc) return;

    window.requestAnimationFrame(() => this.fitCanvasToContainer());
  }

  private fitCanvasToContainer(): void {
    if (!this.lc) return;

    const container = this.canvasContainer().nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;

    const scale = Math.min(
      width / this.defaultCanvasSize.width,
      height / this.defaultCanvasSize.height,
    );

    if (!Number.isFinite(scale) || scale <= 0) return;

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

  public showTooltip(event: MouseEvent, label: string): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.tooltipText.set(label);
    this.tooltipTop.set(rect.top + rect.height / 2);
    this.tooltipLeft.set(rect.right + 8);
    this.clearTimer('tooltipCooldown');

    if (this.tooltipWarm) {
      this.tooltipVisible.set(true);
    } else {
      this.tooltipDelay = window.setTimeout(() => {
        this.tooltipVisible.set(true);
        this.tooltipWarm = true;
        this.tooltipDelay = null;
      }, 500);
    }
  }

  public hideTooltip(): void {
    this.clearTimer('tooltipDelay');
    this.tooltipVisible.set(false);
    this.tooltipCooldown = window.setTimeout(() => {
      this.tooltipWarm = false;
      this.tooltipCooldown = null;
    }, 400);
  }

  private clearTimer(key: 'tooltipDelay' | 'tooltipCooldown'): void {
    if (this[key] !== null) { clearTimeout(this[key]!); this[key] = null; }
  }
}
