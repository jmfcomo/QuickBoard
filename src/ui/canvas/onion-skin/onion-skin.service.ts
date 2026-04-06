import { inject, Injectable, signal, computed, effect } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { CanvasDataService } from '../../../services/canvas-data.service';
import { LCInstance } from '../literally-canvas-interfaces';
import { OnionSkinLayer } from './onion-skin.types';
import { appSettings } from 'src/settings-loader';

@Injectable({ providedIn: 'root' })
export class OnionSkinService {
  private readonly defaultCanvasSize = { width: appSettings.board.width, height: appSettings.board.height };
  private readonly store = inject(AppStore);
  private readonly canvasDataService = inject(CanvasDataService);
  private readonly onionPreviewCache = signal<Record<string, string>>({});
  private colorParserCtx: CanvasRenderingContext2D | null = null;
  private cachedBackgroundColor: string | null = null;
  private cachedBackgroundRgb: { r: number; g: number; b: number } | null = null;

  readonly onionSkinLayers = computed(() => {
    if (!this.store.onionSkinEnabled() || this.store.isPlaying()) {
      return [] as OnionSkinLayer[];
    }

    const boards = this.store.boards();
    const currentBoardId = this.store.currentBoardId();
    if (!currentBoardId || boards.length < 2) {
      return [] as OnionSkinLayer[];
    }

    const currentIndex = boards.findIndex((board) => board.id === currentBoardId);
    if (currentIndex === -1) {
      return [] as OnionSkinLayer[];
    }

    const cache = this.onionPreviewCache();
    const overlays: OnionSkinLayer[] = [];
    const previousBoard = currentIndex > 0 ? boards[currentIndex - 1] : null;
    const nextBoard = currentIndex < boards.length - 1 ? boards[currentIndex + 1] : null;
    const previousOnionPreview = previousBoard ? cache[previousBoard.id] : undefined;
    const nextOnionPreview = nextBoard ? cache[nextBoard.id] : undefined;

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

  constructor() {
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

  public updateCurrentBoardPreview(
    lc: LCInstance | null,
    currentBoardId: string | null,
    boardId: string,
  ): void {
    if (!lc || currentBoardId !== boardId) {
      return;
    }

    // Onion skin previews are generated at full canvas resolution for precise animation alignment.
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

    const onionPreviewUrl = this.createTransparentOnionPreview(
      onionImage,
      lc.getColor('background') ?? '#ffffff',
    );
    this.onionPreviewCache.update((cache) => ({
      ...cache,
      [boardId]: onionPreviewUrl,
    }));
  }

  public pruneToCurrentAndNeighbors(boardId: string): void {
    const keepIds = this.getOnionPreviewKeepIds(boardId);
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

  private createTransparentOnionPreview(source: HTMLCanvasElement, backgroundColor: string): string {
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

    const bgColor = this.getCachedBackgroundRgb(backgroundColor);
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

  private withoutViewportState(snapshot: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...snapshot };
    delete (normalized as { position?: unknown }).position;
    delete (normalized as { scale?: unknown }).scale;
    return normalized;
  }

  private getCachedBackgroundRgb(color: string): { r: number; g: number; b: number } | null {
    if (this.cachedBackgroundColor === color) {
      return this.cachedBackgroundRgb;
    }

    this.cachedBackgroundColor = color;
    this.cachedBackgroundRgb = this.parseColorToRgb(color);
    return this.cachedBackgroundRgb;
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
}