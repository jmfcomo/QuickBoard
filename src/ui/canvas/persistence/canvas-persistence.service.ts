import { Injectable, inject } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { CanvasDataService } from '../../../services/canvas-data.service';
import { LCInstance } from '../literally-canvas-interfaces';
import { OnionSkinService } from '../onion-skin/onion-skin.service';

@Injectable({ providedIn: 'root' })
export class CanvasPersistenceService {
  private readonly boardPreviewScale = 0.2;
  private readonly previewDebounceMs = 160;
  private readonly store = inject(AppStore);
  private readonly canvasDataService = inject(CanvasDataService);
  private readonly onionSkin = inject(OnionSkinService);

  private lastLoadedCanvasData: Record<string, unknown> | null = null;
  private pendingPreviewBoardId: string | null = null;
  private pendingPreviewSnapshot: Record<string, unknown> | null = null;
  private previewTimeoutId: number | null = null;
  private previewIdleId: number | null = null;

  public hasCanvasDataChanged(currentBoardData: Record<string, unknown> | null): boolean {
    return currentBoardData !== this.lastLoadedCanvasData;
  }

  public setLastLoadedCanvasData(snapshot: Record<string, unknown> | null): void {
    this.lastLoadedCanvasData = snapshot;
  }

  public persistCurrentBoardData(
    lc: LCInstance | null,
    boardId: string,
    currentBoardId: string | null,
    includePreviews: boolean,
    options: { deferPreviews?: boolean } = {},
  ): void {
    if (!lc) {
      return;
    }

    const normalizedSnapshot = this.withoutViewportState(lc.getSnapshot());
    this.lastLoadedCanvasData = normalizedSnapshot;

    if (includePreviews) {
      if (options.deferPreviews) {
        this.canvasDataService.setCanvasData(boardId, normalizedSnapshot);
        this.schedulePreviewRegeneration(lc, boardId, currentBoardId, normalizedSnapshot);
        return;
      }

      const previews = this.createBoardPreviews(lc);
      this.canvasDataService.setCanvasData(boardId, normalizedSnapshot);
      if (previews.previewUrl) this.store.updateBoardPreview(boardId, previews.previewUrl);
      this.onionSkin.updateCurrentBoardPreview(lc, currentBoardId, boardId);
      this.onionSkin.pruneToCurrentAndNeighbors(boardId);
      return;
    }

    this.canvasDataService.setCanvasData(boardId, normalizedSnapshot);
  }

  public flushPendingPreviewRegeneration(
    lc: LCInstance | null,
    currentBoardId: string | null,
  ): void {
    if (
      !lc ||
      !this.pendingPreviewBoardId ||
      !this.pendingPreviewSnapshot ||
      this.pendingPreviewBoardId !== currentBoardId
    ) {
      this.clearPendingPreviewRegeneration();
      return;
    }

    const boardId = this.pendingPreviewBoardId;
    const snapshot = this.pendingPreviewSnapshot;
    const previews = this.createBoardPreviews(lc);
    this.canvasDataService.setCanvasData(boardId, snapshot);
    if (previews.previewUrl) this.store.updateBoardPreview(boardId, previews.previewUrl);
    this.onionSkin.updateCurrentBoardPreview(lc, currentBoardId, boardId);
    this.onionSkin.pruneToCurrentAndNeighbors(boardId);

    this.pendingPreviewBoardId = null;
    this.pendingPreviewSnapshot = null;
  }

  public clearPendingPreviewRegeneration(): void {
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

  private schedulePreviewRegeneration(
    lc: LCInstance,
    boardId: string,
    currentBoardId: string | null,
    snapshot: Record<string, unknown>,
  ): void {
    if (boardId !== currentBoardId) {
      return;
    }

    this.pendingPreviewBoardId = boardId;
    this.pendingPreviewSnapshot = snapshot;

    if (this.previewTimeoutId !== null) {
      clearTimeout(this.previewTimeoutId);
    }

    this.previewTimeoutId = window.setTimeout(() => {
      this.previewTimeoutId = null;
      this.schedulePreviewRegenerationOnIdle(lc, currentBoardId);
    }, this.previewDebounceMs);
  }

  private schedulePreviewRegenerationOnIdle(lc: LCInstance, currentBoardId: string | null): void {
    if (typeof window.requestIdleCallback === 'function') {
      if (this.previewIdleId !== null) {
        window.cancelIdleCallback(this.previewIdleId);
      }
      this.previewIdleId = window.requestIdleCallback(
        () => {
          this.previewIdleId = null;
          this.flushPendingPreviewRegeneration(lc, currentBoardId);
        },
        { timeout: 300 },
      );
      return;
    }

    this.flushPendingPreviewRegeneration(lc, currentBoardId);
  }

  private createBoardPreviews(lc: LCInstance): { previewUrl: string } {
    return {
      previewUrl: lc.getImage({ scale: this.boardPreviewScale }).toDataURL('image/png'),
    };
  }

  private withoutViewportState(snapshot: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...snapshot };
    delete (normalized as { position?: unknown }).position;
    delete (normalized as { scale?: unknown }).scale;
    return normalized;
  }
}
