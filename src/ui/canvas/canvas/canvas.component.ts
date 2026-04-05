import {
  Component,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  signal,
  computed,
  viewChild,
  inject,
  PLATFORM_ID,
  effect,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AppStore } from '../../../data/store/app.store';
import { PropertiesBarComponent } from '../properties-bar/properties-bar.component';
import { Brush, ensureSquareBrushShapeRegistered } from '../../canvas/tools/brush';
import { ObjectEraser } from '../../canvas/tools/objecteraser';
import { BucketFill } from '../tools/bucketfill';
import { LCInstance, LCTool } from '../literally-canvas-interfaces';
import { UndoRedoService } from '../../../services/undo-redo.service';
import { CanvasDataService } from '../../../services/canvas-data.service';

@Component({
  selector: 'app-canvas',
  imports: [PropertiesBarComponent],
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css'],
})
export class CanvasComponent implements AfterViewInit, OnDestroy {
  private readonly defaultCanvasSize = { width: 1920, height: 1080 };
  private readonly boardPreviewScale = 0.2;
  private readonly previewDebounceMs = 160;
  private readonly onionPreviewCache = signal<Record<string, string>>({});
  readonly onionSkinLayers = computed(() => {
    if (!this.store.onionSkinEnabled() || this.store.isPlaying()) {
      return [] as { id: string; onionPreviewUrl: string; position: 'prev' | 'next' }[];
    }

    const boards = this.store.boards();
    const currentBoardId = this.store.currentBoardId();
    if (!currentBoardId || boards.length < 2) {
      return [] as { id: string; onionPreviewUrl: string; position: 'prev' | 'next' }[];
    }

    const currentIndex = boards.findIndex((board) => board.id === currentBoardId);
    if (currentIndex === -1) {
      return [] as { id: string; onionPreviewUrl: string; position: 'prev' | 'next' }[];
    }

    const onionPreviewCache = this.onionPreviewCache();
    const overlays: { id: string; onionPreviewUrl: string; position: 'prev' | 'next' }[] = [];
    const previousBoard = currentIndex > 0 ? boards[currentIndex - 1] : null;
    const nextBoard = currentIndex < boards.length - 1 ? boards[currentIndex + 1] : null;
    const previousOnionPreview = previousBoard ? onionPreviewCache[previousBoard.id] : undefined;
    const nextOnionPreview = nextBoard ? onionPreviewCache[nextBoard.id] : undefined;

    // For middle boards, render both neighbors together so onion skin does not pop in one side at a time.
    if (previousBoard && nextBoard) {
      if (!previousOnionPreview || !nextOnionPreview) {
        return overlays;
      }

      overlays.push({
        id: previousBoard.id,
        onionPreviewUrl: previousOnionPreview,
        position: 'prev',
      });
      overlays.push({
        id: nextBoard.id,
        onionPreviewUrl: nextOnionPreview,
        position: 'next',
      });
      return overlays;
    }

    if (previousBoard && previousOnionPreview) {
      overlays.push({
        id: previousBoard.id,
        onionPreviewUrl: previousOnionPreview,
        position: 'prev',
      });
    }

    if (nextBoard && nextOnionPreview) {
      overlays.push({
        id: nextBoard.id,
        onionPreviewUrl: nextOnionPreview,
        position: 'next',
      });
    }

    return overlays;
  });
  readonly canvasContainer = viewChild.required<ElementRef<HTMLElement>>('canvasContainer');
  readonly activeTool = signal<string>('pencil');
  readonly selectedShape = signal<'rectangle' | 'circle'>('rectangle');
  readonly showShapeSubmenu = signal(false);
  readonly shapeSubmenuTop = signal(0);
  readonly isShapeToolActive = computed(() => {
    const toolId = this.activeTool();
    return toolId === 'rectangle' || toolId === 'circle';
  });
  private readonly toolSizeMap = signal<Record<string, number>>({
    pencil: 5,
    brush: 5,
    rectangle: 5,
    circle: 5,
    eraser: 5,
  });
  readonly strokeSize = computed(() => this.toolSizeMap()[this.activeTool()] ?? 5);
  readonly brushSpacing = signal<number>(45);
  readonly colorTolerance = signal<number>(16);
  readonly strokeColor = signal<string>('#000000');
  readonly fillColor = signal<string>('#ffffff');
  readonly backgroundColor = signal<string>('#ffffff');
  readonly onionLayerRect = signal({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  readonly onionImageRect = signal({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });

  readonly tools = [
    { id: 'pencil', label: 'Pencil', icon: '✏️' },
    { id: 'brush', label: 'Brush', icon: '🖌️' },
    { id: 'eraser', label: 'Eraser', icon: '🧽' },
    { id: 'object-eraser', label: 'Object Eraser', icon: '🧹' },
    { id: 'bucket-fill', label: 'Bucket Fill', icon: '🪣' },
  ];
  readonly shapeTools = [
    { id: 'rectangle', label: 'Rectangle', icon: '⬜' },
    { id: 'circle', label: 'Circle', icon: '⚪' },
  ] as const;
  readonly selectedShapeTool = computed(() => {
    const current = this.selectedShape();
    return this.shapeTools.find((tool) => tool.id === current) ?? this.shapeTools[0];
  });

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
  private readonly el = inject(ElementRef);
  private readonly undoRedo = inject(UndoRedoService);
  private readonly canvasDataService = inject(CanvasDataService);
  private lc: LCInstance | null = null;
  private toolInstances = new Map<string, LCTool>();
  private platformId = inject(PLATFORM_ID);
  private currentBoardId: string | null = null;
  private initCanvasTimeout: number | null = null;
  private updateCanvasTimeout: number | null = null;
  private lastLoadedCanvasData: Record<string, unknown> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeRafId: number | null = null;
  private lastFitHeight = 0;
  private readonly onWindowResize = () => this.scheduleCanvasFit();
  /** Set to true while we are programmatically calling lc.undo()/redo() so that
   * the drawingChange listener doesn't create a duplicate history entry. */
  private _suppressLcHistory = false;
  /** Tracks the last-known LC undoStack length so we can distinguish a new
   * user stroke (stack grew) from an undo/redo replay or snapshot load. */
  private _lcUndoStackLength = 0;
  /** Snapshot captured when an ObjectEraser stroke begins, for snapshot-based undo. */
  private _snapshotBeforeObjectErase: Record<string, unknown> | null = null;
  /** Canvas snapshot captured on mousedown so cross-board stroke undo/redo can restore
   * the pre-stroke state even after the user has switched away from the original board. */
  private _lcSnapshotBeforeStroke: Record<string, unknown> | null = null;
  private _canvasDirty = false;
  private pendingPreviewBoardId: string | null = null;
  private pendingPreviewSnapshot: Record<string, unknown> | null = null;
  private previewTimeoutId: number | null = null;
  private previewIdleId: number | null = null;
  private colorParserCtx: CanvasRenderingContext2D | null = null;
  private cachedBackgroundColor: string | null = null;
  private cachedBackgroundRgb: { r: number; g: number; b: number } | null = null;

  // Tooltip
  readonly tooltipText = signal('');
  readonly tooltipVisible = signal(false);
  readonly tooltipTop = signal(0);
  readonly tooltipLeft = signal(0);
  readonly showClearCanvasConfirm = signal(false);
  private tooltipDelay: number | null = null;
  private tooltipCooldown: number | null = null;
  private tooltipWarm = false;
  private shapeHoldTimer: number | null = null;
  private shapePointerDown = false;
  private shapeHoldTriggered = false;
  private readonly onDocumentPointerDown = (event: PointerEvent) =>
    this.handleDocumentPointerDown(event);

  constructor() {
    effect(() => {
      const selectedBoardId = this.store.currentBoardId();

      if (!this.lc || !selectedBoardId) return;

      const boardIdChanged = selectedBoardId !== this.currentBoardId;
      const currentBoardData = this.canvasDataService.getCanvasData(selectedBoardId);
      const canvasDataChanged = currentBoardData !== this.lastLoadedCanvasData;

      // Only reload when switching boards or when the canvas data reference changes
      if (boardIdChanged) {
        if (this.currentBoardId && this.lc && this._canvasDirty) {
          const snapshot = this.lc.getSnapshot();
          this.canvasDataService.setCanvasData(this.currentBoardId, {
            shapes: [...this.lc.shapes],
            backgroundShapes: [...this.lc.backgroundShapes],
            snapshot,
          });
        }

        // Ensure any deferred preview for the outgoing board is committed before switching.
        this.flushPendingPreviewRegeneration();
        // Save current board data before switching
        if (this.currentBoardId && this.lc) {
          this.persistCurrentBoardData(this.currentBoardId, true);
          this.store.updateBackgroundColor(this.currentBoardId, this.lc.getColor('background'));
          this._canvasDirty = false;
        }
        this.loadBoardData(selectedBoardId);
      } else if (canvasDataChanged) {
        this.loadBoardData(selectedBoardId);
      }
    });

    effect(() => {
      const onionSkinEnabled = this.store.onionSkinEnabled();
      const currentBoardId = this.store.currentBoardId();
      this.store.boards();

      if (!onionSkinEnabled || !currentBoardId) {
        return;
      }

      this.ensureAdjacentOnionPreviews(currentBoardId);
    });
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId) && typeof LC !== 'undefined') {
      window.addEventListener('pointerdown', this.onDocumentPointerDown, true);
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

            const boardId = firstBoard.id;
            const snapshot = this.lc.getSnapshot();
            const shapes = [...this.lc.shapes];
            const backgroundShapes = [...this.lc.backgroundShapes];

            // Update CanvasDataService immediately
            this.canvasDataService.setCanvasData(boardId, {
              shapes,
              backgroundShapes,
              snapshot,
            });

            // Save preview as a Blob URL to keep base64 data off the V8 heap
            this.lc.getImage({ scale: 0.2 }).toBlob((blob) => {
              if (!this.lc || !blob) return;
              const newUrl = URL.createObjectURL(blob);
              const oldUrl = this.store.boards().find((b) => b.id === boardId)?.previewUrl;
              this.store.updateBoardPreview(boardId, newUrl);
              if (oldUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(oldUrl);
              }
            }, 'image/png');
          }
        }
      }, 0);
    }
  }

  ngOnDestroy() {
    if (this.initCanvasTimeout !== null) {
      clearTimeout(this.initCanvasTimeout);
      this.initCanvasTimeout = null;
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

    if (this.resizeRafId !== null) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }

    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.onWindowResize);
      window.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    }

    // Clear tool instances to release references
    this.toolInstances.clear();

    this.clearTimer('tooltipDelay');
    this.clearTimer('tooltipCooldown');
    this.clearShapeHoldTimer();

    this.clearPendingPreviewRegeneration();
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

    container.addEventListener(
      'mousedown',
      () => {
        if (!this._suppressLcHistory && this.lc) {
          this._lcSnapshotBeforeStroke = this.lc.getSnapshot();
        }
      },
      { capture: true },
    );

    ensureSquareBrushShapeRegistered();

    this.lc.setImageSize(this.defaultCanvasSize.width, this.defaultCanvasSize.height);

    const initialCanvasData = currentBoard
      ? this.canvasDataService.getCanvasData(currentBoard.id)
      : null;
    if (initialCanvasData) {
      this.lc.loadSnapshot(initialCanvasData);
    }
    const initialBackground = currentBoard?.backgroundColor ?? '#ffffff';
    this.lc.setColor('background', initialBackground);
    this.backgroundColor.set(initialBackground);

    // Set up resize handling first; the ResizeObserver's initial callback
    // will drive the first fitCanvasToContainer() after layout has settled,
    // ensuring LC sees post-reflow container dimensions.
    this.observeCanvasResize();
    window.addEventListener('resize', this.onWindowResize);
    this.syncOnionLayerRect();

    this.lc.on('drawingChange', () => {
      if (this.lc) {
        this._canvasDirty = true;
        // Debounce the canvas data update to avoid excessive store updates
        if (this.updateCanvasTimeout !== null) {
          clearTimeout(this.updateCanvasTimeout);
        }
        this.updateCanvasTimeout = window.setTimeout(() => {
          if (this.lc && this.currentBoardId) {
            const boardId = this.currentBoardId;
            const snapshot = this.lc.getSnapshot();
            const shapes = [...this.lc.shapes];
            const backgroundShapes = [...this.lc.backgroundShapes];

            this.lastLoadedCanvasData = snapshot;
            this._canvasDirty = false;

            // Update CanvasDataService immediately
            this.canvasDataService.setCanvasData(boardId, {
              shapes,
              backgroundShapes,
              snapshot,
            });

            this.lc.getImage({ scale: 0.2 }).toBlob((blob) => {
              if (!this.lc || this.currentBoardId !== boardId || !blob) return;

              const newUrl = URL.createObjectURL(blob);
              const oldUrl = this.store.boards().find((b) => b.id === boardId)?.previewUrl;

              this.store.updateBoardPreview(boardId, newUrl);
              if (oldUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(oldUrl);
              }
            }, 'image/png');
          }
          this.updateCanvasTimeout = null;
        }, 300);

        // Record a history entry for new user strokes (stack grew and we're
        // not in the middle of an undo/redo replay or snapshot load).
        if (!this._suppressLcHistory) {
          const currentLen = this.lc.undoStack.length;
          if (currentLen > this._lcUndoStackLength) {
            this._lcUndoStackLength = currentLen;
            const lcRef = this.lc;
            const boardIdAtRecord = this.currentBoardId;
            // Capture before/after snapshots so undo/redo works even after the user
            // has switched to a different board (cross-board undo support).
            const beforeSnapshot = this._lcSnapshotBeforeStroke;
            const afterSnapshot = lcRef.getSnapshot();
            this._lcSnapshotBeforeStroke = null;
            this.undoRedo.record({
              undo: () => {
                if (!boardIdAtRecord) return;
                if (this.currentBoardId !== boardIdAtRecord) {
                  // Cross-board: update the store with the pre-stroke canvas state
                  // then switch to that board — the canvas effect will load it.
                  if (beforeSnapshot) {
                    this.canvasDataService.setCanvasData(boardIdAtRecord, beforeSnapshot);
                  }
                  this.store.setCurrentBoard(boardIdAtRecord);
                  return;
                }
                // Same board: prefer LC native undo; fall back to snapshot restore.
                this._suppressLcHistory = true;
                if (lcRef.undoStack.length > 0) {
                  this._lcUndoStackLength--;
                  lcRef.undo();
                } else if (beforeSnapshot) {
                  lcRef.loadSnapshot(beforeSnapshot);
                  this._lcUndoStackLength = lcRef.undoStack.length;
                }
                this._suppressLcHistory = false;
              },
              redo: () => {
                if (!boardIdAtRecord) return;
                if (this.currentBoardId !== boardIdAtRecord) {
                  // Cross-board: restore the post-stroke snapshot and switch boards.
                  this.canvasDataService.setCanvasData(boardIdAtRecord, afterSnapshot);
                  this.store.setCurrentBoard(boardIdAtRecord);
                  return;
                }
                // Same board: prefer LC native redo; fall back to snapshot restore.
                this._suppressLcHistory = true;
                if (lcRef.redoStack.length > 0) {
                  this._lcUndoStackLength++;
                  lcRef.redo();
                } else {
                  lcRef.loadSnapshot(afterSnapshot);
                  this._lcUndoStackLength = lcRef.undoStack.length;
                }
                this._suppressLcHistory = false;
              },
            });

            if (boardIdAtRecord) {
              this.persistCurrentBoardData(boardIdAtRecord, true, { deferPreviews: true });
            }
          }
        }
      }
    });

    // Initialize tool instances
    this.toolInstances.set('pencil', new LC.tools.Pencil(this.lc));
    this.toolInstances.set('eraser', new LC.tools.Eraser(this.lc));
    this.toolInstances.set('brush', new Brush(this.lc));
    this.toolInstances.set('rectangle', new LC.tools.Rectangle(this.lc));
    this.toolInstances.set('circle', new LC.tools.Ellipse(this.lc));
    this.toolInstances.set('bucket-fill', new BucketFill(this.lc));

    // ObjectEraser bypasses LC's undo stack (directly mutates lc.shapes), so
    // we wrap begin/end to capture a before/after snapshot and record it ourselves.
    const objectEraser = new ObjectEraser(this.lc);
    const origBegin = objectEraser.begin!.bind(objectEraser);
    const origEnd = objectEraser.end!.bind(objectEraser);
    objectEraser.begin = (x, y, lc) => {
      if (!this._suppressLcHistory) {
        this._snapshotBeforeObjectErase = lc.getSnapshot();
      }
      origBegin(x, y, lc);
    };
    objectEraser.end = (x, y, lc) => {
      origEnd(x, y, lc);
      if (!this._suppressLcHistory && this._snapshotBeforeObjectErase !== null) {
        const before = this._snapshotBeforeObjectErase;
        this._snapshotBeforeObjectErase = null;
        const after = lc.getSnapshot();
        // Only record if something was actually removed
        if (
          JSON.stringify((before as { shapes?: unknown }).shapes) !==
          JSON.stringify((after as { shapes?: unknown }).shapes)
        ) {
          const lcRef = lc;
          const snapshotBoardId = this.store.currentBoardId();
          this.undoRedo.record({
            undo: () => {
              const currentBoardId = this.store.currentBoardId();
              if (snapshotBoardId !== null && currentBoardId !== snapshotBoardId) {
                // Cross-board: update store with the pre-erase snapshot and switch boards.
                this.canvasDataService.setCanvasData(snapshotBoardId, before);
                this.store.setCurrentBoard(snapshotBoardId);
                return;
              }
              this._suppressLcHistory = true;
              lcRef.loadSnapshot(before);
              this._lcUndoStackLength = lcRef.undoStack.length;
              this._suppressLcHistory = false;
            },
            redo: () => {
              const currentBoardId = this.store.currentBoardId();
              if (snapshotBoardId !== null && currentBoardId !== snapshotBoardId) {
                // Cross-board: update store with the post-erase snapshot and switch boards.
                this.canvasDataService.setCanvasData(snapshotBoardId, after);
                this.store.setCurrentBoard(snapshotBoardId);
                return;
              }
              this._suppressLcHistory = true;
              lcRef.loadSnapshot(after);
              this._lcUndoStackLength = lcRef.undoStack.length;
              this._suppressLcHistory = false;
            },
          });

          if (snapshotBoardId) {
            this.persistCurrentBoardData(snapshotBoardId, true);
          }
        }
      }
    };
    this.toolInstances.set('object-eraser', objectEraser);

    const brushTool = this.toolInstances.get('brush') as Brush | undefined;
    if (brushTool) {
      brushTool.spacing = this.brushSpacing();
    }

    // Apply default stroke size to all tools that support it; object-eraser is fixed at 1
    this.toolInstances.forEach((tool, id) => {
      if (tool.strokeWidth !== undefined) {
        tool.strokeWidth = id === 'object-eraser' ? 1 : (this.toolSizeMap()[id] ?? 5);
      }
    });

    // Activate the default tool
    this.setTool('pencil');
  }

  private loadBoardData(boardId: string) {
    if (!this.lc) return;

    ensureSquareBrushShapeRegistered();

    const boards = this.store.boards();
    const board = boards.find((b) => b.id === boardId);

    this.currentBoardId = boardId;
    this._canvasDirty = false;

    this._suppressLcHistory = true;
    this._lcUndoStackLength = 0;

    // Clear canvas
    this.lc.shapes = [];
    this.lc.backgroundShapes = [];

    // Load new board data
    const cache = board ? this.canvasDataService.getBoardCache(board.id) : null;
    if (board && cache) {
      if (cache.shapes && cache.backgroundShapes) {
        this.lc.shapes = [...cache.shapes];
        this.lc.backgroundShapes = [...cache.backgroundShapes];
        this.lc.repaintLayer('main');
        this.lc.repaintLayer('background');
      } else {
        this.lc.loadSnapshot(cache.snapshot);
        // Cache immediately so subsequent loads are instant
        this.canvasDataService.setCanvasData(board.id, {
          shapes: [...this.lc.shapes],
          backgroundShapes: [...this.lc.backgroundShapes],
          snapshot: cache.snapshot,
        });
      }
      this.lastLoadedCanvasData = cache.snapshot;
    } else {
      this.lc.repaintLayer('main');
      this.lastLoadedCanvasData = null;
    }
    this.lc.setImageSize(this.defaultCanvasSize.width, this.defaultCanvasSize.height);
    const boardBackground = board?.backgroundColor ?? '#ffffff';
    this.lc.setColor('background', boardBackground);
    this.backgroundColor.set(boardBackground);
    this.scheduleCanvasFit();

    if (board && !board.previewUrl) {
      this.persistCurrentBoardData(board.id, true);
    }

    this.updateOnionPreviewForCurrentBoard(boardId);
    this.pruneOnionPreviewCache(this.getOnionPreviewKeepIds(boardId));

    this.lc.undoStack.length = 0;
    this.lc.redoStack.length = 0;
    this._lcUndoStackLength = 0;
    this._suppressLcHistory = false;
  }

  private observeCanvasResize(): void {
    if (!this.lc || typeof ResizeObserver === 'undefined') return;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    const host = this.el.nativeElement as HTMLElement;
    this.resizeObserver = new ResizeObserver(() => this.scheduleCanvasFit());
    this.resizeObserver.observe(host);
  }

  private scheduleCanvasFit(): void {
    if (!this.lc) return;

    if (this.resizeRafId !== null) {
      cancelAnimationFrame(this.resizeRafId);
    }

    this.resizeRafId = window.requestAnimationFrame(() => {
      this.resizeRafId = null;
      this.fitCanvasToContainer();
      this.syncOnionLayerRect();
    });
  }

  private createBoardPreviews(): { previewUrl: string } {
    if (!this.lc) {
      return { previewUrl: '' };
    }

    return {
      previewUrl: this.lc.getImage({ scale: this.boardPreviewScale }).toDataURL('image/png'),
    };
  }

  private updateOnionPreviewForCurrentBoard(boardId: string): void {
    if (!this.lc || this.currentBoardId !== boardId) {
      return;
    }

    // Onion skin previews are generated at full canvas resolution for precise animation alignment.
    const onionImage = this.lc.getImage({
      scale: 1,
      includeWatermark: false,
      rect: {
        x: 0,
        y: 0,
        width: this.defaultCanvasSize.width,
        height: this.defaultCanvasSize.height,
      },
    });

    const onionPreviewUrl = this.createTransparentOnionPreview(onionImage);
    this.onionPreviewCache.update((cache) => ({
      ...cache,
      [boardId]: onionPreviewUrl,
    }));
  }

  private ensureAdjacentOnionPreviews(currentBoardId: string): void {
    const boards = this.store.boards();
    const currentIndex = boards.findIndex((board) => board.id === currentBoardId);
    if (currentIndex === -1) {
      return;
    }

    const adjacentBoards = [
      currentIndex > 0 ? boards[currentIndex - 1] : null,
      currentIndex < boards.length - 1 ? boards[currentIndex + 1] : null,
    ].filter((board): board is NonNullable<typeof board> => Boolean(board));

    if (adjacentBoards.length === 0) {
      return;
    }

    const cache = this.onionPreviewCache();
    const nextEntries: Record<string, string> = {};

    for (const board of adjacentBoards) {
      if (cache[board.id]) {
        continue;
      }

      const canvasData = this.canvasDataService.getCanvasData(board.id);
      const preview = this.renderOnionPreviewForBoard(canvasData, board.backgroundColor);
      if (preview) {
        nextEntries[board.id] = preview;
      }
    }

    if (Object.keys(nextEntries).length > 0) {
      this.onionPreviewCache.update((existing) => ({
        ...existing,
        ...nextEntries,
      }));
    }
  }

  private renderOnionPreviewForBoard(
    canvasData: Record<string, unknown> | null,
    backgroundColor: string,
  ): string | null {
    const container = document.createElement('div');
    container.style.cssText =
      'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
    document.body.appendChild(container);

    let preview: string | null = null;
    let lc: LCInstance | null = null;

    try {
      lc = LC.init(container, { imageURLPrefix: 'assets/lc-images' });
      lc.setImageSize(this.defaultCanvasSize.width, this.defaultCanvasSize.height);
      if (canvasData) {
        lc.loadSnapshot(this.withoutViewportState(canvasData));
      } else {
        lc.repaintLayer('main');
      }
      lc.setColor('background', backgroundColor || '#ffffff');

      const onionImage = lc.getImage({
        scale: 1,
        includeWatermark: false,
        rect: {
          x: 0,
          y: 0,
          width: this.defaultCanvasSize.width,
          height: this.defaultCanvasSize.height,
        },
      });

      preview = this.createTransparentOnionPreview(onionImage, backgroundColor || '#ffffff');
    } catch {
      preview = null;
    } finally {
      try {
        lc?.teardown();
      } catch {
        // Ignore teardown errors.
      }
      document.body.removeChild(container);
    }

    return preview;
  }

  private getOnionPreviewKeepIds(boardId: string): string[] {
    const boards = this.store.boards();
    const currentIndex = boards.findIndex((board) => board.id === boardId);
    if (currentIndex === -1) {
      return [boardId];
    }

    const ids = [boardId];
    if (currentIndex > 0) {
      ids.push(boards[currentIndex - 1].id);
    }
    if (currentIndex < boards.length - 1) {
      ids.push(boards[currentIndex + 1].id);
    }
    return ids;
  }

  private pruneOnionPreviewCache(keepIds: string[]): void {
    const keep = new Set(keepIds);
    this.onionPreviewCache.update((cache) => {
      const nextCache: Record<string, string> = {};
      for (const [id, previewUrl] of Object.entries(cache)) {
        if (keep.has(id)) {
          nextCache[id] = previewUrl;
        }
      }
      return nextCache;
    });
  }

  private persistCurrentBoardData(
    boardId: string,
    includePreviews: boolean,
    options: { deferPreviews?: boolean } = {},
  ): void {
    if (!this.lc) {
      return;
    }

    const normalizedSnapshot = this.withoutViewportState(this.lc.getSnapshot());
    this.lastLoadedCanvasData = normalizedSnapshot;

    if (includePreviews) {
      if (options.deferPreviews) {
        this.canvasDataService.setCanvasData(boardId, normalizedSnapshot);
        this.schedulePreviewRegeneration(boardId, normalizedSnapshot);
        return;
      }

      const previews = this.createBoardPreviews();
      this.canvasDataService.setCanvasData(boardId, normalizedSnapshot);
      if (previews.previewUrl) this.store.updateBoardPreview(boardId, previews.previewUrl);
      this.updateOnionPreviewForCurrentBoard(boardId);
      this.pruneOnionPreviewCache(this.getOnionPreviewKeepIds(boardId));
      return;
    }

    this.canvasDataService.setCanvasData(boardId, normalizedSnapshot);
  }

  private schedulePreviewRegeneration(boardId: string, snapshot: Record<string, unknown>): void {
    if (!this.lc || boardId !== this.currentBoardId) {
      return;
    }

    this.pendingPreviewBoardId = boardId;
    this.pendingPreviewSnapshot = snapshot;

    if (this.previewTimeoutId !== null) {
      clearTimeout(this.previewTimeoutId);
    }

    this.previewTimeoutId = window.setTimeout(() => {
      this.previewTimeoutId = null;
      this.schedulePreviewRegenerationOnIdle();
    }, this.previewDebounceMs);
  }

  private schedulePreviewRegenerationOnIdle(): void {
    if (typeof window.requestIdleCallback === 'function') {
      if (this.previewIdleId !== null) {
        window.cancelIdleCallback(this.previewIdleId);
      }
      this.previewIdleId = window.requestIdleCallback(
        () => {
          this.previewIdleId = null;
          this.flushPendingPreviewRegeneration();
        },
        { timeout: 300 },
      );
      return;
    }

    this.flushPendingPreviewRegeneration();
  }

  private flushPendingPreviewRegeneration(): void {
    if (
      !this.lc ||
      !this.pendingPreviewBoardId ||
      !this.pendingPreviewSnapshot ||
      this.pendingPreviewBoardId !== this.currentBoardId
    ) {
      this.clearPendingPreviewRegeneration();
      return;
    }

    const boardId = this.pendingPreviewBoardId;
    const snapshot = this.pendingPreviewSnapshot;
    const previews = this.createBoardPreviews();
    this.canvasDataService.setCanvasData(boardId, snapshot);
    if (previews.previewUrl) this.store.updateBoardPreview(boardId, previews.previewUrl);
    this.updateOnionPreviewForCurrentBoard(boardId);
    this.pruneOnionPreviewCache(this.getOnionPreviewKeepIds(boardId));

    this.pendingPreviewBoardId = null;
    this.pendingPreviewSnapshot = null;
  }

  private clearPendingPreviewRegeneration(): void {
    if (this.previewTimeoutId !== null) {
      clearTimeout(this.previewTimeoutId);
      this.previewTimeoutId = null;
    }

    if (this.previewIdleId !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(this.previewIdleId);
      this.previewIdleId = null;
    }

    this.pendingPreviewBoardId = null;
    this.pendingPreviewSnapshot = null;
  }

  private createTransparentOnionPreview(
    source: HTMLCanvasElement,
    backgroundColor?: string,
  ): string {
    const width = source.width;
    const height = source.height;
    if (width <= 0 || height <= 0) {
      return source.toDataURL('image/png');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return source.toDataURL('image/png');
    }

    ctx.drawImage(source, 0, 0);

    const bgColor = this.getCachedBackgroundRgb(
      backgroundColor ?? this.lc?.getColor('background') ?? '#ffffff',
    );
    if (!bgColor) {
      return canvas.toDataURL('image/png');
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const tolerance = 3;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (
        Math.abs(r - bgColor.r) <= tolerance &&
        Math.abs(g - bgColor.g) <= tolerance &&
        Math.abs(b - bgColor.b) <= tolerance
      ) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  private getCachedBackgroundRgb(color: string): { r: number; g: number; b: number } | null {
    if (this.cachedBackgroundColor === color) {
      return this.cachedBackgroundRgb;
    }

    this.cachedBackgroundColor = color;
    this.cachedBackgroundRgb = this.parseColorToRgb(color);
    return this.cachedBackgroundRgb;
  }

  private withoutViewportState(snapshot: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...snapshot };
    delete (normalized as { position?: unknown }).position;
    delete (normalized as { scale?: unknown }).scale;
    return normalized;
  }

  private parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
    let parserCtx = this.colorParserCtx;
    if (!parserCtx) {
      const parserCanvas = document.createElement('canvas');
      parserCanvas.width = 1;
      parserCanvas.height = 1;
      parserCtx = parserCanvas.getContext('2d');
      this.colorParserCtx = parserCtx;
    }

    if (!parserCtx) {
      return null;
    }

    parserCtx.fillStyle = '#000000';
    parserCtx.fillStyle = color;
    const normalized = parserCtx.fillStyle;

    if (typeof normalized !== 'string') {
      return null;
    }

    if (normalized.startsWith('#')) {
      const hex = normalized.slice(1);
      if (hex.length === 3) {
        const r = Number.parseInt(hex[0] + hex[0], 16);
        const g = Number.parseInt(hex[1] + hex[1], 16);
        const b = Number.parseInt(hex[2] + hex[2], 16);
        return { r, g, b };
      }
      if (hex.length === 6) {
        const r = Number.parseInt(hex.slice(0, 2), 16);
        const g = Number.parseInt(hex.slice(2, 4), 16);
        const b = Number.parseInt(hex.slice(4, 6), 16);
        return { r, g, b };
      }
    }

    const rgbMatch = normalized.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return {
        r: Number.parseInt(rgbMatch[1], 10),
        g: Number.parseInt(rgbMatch[2], 10),
        b: Number.parseInt(rgbMatch[3], 10),
      };
    }

    return null;
  }

  private fitCanvasToContainer(): void {
    if (!this.lc) return;

    const container = this.canvasContainer().nativeElement;
    const height = container.clientHeight;
    if (height <= 0 || height === this.lastFitHeight) return;
    this.lastFitHeight = height;

    const correctWidth = Math.floor(
      (height * this.defaultCanvasSize.width) / this.defaultCanvasSize.height,
    );
    const host = this.el.nativeElement as HTMLElement;
    const toolsBar = host.querySelector<HTMLElement>('.tools-bar');

    const flexRow = host.querySelector<HTMLElement>('.canvas-container');
    const flexRowStyles = flexRow ? window.getComputedStyle(flexRow) : null;
    const gapValue = flexRowStyles
      ? flexRowStyles.columnGap && flexRowStyles.columnGap !== 'normal'
        ? flexRowStyles.columnGap
        : flexRowStyles.gap
      : null;
    const gap = Number.parseFloat(gapValue || '0') || 0;

    const toolsBarWidth = toolsBar ? toolsBar.offsetWidth + gap : 0;
    host.style.width = correctWidth + toolsBarWidth + 'px';

    const scale = height / this.defaultCanvasSize.height;
    if (!Number.isFinite(scale) || scale <= 0) return;

    if (this.lc.respondToSizeChange) {
      this.lc.respondToSizeChange();
    }

    this.lc.setZoom(scale);
  }

  private syncOnionLayerRect(): void {
    if (!this.lc) return;

    const container = this.canvasContainer().nativeElement;
    const liveCanvas = this.lc.canvas;
    if (!container || !liveCanvas) return;

    const containerRect = container.getBoundingClientRect();
    const liveCanvasRect = liveCanvas.getBoundingClientRect();

    this.onionLayerRect.set({
      left: liveCanvasRect.left - containerRect.left,
      top: liveCanvasRect.top - containerRect.top,
      width: liveCanvasRect.width,
      height: liveCanvasRect.height,
    });

    const backingScale = this.lc.backingScale || 1;
    const renderScale = this.lc.getRenderScale?.() || this.lc.scale * backingScale || backingScale;
    const imageLeft = this.lc.position.x / backingScale;
    const imageTop = this.lc.position.y / backingScale;
    const imageWidth = (this.defaultCanvasSize.width * renderScale) / backingScale;
    const imageHeight = (this.defaultCanvasSize.height * renderScale) / backingScale;

    this.onionImageRect.set({
      left: imageLeft,
      top: imageTop,
      width: imageWidth,
      height: imageHeight,
    });
  }

  public setTool(toolId: string): void {
    if (!this.lc || !this.toolInstances.has(toolId)) return;

    if (this.isShapeTool(toolId)) {
      this.selectedShape.set(toolId);
    }

    const tool = this.toolInstances.get(toolId);
    if (tool) {
      if (tool.strokeWidth !== undefined && toolId !== 'object-eraser') {
        tool.strokeWidth = this.toolSizeMap()[toolId] ?? 5;
      }
      if (toolId === 'brush') {
        (tool as Brush).spacing = this.brushSpacing();
      }
      this.lc.setTool(tool);
      this.activeTool.set(toolId);
    }
  }

  public onShapeButtonPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    this.hideTooltip();
    this.shapePointerDown = true;
    this.shapeHoldTriggered = false;

    const button = event.currentTarget as HTMLElement | null;
    if (button) {
      this.shapeSubmenuTop.set(button.offsetTop);
    }

    this.clearShapeHoldTimer();
    this.shapeHoldTimer = window.setTimeout(() => {
      if (!this.shapePointerDown) {
        return;
      }

      this.shapeHoldTriggered = true;
      this.showShapeSubmenu.set(true);
    }, 300);
  }

  public onShapeButtonPointerUp(): void {
    if (!this.shapePointerDown) {
      return;
    }

    this.shapePointerDown = false;
    const wasHold = this.shapeHoldTriggered;
    this.clearShapeHoldTimer();
    this.shapeHoldTriggered = false;

    if (wasHold) {
      return;
    }

    this.closeShapeSubmenu();
    this.setTool(this.selectedShape());
  }

  public onShapeButtonPointerCancel(): void {
    this.shapePointerDown = false;
    this.shapeHoldTriggered = false;
    this.clearShapeHoldTimer();
  }

  public onShapeSubmenuSelect(toolId: 'rectangle' | 'circle'): void {
    this.selectedShape.set(toolId);
    this.closeShapeSubmenu();
    this.setTool(toolId);
  }

  public setBrushSpacing(spacing: number): void {
    if (isNaN(spacing)) return;
    const clamped = Math.max(10, Math.min(200, Math.round(spacing)));
    this.brushSpacing.set(clamped);

    const brushTool = this.toolInstances.get('brush') as Brush | undefined;
    if (brushTool) {
      brushTool.spacing = clamped;
    }
  }

  public setStrokeSize(size: number): void {
    if (isNaN(size) || size < 1) return;
    const value = Math.max(1, Math.round(size));
    this.toolSizeMap.update((m) => ({ ...m, [this.activeTool()]: value }));
    if (this.lc?.tool) {
      this.lc.tool.strokeWidth = value;
    }
  }

  public setStrokeSizeFromSlider(pos: number): void {
    // Exponential mapping: slider 0–100 → value 1–500
    const value = Math.round(Math.pow(500, pos / 100));
    this.setStrokeSize(Math.max(1, value));
  }

  public setColorTolerance(tol: number): void {
    if (isNaN(tol)) return;
    const clamped = Math.max(0, Math.min(128, Math.round(tol)));
    this.colorTolerance.set(clamped);
    const bucketTool = this.toolInstances.get('bucket-fill') as BucketFill | undefined;
    if (bucketTool) {
      bucketTool.tolerance = clamped;
    }
  }

  public requestClearCanvas(): void {
    this.hideTooltip();
    this.showClearCanvasConfirm.set(true);
  }

  public cancelClearCanvas(): void {
    this.showClearCanvasConfirm.set(false);
  }

  public confirmClearCanvas(): void {
    if (!this.lc) return;

    const lcRef = this.lc;
    const boardIdAtClear = this.currentBoardId;
    const before = lcRef.getSnapshot();

    this._suppressLcHistory = true;

    // Clear all shapes
    lcRef.shapes = [];
    lcRef.backgroundShapes = [];
    lcRef.repaintLayer('main');

    // Trigger clear event
    lcRef.trigger('clear');

    const after = lcRef.getSnapshot();
    this._lcUndoStackLength = lcRef.undoStack.length;
    this._suppressLcHistory = false;

    if (boardIdAtClear) {
      this.persistCurrentBoardData(boardIdAtClear, true);
    }

    const beforeShapes = JSON.stringify((before as { shapes?: unknown }).shapes ?? []);
    const beforeBgShapes = JSON.stringify(
      (before as { backgroundShapes?: unknown }).backgroundShapes ?? [],
    );
    const afterShapes = JSON.stringify((after as { shapes?: unknown }).shapes ?? []);
    const afterBgShapes = JSON.stringify(
      (after as { backgroundShapes?: unknown }).backgroundShapes ?? [],
    );

    // Only record a history entry when clear actually removes something.
    if (beforeShapes !== afterShapes || beforeBgShapes !== afterBgShapes) {
      this.undoRedo.record({
        undo: () => {
          if (!boardIdAtClear) return;
          if (this.currentBoardId !== boardIdAtClear) {
            this.canvasDataService.setCanvasData(boardIdAtClear, before);
            this.store.setCurrentBoard(boardIdAtClear);
            return;
          }
          this._suppressLcHistory = true;
          lcRef.loadSnapshot(before);
          this._lcUndoStackLength = lcRef.undoStack.length;
          this._suppressLcHistory = false;
        },
        redo: () => {
          if (!boardIdAtClear) return;
          if (this.currentBoardId !== boardIdAtClear) {
            this.canvasDataService.setCanvasData(boardIdAtClear, after);
            this.store.setCurrentBoard(boardIdAtClear);
            return;
          }
          this._suppressLcHistory = true;
          lcRef.loadSnapshot(after);
          this._lcUndoStackLength = lcRef.undoStack.length;
          this._suppressLcHistory = false;
        },
      });
    }

    this.showClearCanvasConfirm.set(false);
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
    const oldColor = this.backgroundColor();
    this.backgroundColor.set(color);
    this.lc.setColor('background', color);
    if (this.currentBoardId) {
      this.store.updateBackgroundColor(this.currentBoardId, color);
      // Record only if actually changed
      if (oldColor !== color) {
        const boardId = this.currentBoardId;
        this.undoRedo.record({
          undo: () => {
            this.store.updateBackgroundColor(boardId, oldColor);
            if (this.currentBoardId !== boardId) {
              this.store.setCurrentBoard(boardId);
            } else {
              this.backgroundColor.set(oldColor);
              this.lc?.setColor('background', oldColor);
            }
          },
          redo: () => {
            this.store.updateBackgroundColor(boardId, color);
            if (this.currentBoardId !== boardId) {
              this.store.setCurrentBoard(boardId);
            } else {
              this.backgroundColor.set(color);
              this.lc?.setColor('background', color);
            }
          },
        });
      }
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

  public undoStroke(): void {
    if (!this.lc) {
      return;
    }

    // Only attempt undo when LC has something to undo, and keep our
    // internal undo stack length in sync with LC's undo stack.
    if (this.lc.undoStack.length === 0) {
      // Ensure we don't drift if external code changed LC directly.
      this._lcUndoStackLength = this.lc.undoStack.length;
      return;
    }

    this._suppressLcHistory = true;
    this.lc.undo();
    this._lcUndoStackLength = this.lc.undoStack.length;
    this._suppressLcHistory = false;

    if (this.currentBoardId) {
      this.persistCurrentBoardData(this.currentBoardId, true);
    }
  }

  public redoStroke(): void {
    if (!this.lc) {
      return;
    }

    // Only attempt redo when LC has something to redo, and keep our
    // internal undo stack length in sync with LC's undo stack.
    if (this.lc.redoStack.length === 0) {
      // Ensure we don't drift if external code changed LC directly.
      this._lcUndoStackLength = this.lc.undoStack.length;
      return;
    }

    this._suppressLcHistory = true;
    this.lc.redo();
    this._lcUndoStackLength = this.lc.undoStack.length;
    this._suppressLcHistory = false;

    if (this.currentBoardId) {
      this.persistCurrentBoardData(this.currentBoardId, true);
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
    if (this[key] !== null) {
      clearTimeout(this[key]!);
      this[key] = null;
    }
  }

  private handleDocumentPointerDown(event: PointerEvent): void {
    if (!this.showShapeSubmenu()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    if (target.closest('.shape-tool-button') || target.closest('.shape-submenu')) {
      return;
    }

    this.closeShapeSubmenu();
  }

  private isShapeTool(toolId: string): toolId is 'rectangle' | 'circle' {
    return toolId === 'rectangle' || toolId === 'circle';
  }

  private closeShapeSubmenu(): void {
    this.showShapeSubmenu.set(false);
  }

  private clearShapeHoldTimer(): void {
    if (this.shapeHoldTimer !== null) {
      clearTimeout(this.shapeHoldTimer);
      this.shapeHoldTimer = null;
    }
  }
}
