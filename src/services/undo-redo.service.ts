import { Injectable, signal } from '@angular/core';

export interface UndoableCommand {
  undo(): void;
  redo(): void;
}

export interface UndoReservation {
  commit(command: UndoableCommand): void;
  cancel(): void;
}

const MAX_HISTORY = 200;

@Injectable({ providedIn: 'root' })
export class UndoRedoService {
  private readonly _undoStack: UndoableCommand[] = [];
  private readonly _redoStack: UndoableCommand[] = [];
  private readonly _flushCallbacks = new Set<() => Promise<void>>();

  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  registerPreUndoFlush(cb: () => Promise<void>): () => void {
    this._flushCallbacks.add(cb);
    return () => this._flushCallbacks.delete(cb);
  }
  async triggerUndo(): Promise<void> {
    for (const cb of this._flushCallbacks) {
      await cb();
    }
    this.undo();
  }

  async triggerRedo(): Promise<void> {
    for (const cb of this._flushCallbacks) {
      await cb();
    }
    this.redo();
  }

  record(command: UndoableCommand): void {
    if (this._undoStack.length >= MAX_HISTORY) {
      this._undoStack.shift();
    }
    this._undoStack.push(command);
    this._redoStack.length = 0;
    this.updateSignals();
  }

  reserve(): UndoReservation {
    const placeholder: UndoableCommand & { _inner: UndoableCommand | null } = {
      _inner: null,
      undo() {
        this._inner?.undo();
      },
      redo() {
        this._inner?.redo();
      },
    };

    if (this._undoStack.length >= MAX_HISTORY) {
      this._undoStack.shift();
    }
    this._undoStack.push(placeholder);
    this._redoStack.length = 0;
    this.updateSignals();

    return {
      commit: (command: UndoableCommand) => {
        placeholder._inner = command;
      },
      cancel: () => {
        const undoIdx = this._undoStack.indexOf(placeholder);
        if (undoIdx !== -1) {
          this._undoStack.splice(undoIdx, 1);
        }
        const redoIdx = this._redoStack.indexOf(placeholder);
        if (redoIdx !== -1) {
          this._redoStack.splice(redoIdx, 1);
        }
        this.updateSignals();
      },
    };
  }

  undo(): void {
    const command = this._undoStack.pop();
    if (!command) {
      return;
    }

    try {
      command.undo();
      this._redoStack.push(command);
    } catch (error) {
      // Restore command to undo stack if undo fails to keep history consistent
      this._undoStack.push(command);
      // Re-throw so callers can handle the error if needed
      throw error;
    } finally {
      this.updateSignals();
    }
  }

  redo(): void {
    const command = this._redoStack.pop();
    if (!command) {
      return;
    }

    try {
      command.redo();
      this._undoStack.push(command);
    } catch (error) {
      // Restore command to redo stack if redo fails to keep history consistent
      this._redoStack.push(command);
      // Re-throw so callers can handle the error if needed
      throw error;
    } finally {
      this.updateSignals();
    }
  }

  clear(): void {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this.updateSignals();
  }

  private updateSignals(): void {
    this.canUndo.set(this._undoStack.length > 0);
    this.canRedo.set(this._redoStack.length > 0);
  }
}
