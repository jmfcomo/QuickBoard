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
  readonly strokeColor = signal<string>('#000000');
  readonly fillColor = signal<string>('#ffffff');

  readonly tools = [
    { id: 'pencil', label: 'Pencil', icon: '✏️' },
    { id: 'brush', label: 'Brush', icon: '🖌️' },
    { id: 'eraser', label: 'Eraser', icon: '🧽' },
  ];

  readonly colorPickers = [
    { label: 'Stroke', signal: this.strokeColor, setter: this.setStrokeColor.bind(this), quickColors: ['transparent', '#000000'] },
    { label: 'Fill', signal: this.fillColor, setter: this.setFillColor.bind(this), quickColors: ['transparent', '#ffffff'] },
  ];

  readonly store = inject(AppStore);
  private lc: LCInstance | null = null;
  private toolInstances = new Map<string, LCTool>();
  private platformId = inject(PLATFORM_ID);
  private currentBoardId: string | null = null;
  private updateCanvasTimeout: number | null = null;
  private initCanvasTimeout: number | null = null;

  constructor() {
    // Watch for board changes and reload canvas data
    effect(() => {
      const selectedBoardId = this.store.currentBoardId();
      if (this.lc && selectedBoardId && selectedBoardId !== this.currentBoardId) {
        // Save current board data before switching
        if (this.currentBoardId && this.lc) {
          this.store.updateCanvasData(this.currentBoardId, this.lc.getSnapshot());
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

    // Clear tool instances to release references
    this.toolInstances.clear();
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

    // Initialize Literally Canvas
    this.lc = LC.init(container, {
      imageURLPrefix: 'assets/lc-images',
    });

    if (currentBoard?.canvasData) {
      this.lc.loadSnapshot(currentBoard.canvasData);
    }

    this.lc.on('drawingChange', () => {
      if (this.lc) {
        // Debounce the canvas data update to avoid excessive store updates
        if (this.updateCanvasTimeout !== null) {
          clearTimeout(this.updateCanvasTimeout);
        }
        this.updateCanvasTimeout = window.setTimeout(() => {
          if (this.lc && this.currentBoardId) {
            this.store.updateCanvasData(this.currentBoardId, this.lc.getSnapshot());
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
}
