import { Component, inject, input, signal } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { TimelineActions } from '../helpers/timeline.actions';
import { TimelineDrag } from '../helpers/timeline.drag';
import { createTimelineData } from '../helpers/timeline.editor.graphics';
import appSettings from '@econfig/appsettings.json';

@Component({
  selector: 'app-boards-track',
  imports: [],
  templateUrl: './boards-track.html',
  styleUrl: './boards-track.css',
  host: {
    '(document:mousemove)': 'onMouseMove($event)',
    '(document:mouseup)': 'onMouseUp()',
  },
})
export class BoardsTrackComponent {
  readonly store = inject(AppStore);
  readonly actions = inject(TimelineActions);
  readonly drag = inject(TimelineDrag);

  scale = input.required<number>();
  containerWidth = input.required<number>();

  readonly MIN_DURATION = 1 / (appSettings.board.defaultFps || 24);
  readonly SNAP_PRECISION =
    appSettings.board.defaultSnapPrecision || 1 / (appSettings.board.defaultFps || 24);

  // Resize state
  private isResizing = signal(false);
  resizingBoardId = signal<string | null>(null);
  private resizeEdge = signal<'left' | 'right' | null>(null);
  private resizeStartX = 0;
  private resizeStartDuration = 0;
  private resizeStartPrevDuration = 0;
  private resizePrevBoardId: string | null = null;

  private readonly _data = createTimelineData(this.store, this.scale, this.containerWidth);
  readonly timelineBoards = this._data.timelineBoards;
  readonly addButtonLeftPx = this._data.addButtonLeftPx;

  addBoard() {
    this.actions.addBoard();
  }

  selectBoard(boardId: string) {
    this.actions.selectBoard(boardId);
  }

  deleteBoard(boardId: string) {
    if (this.store.boards().length <= 1) return;
    this.actions.deleteBoard(boardId);
  }

  duplicateBoard(boardId: string) {
    this.actions.duplicateBoard(boardId);
  }

  startResize(event: MouseEvent, boardId: string, edge: 'left' | 'right') {
    event.preventDefault();
    event.stopPropagation();

    this.isResizing.set(true);
    this.resizingBoardId.set(boardId);
    this.resizeEdge.set(edge);
    this.resizeStartX = event.clientX;

    const board = this.store.boards().find((b) => b.id === boardId);
    this.resizeStartDuration = board?.duration ?? 3;

    if (edge === 'left') {
      const boards = this.store.boards();
      const idx = boards.findIndex((b) => b.id === boardId);
      if (idx > 0) {
        this.resizePrevBoardId = boards[idx - 1].id;
        this.resizeStartPrevDuration = boards[idx - 1].duration ?? 3;
      } else {
        this.resizePrevBoardId = null;
        this.resizeStartPrevDuration = 0;
      }
    }
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isResizing()) return;
    event.preventDefault();
    this.handleResizeDrag(event);
  }

  onMouseUp() {
    if (this.isResizing()) {
      // Record the final duration change(s) now that the drag is stable
      const boardId = this.resizingBoardId();
      if (boardId) {
        if (this.resizeEdge() === 'right') {
          const newDuration = this.store.boards().find((b) => b.id === boardId)?.duration;
          if (newDuration !== undefined) {
            this.actions.recordDurationChange(boardId, this.resizeStartDuration, newDuration);
          }
        } else if (this.resizeEdge() === 'left' && this.resizePrevBoardId) {
          const newPrevDuration = this.store
            .boards()
            .find((b) => b.id === this.resizePrevBoardId)?.duration;
          const newDuration = this.store.boards().find((b) => b.id === boardId)?.duration;
          if (newPrevDuration !== undefined && newDuration !== undefined) {
            this.actions.recordDualDurationChange(
              this.resizePrevBoardId,
              this.resizeStartPrevDuration,
              newPrevDuration,
              boardId,
              this.resizeStartDuration,
              newDuration,
            );
          }
        }
      }

      this.isResizing.set(false);
      this.resizingBoardId.set(null);
      this.resizeEdge.set(null);
      this.resizePrevBoardId = null;
    }
  }

  private snap(value: number): number {
    const precision = this.SNAP_PRECISION;
    return Math.round(value / precision) * precision;
  }

  private handleResizeDrag(event: MouseEvent) {
    const deltaX = event.clientX - this.resizeStartX;
    const deltaSec = this.snap(deltaX / this.scale());
    const boardId = this.resizingBoardId();
    if (!boardId) return;

    if (this.resizeEdge() === 'right') {
      const newDuration = this.snap(
        Math.max(this.MIN_DURATION, this.resizeStartDuration + deltaSec),
      );
      this.store.updateBoardDuration(boardId, newDuration);
    } else if (this.resizeEdge() === 'left' && this.resizePrevBoardId) {
      let clampedDelta = deltaSec;

      if (this.resizeStartPrevDuration + clampedDelta < this.MIN_DURATION) {
        clampedDelta = this.snap(this.MIN_DURATION - this.resizeStartPrevDuration);
      }
      if (this.resizeStartDuration - clampedDelta < this.MIN_DURATION) {
        clampedDelta = this.snap(this.resizeStartDuration - this.MIN_DURATION);
      }

      const prevDuration = this.snap(this.resizeStartPrevDuration + clampedDelta);
      const currDuration = this.snap(this.resizeStartDuration - clampedDelta);
      this.store.updateBoardDuration(this.resizePrevBoardId, prevDuration);
      this.store.updateBoardDuration(boardId, currDuration);
    }
  }

  // ─── Drag / drop ─────────────────────────────────────────────────

  onDragStart(event: DragEvent, boardId: string, boardIndex: number) {
    this.drag.startDrag(event, boardId, boardIndex);
  }

  onDragOver(event: DragEvent, boardId: string) {
    this.drag.handleDragOver(event, boardId);
  }

  onDragLeave(event: DragEvent) {
    this.drag.handleDragLeave(event);
  }

  onTrackDragOver(event: DragEvent) {
    this.drag.handleTrackDragOver(event);
  }

  onTrackDrop(event: DragEvent) {
    this.drag.handleTrackDrop(event);
  }

  onDrop(event: DragEvent) {
    this.drag.handleDrop(event);
  }

  onDragEnd(event: DragEvent) {
    this.drag.handleDragEnd(event);
  }

  shouldShowSpaceBefore(boardIndex: number): boolean {
    return this.drag.shouldShowSpaceBefore(boardIndex);
  }

  getBoardDragOffset(boardIndex: number): number {
    return this.drag.getBoardDragOffset(boardIndex);
  }
}
