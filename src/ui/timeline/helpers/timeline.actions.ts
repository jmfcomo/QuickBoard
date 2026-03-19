import { Injectable, inject } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { UndoRedoService } from '../../../services/undo-redo.service';

@Injectable({ providedIn: 'root' })
export class TimelineActions {
  private readonly store = inject(AppStore);
  private readonly undoRedo = inject(UndoRedoService);

  addBoard(): string {
    const prevBoardId = this.store.currentBoardId();
    let boardId = this.store.addBoard();
    this.store.setCurrentBoard(boardId);

    this.undoRedo.record({
      undo: () => {
        const boards = this.store.boards();
        if (boards.length > 1) {
          this.store.deleteBoard(boardId);
          if (prevBoardId && this.store.boards().find((b) => b.id === prevBoardId)) {
            this.store.setCurrentBoard(prevBoardId);
          } else {
            const remaining = this.store.boards();
            if (remaining.length > 0) this.store.setCurrentBoard(remaining[0].id);
          }
        }
      },
      redo: () => {
        // Re-apply: add board again and update the tracked id
        boardId = this.store.addBoard();
        this.store.setCurrentBoard(boardId);
      },
    });

    return boardId;
  }

  selectBoard(boardId: string) {
    this.store.setCurrentBoard(boardId);
  }

  deleteBoard(boardId: string) {
    const boards = this.store.boards();
    if (boards.length <= 1) return;

    const boardIndex = boards.findIndex((b) => b.id === boardId);
    if (boardIndex < 0) return;
    const boardSnapshot = { ...boards[boardIndex] };
    const wasCurrentBoard = this.store.currentBoardId() === boardId;
    const prevCurrentId = this.store.currentBoardId();

    this.store.deleteBoard(boardId);

    // Determine which board was selected after deletion
    const remainingBoards = this.store.boards();
    if (wasCurrentBoard && remainingBoards.length > 0) {
      const prevIndex = Math.max(boardIndex - 1, 0);
      this.store.setCurrentBoard(remainingBoards[prevIndex].id);
    }

    const postDeleteCurrentId = this.store.currentBoardId();

    this.undoRedo.record({
      undo: () => {
        this.store.restoreBoard(boardSnapshot, boardIndex);
        if (wasCurrentBoard) {
          this.store.setCurrentBoard(boardSnapshot.id);
        } else if (prevCurrentId && this.store.boards().find((b) => b.id === prevCurrentId)) {
          this.store.setCurrentBoard(prevCurrentId);
        }
      },
      redo: () => {
        const currentBoards = this.store.boards();
        if (currentBoards.length <= 1) return;
        this.store.deleteBoard(boardSnapshot.id);
        const remaining = this.store.boards();
        if (postDeleteCurrentId && remaining.find((b) => b.id === postDeleteCurrentId)) {
          this.store.setCurrentBoard(postDeleteCurrentId);
        } else if (remaining.length > 0) {
          this.store.setCurrentBoard(remaining[0].id);
        }
      },
    });
  }

  /** Record a board reorder that has already been committed to the store. */
  recordReorder(fromIndex: number, toIndex: number): void {
    this.undoRedo.record({
      undo: () => this.store.reorderBoards(toIndex, fromIndex),
      redo: () => this.store.reorderBoards(fromIndex, toIndex),
    });
  }

  /** Record a duration change after a resize drag has finished. */
  recordDurationChange(boardId: string, oldDuration: number, newDuration: number): void {
    if (oldDuration === newDuration) return;
    this.undoRedo.record({
      undo: () => this.store.updateBoardDuration(boardId, oldDuration),
      redo: () => this.store.updateBoardDuration(boardId, newDuration),
    });
  }

  /** Record a two-board duration change caused by left-edge resize. */
  recordDualDurationChange(
    prevBoardId: string,
    oldPrevDuration: number,
    newPrevDuration: number,
    boardId: string,
    oldDuration: number,
    newDuration: number,
  ): void {
    if (oldPrevDuration === newPrevDuration && oldDuration === newDuration) return;
    this.undoRedo.record({
      undo: () => {
        this.store.updateBoardDuration(prevBoardId, oldPrevDuration);
        this.store.updateBoardDuration(boardId, oldDuration);
      },
      redo: () => {
        this.store.updateBoardDuration(prevBoardId, newPrevDuration);
        this.store.updateBoardDuration(boardId, newDuration);
      },
    });
  }

  /** Record a background color change on a board. */
  recordBackgroundColorChange(boardId: string, oldColor: string, newColor: string): void {
    if (oldColor === newColor) return;
    this.undoRedo.record({
      undo: () => {
        this.store.updateBackgroundColor(boardId, oldColor);
        if (this.store.currentBoardId() !== boardId) {
          this.store.setCurrentBoard(boardId);
        }
      },
      redo: () => {
        this.store.updateBackgroundColor(boardId, newColor);
        if (this.store.currentBoardId() !== boardId) {
          this.store.setCurrentBoard(boardId);
        }
      },
    });
  }
}
