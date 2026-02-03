import { Component, inject } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';

@Component({
  selector: 'app-timeline',
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.css'],
})
export class TimelineComponent {
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

  async saveBoard() {
    const newBoard = this.store.exportAsJson();
    if (!window.quickboard) {
      console.error('File API unavailable.');
      return;
    }

    try {
      const result = await window.quickboard.saveBoard(newBoard);
      if (!result.canceled) {
        console.log(`File saved: ${result.filePath ?? 'unknown path'}`);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async loadBoard() {
    if (!window.quickboard) {
      console.error('File API unavailable.');
      return;
    }

    try {
      const result = await window.quickboard.loadBoard();
      if (!result.canceled && result.content) {
        this.store.loadFromJson(result.content);
      }
    } catch (err) {
      console.error(err);
    }
  }
}
