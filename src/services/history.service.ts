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

  readonly canUndo = () => this.undoStack.length > 0;
  readonly canRedo = () => this.redoStack.length > 0;

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
        this.undoStack.push(beforeState);
        if (this.undoStack.length > MAX_HISTORY) {
          this.undoStack.shift();
        }
        this.redoStack.length = 0;
        this.lastSnapshot = settled;
      }, DEBOUNCE_MS);
    });
  }

  undo(): void {
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

  private restore(snapshot: HistorySnapshot): void {
    this.acquireLock(RESTORE_LOCK_MS);
    this.store.restoreSnapshot(snapshot);
    this.lastSnapshot = snapshot;
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
