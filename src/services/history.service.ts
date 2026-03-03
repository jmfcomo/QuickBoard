import { Injectable, inject, effect } from '@angular/core';
import { AppStore } from '../data/store/app.store';
import type { Board, AudioTrack, AudioLaneMixer } from '../data/store/app.store';

interface HistorySnapshot {
  boards: Board[];
  currentBoardId: string | null;
  audioTracks: AudioTrack[];
  audioLaneCount: number;
  audioLaneMixers: AudioLaneMixer[];
}

/** Fingerprint shape — canvasData is excluded so canvas strokes don't create entries. */
interface SnapshotFingerprint {
  boards: Array<{
    id: string;
    scriptData: Board['scriptData'];
    backgroundColor: string;
    duration: number;
  }>;
  currentBoardId: string | null;
  audioTracks: AudioTrack[];
  audioLaneCount: number;
  audioLaneMixers: AudioLaneMixer[];
}

export interface CanvasUndoHandlers {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const MAX_HISTORY = 100;
const DEBOUNCE_MS = 500;
const RESTORE_LOCK_MS = 900;
const INIT_LOCK_MS = 1200;

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly store = inject(AppStore);

  private readonly undoStack: HistorySnapshot[] = [];
  private readonly redoStack: HistorySnapshot[] = [];

  private lastSnapshot: HistorySnapshot | null = null;

  private historyLock = 1;
  private lockTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Registered by CanvasComponent so undo/redo can delegate to LC first.
  private canvas: CanvasUndoHandlers | null = null;

  readonly canUndo = () => this.undoStack.length > 0 || (this.canvas?.canUndo() ?? false);
  readonly canRedo = () => this.redoStack.length > 0 || (this.canvas?.canRedo() ?? false);

  constructor() {
    this.lockTimer = setTimeout(() => {
      this.historyLock = 0;
      this.lockTimer = null;
      this.lastSnapshot = this.captureSnapshot();
    }, INIT_LOCK_MS);

    effect(() => {
      const current = this.captureSnapshot();

      if (this.historyLock > 0) {
        this.lastSnapshot = current;
        if (this.debounceTimer !== null) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        return;
      }

      if (this.lastSnapshot === null) {
        this.lastSnapshot = current;
        return;
      }

      const beforeState = this.lastSnapshot;
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        const settled = this.captureSnapshot();

        // Only push to the undo stack when something OTHER than canvasData changed.
        // LC owns canvas stroke history; we don't duplicate it here.
        if (this.fingerprint(settled) !== this.fingerprint(beforeState)) {
          this.undoStack.push(beforeState);
          if (this.undoStack.length > MAX_HISTORY) {
            this.undoStack.shift();
          }
          this.redoStack.length = 0;
        }

        this.lastSnapshot = settled;
      }, DEBOUNCE_MS);
    });
  }

  /**
   * Register the canvas component's undo/redo handlers.
   * HistoryService.undo() will delegate to LC first when LC has history.
   */
  registerCanvas(handlers: CanvasUndoHandlers): void {
    this.canvas = handlers;
  }

  undo(): void {
    // LiterallyCanvas owns canvas-stroke history — delegate to it first.
    if (this.canvas?.canUndo()) {
      this.canvas.undo();
      return;
    }

    if (this.undoStack.length === 0) return;

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const current = this.captureSnapshot();
    this.redoStack.push(current);
    const previous = this.undoStack.pop()!;
    this.restore(previous);
  }

  redo(): void {
    // LiterallyCanvas owns canvas-stroke history — delegate to it first.
    if (this.canvas?.canRedo()) {
      this.canvas.redo();
      return;
    }

    if (this.redoStack.length === 0) return;

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const current = this.captureSnapshot();
    this.undoStack.push(current);
    const next = this.redoStack.pop()!;
    this.restore(next);
  }

  private captureSnapshot(): HistorySnapshot {
    return {
      boards: this.store.boards(),
      currentBoardId: this.store.currentBoardId(),
      audioTracks: this.store.audioTracks(),
      audioLaneCount: this.store.audioLaneCount(),
      audioLaneMixers: this.store.audioLaneMixers(),
    };
  }

  /**
   * Fingerprint that intentionally omits canvasData and previewUrl.
   * This means canvas strokes (which only update canvasData) won't trigger
   * new entries in the app-level undo stack.
   */
  private fingerprint(snapshot: HistorySnapshot): string {
    const fp: SnapshotFingerprint = {
      boards: snapshot.boards.map(({ id, scriptData, backgroundColor, duration }) => ({
        id,
        scriptData,
        backgroundColor,
        duration,
      })),
      currentBoardId: snapshot.currentBoardId,
      audioTracks: snapshot.audioTracks,
      audioLaneCount: snapshot.audioLaneCount,
      audioLaneMixers: snapshot.audioLaneMixers,
    };
    return JSON.stringify(fp);
  }

  private restore(snapshot: HistorySnapshot): void {
    this.acquireLock(RESTORE_LOCK_MS);

    // Preserve the live canvasData for boards that still exist so we don't
    // clobber LC's own undo history. Boards re-added by undo get null canvas.
    const currentBoards = this.store.boards();
    const mergedBoards = snapshot.boards.map((b) => {
      const live = currentBoards.find((cb) => cb.id === b.id);
      return {
        ...b,
        canvasData: live?.canvasData ?? null,
        previewUrl: live?.previewUrl ?? b.previewUrl,
      };
    });

    this.store.restoreSnapshot({ ...snapshot, boards: mergedBoards });
    this.lastSnapshot = { ...snapshot, boards: mergedBoards };
  }

  private acquireLock(durationMs: number): void {
    this.historyLock++;
    if (this.lockTimer !== null) {
      clearTimeout(this.lockTimer);
    }
    this.lockTimer = setTimeout(() => {
      this.historyLock = Math.max(0, this.historyLock - 1);
      this.lockTimer = null;
      this.lastSnapshot = this.captureSnapshot();
    }, durationMs);
  }
}
