import { Component, inject } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';

@Component({
  selector: 'app-timeline-editor',
  imports: [],
  templateUrl: './timeline-editor.html',
  styleUrl: './timeline-editor.css',
})
export class TimelineEditor {
  readonly store = inject(AppStore);

  addBoard() {
    const newBoardId = this.store.addBoard();
    this.store.setCurrentBoard(newBoardId);
  }

  selectBoard(boardId: string) {
    this.store.setCurrentBoard(boardId);
  }

  deleteBoard(boardId: string) {
    const boards = this.store.boards();
    if (boards.length > 1) {
      this.store.deleteBoard(boardId);
      // Select another board if the deleted one was selected
      if (this.store.currentBoardId() === boardId) {
        this.store.setCurrentBoard(boards[0].id);
      }
    }
  }
}
