import { Component, inject, signal, computed } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';

@Component({
  selector: 'app-timeline-editor',
  imports: [],
  templateUrl: './timeline-editor.html',
  styleUrl: './timeline-editor.css',
})
export class TimelineEditor {
  readonly store = inject(AppStore);

  scale = signal(40); // pixels per second

  timelineBoards = computed(() => {
    let currentTime = 0;
    return this.store.boards().map((board) => {
      const duration = board.duration;
      const startTime = currentTime;
      currentTime += duration;

      return {
        ...board,
        startTime,
        duration,
        leftPx: startTime * this.scale(),
        widthPx: duration * this.scale(),
      };
    });
  });

  totalWidth = computed(() => {
    const lastBoard = this.timelineBoards().slice(-1)[0];
    const endSecond = lastBoard ? lastBoard.startTime + lastBoard.duration : 0;
    return Math.max((endSecond + 5) * this.scale(), 800);
  });

  addButtonLeftPx = computed(() => {
    const boards = this.timelineBoards();
    if (boards.length === 0) return 8;
    const lastBoard = boards[boards.length - 1];
    return lastBoard.leftPx + lastBoard.widthPx + 8;
  });

  rulerTicks = computed(() => {
    const ticks = [];
    const width = this.totalWidth();
    const stepSeconds = 5;
    const stepPx = stepSeconds * this.scale();
    const count = Math.ceil(width / stepPx);

    for (let i = 0; i < count; i++) {
      ticks.push({
        time: i * stepSeconds,
        left: i * stepPx,
        label: this.formatTime(i * stepSeconds),
      });
    }
    return ticks;
  });

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

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
