import { Injectable, inject } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';

@Injectable({ providedIn: 'root' })
export class TimelineActions {
  private readonly store = inject(AppStore);

  addBoard(): string {
    const newBoardId = this.store.addBoard();
    this.store.setCurrentBoard(newBoardId);
    return newBoardId;
  }

  selectBoard(boardId: string) {
    this.store.setCurrentBoard(boardId);
  }

  deleteBoard(boardId: string) {
    const boards = this.store.boards();
    if (boards.length > 1) {
      const wasCurrentBoard = this.store.currentBoardId() === boardId;
      const deletedIndex = boards.findIndex(b => b.id === boardId);
      this.store.deleteBoard(boardId);
      if (wasCurrentBoard) {
        const remainingBoards = this.store.boards();
        if (remainingBoards.length > 0) {
          // Select the previous board (closest to the left), or the first if deleted was index 0
          const prevIndex = Math.max(deletedIndex - 1, 0);
          this.store.setCurrentBoard(remainingBoards[prevIndex].id);
        }
      }
    }
  }
}
