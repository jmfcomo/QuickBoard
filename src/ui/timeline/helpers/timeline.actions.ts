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
      this.store.deleteBoard(boardId);
      if (this.store.currentBoardId() === boardId) {
        this.store.setCurrentBoard(boards[0].id);
      }
    }
  }
}
