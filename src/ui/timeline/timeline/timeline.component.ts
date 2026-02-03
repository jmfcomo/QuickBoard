import { Component, inject } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';

import * as fs from 'fs';

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

  saveBoard() {
    const newBoard = this.store.exportAsJson();

    console.log(newBoard);

    // stops everything to write file
    try {
      fs.writeFileSync('testing.txt', newBoard, 'utf-8');
      console.log("File written successfully!");
      } catch (err) {
          console.error(err);
        }
  }

  loadBoard() {
    console.log("Loading file...");
    try {
      const pulled = fs.readFileSync('testing.txt', 'utf-8');
      console.log(pulled);
    } catch (err) {
        console.error(err);
      }
  }
}
