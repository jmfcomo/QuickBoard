import { Injectable, signal } from '@angular/core';

export interface UndoableCommand {
  undo(): void;
  redo(): void;
}

const MAX_HISTORY = 200;

@Injectable({ providedIn: 'root' })
export class UndoRedoService {
  private readonly _undoStack: UndoableCommand[] = [];
  private readonly _redoStack: UndoableCommand[] = [];

  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  record(command: UndoableCommand): void {
    if (this._undoStack.length >= MAX_HISTORY) {
      this._undoStack.shift();
    }
    this._undoStack.push(command);
    this._redoStack.length = 0;
    this.updateSignals();
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
