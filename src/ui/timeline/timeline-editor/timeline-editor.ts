import { Component, inject, signal, computed, ViewChild, ElementRef, effect } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { TimelineActions } from '../helpers/timeline.actions';
import { createTimelineData } from '../helpers/timeline.editor.graphics';
import { PlaybackService } from '../../../services/playback.service';

@Component({
  selector: 'app-timeline-editor',
  imports: [],
  templateUrl: './timeline-editor.html',
  styleUrl: './timeline-editor.css',
  host: {
    '(document:mousemove)': 'handleDrag($event)',
    '(document:mouseup)': 'stopDrag()',
  },
})
export class TimelineEditor {
  readonly store = inject(AppStore);
  readonly actions = inject(TimelineActions);
  readonly playback = inject(PlaybackService);

  @ViewChild('timelineContent') timelineContent!: ElementRef;
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  readonly MIN_DURATION = 0.5;

  scale = signal(40); // pixels per second
  isScrubbing = signal(false);

  // Resize state
  private isResizing = signal(false);
  resizingBoardId = signal<string | null>(null);
  private resizeEdge = signal<'left' | 'right' | null>(null);
  private resizeStartX = 0;
  private resizeStartDuration = 0;
  private resizeStartPrevDuration = 0;
  private resizePrevBoardId: string | null = null;

  // Drag and drop state
  draggingBoardId = signal<string | null>(null);
  dragOverBoardId = signal<string | null>(null);
  dragInsertIndex = signal<number>(-1);
  private dragStartIndex = -1;

  private wasPlaying = false;

  playheadPosition = computed(() => {
    const time = this.store.currentTime();
    return time * this.scale();
  });

  private readonly _shared = createTimelineData(this.store, this.scale);
  timelineBoards = this._shared.timelineBoards;
  totalWidth = this._shared.totalWidth;
  addButtonLeftPx = this._shared.addButtonLeftPx;
  rulerTicks = this._shared.rulerTicks;

  constructor() {
    effect(() => {
      const playheadPos = this.playheadPosition();
      const isPlaying = this.store.isPlaying();

      if ((isPlaying || !this.isScrubbing()) && this.scrollContainer?.nativeElement) {
        this.scrollToPlayhead(playheadPos);
      }
    });
  }

  addBoard() {
    this.actions.addBoard();
  }

  selectBoard(boardId: string) {
    this.actions.selectBoard(boardId);
  }

  deleteBoard(boardId: string) {
    this.actions.deleteBoard(boardId);
  }

  startScrub(event: MouseEvent) {
    event.preventDefault();

    this.wasPlaying = this.store.isPlaying();
    if (this.wasPlaying) {
      this.playback.pause();
    }

    this.isScrubbing.set(true);

    this.seekToMouse(event);
  }

  handleDrag(event: MouseEvent) {
    if (this.isScrubbing()) {
      event.preventDefault();
      this.seekToMouse(event);
    } else if (this.isResizing()) {
      event.preventDefault();
      this.handleResizeDrag(event);
    }
  }

  onRulerClick(event: MouseEvent) {
    event.preventDefault();
    this.seekToMouse(event);
  }

  async stopDrag(): Promise<void> {
    if (this.isScrubbing()) {
      this.isScrubbing.set(false);

      if (this.wasPlaying) {
        try {
          await this.playback.play();
        } catch (err) {
          console.error('Failed to resume playback after scrubbing:', err);
        }
      }
    }

    if (this.isResizing()) {
      this.isResizing.set(false);
      this.resizingBoardId.set(null);
      this.resizeEdge.set(null);
      this.resizePrevBoardId = null;
    }
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

  /** Round to nearest hundredth of a second to avoid floating-point drift. */
  private snap(value: number): number {
    return Math.round(value * 100) / 100;
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

      // Clamp so the previous board doesn't go below minimum
      if (this.resizeStartPrevDuration + clampedDelta < this.MIN_DURATION) {
        clampedDelta = this.snap(this.MIN_DURATION - this.resizeStartPrevDuration);
      }
      // Clamp so the current board doesn't go below minimum
      if (this.resizeStartDuration - clampedDelta < this.MIN_DURATION) {
        clampedDelta = this.snap(this.resizeStartDuration - this.MIN_DURATION);
      }

      const prevDuration = this.snap(this.resizeStartPrevDuration + clampedDelta);
      const currDuration = this.snap(this.resizeStartDuration - clampedDelta);
      this.store.updateBoardDuration(this.resizePrevBoardId, prevDuration);
      this.store.updateBoardDuration(boardId, currDuration);
    }
  }

  private seekToMouse(event: MouseEvent) {
    if (!this.timelineContent?.nativeElement) return;

    const rect = this.timelineContent.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const seconds = Math.max(0, x / this.scale());

    this.playback.seek(seconds);
  }

  private scrollToPlayhead(playheadPos: number) {
    const container = this.scrollContainer?.nativeElement;
    if (!container) return;

    const scrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;
    const scrollRight = scrollLeft + containerWidth;

    // Add padding so playhead doesn't sit right at the edge (20% from edges)
    const leftPadding = containerWidth * 0.2;
    const rightPadding = containerWidth * 0.2;

    // Check if playhead is out of view or too close to edges
    if (playheadPos < scrollLeft + leftPadding) {
      // Scroll left to keep playhead visible with padding
      container.scrollLeft = Math.max(0, playheadPos - leftPadding);
    } else if (playheadPos > scrollRight - rightPadding) {
      // Scroll right to keep playhead visible with padding
      container.scrollLeft = playheadPos - containerWidth + rightPadding;
    }
  }

  onDragStart(event: DragEvent, boardId: string, boardIndex: number) {
    event.stopPropagation();
    this.draggingBoardId.set(boardId);
    this.dragStartIndex = boardIndex;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', boardId);
    }
  }

  onDragOver(event: DragEvent, boardId: string) {
    event.preventDefault();
    event.stopPropagation();

    if (!this.draggingBoardId() || this.draggingBoardId() === boardId) {
      return;
    }

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const mouseX = event.clientX;
    const boardCenterX = rect.left + rect.width / 2;

    const boards = this.store.boards();
    const targetIndex = boards.findIndex((b) => b.id === boardId);

    if (targetIndex !== -1) {
      let newInsertIndex: number;
      if (mouseX < boardCenterX) {
        newInsertIndex = targetIndex;
      } else {
        newInsertIndex = targetIndex + 1;
      }

      if (this.dragInsertIndex() !== newInsertIndex) {
        this.dragInsertIndex.set(newInsertIndex);
        this.dragOverBoardId.set(boardId);
      }
    }
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
  }

  onTrackDragOver(event: DragEvent) {
    event.preventDefault();
    if (this.draggingBoardId() && event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onTrackDrop(event: DragEvent) {
    this.onDrop(event);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const draggedBoardId = this.draggingBoardId();
    if (!draggedBoardId) {
      this.resetDragState();
      return;
    }

    const insertIndex = this.dragInsertIndex();
    const startIndex = this.dragStartIndex;

    if (insertIndex !== -1 && startIndex !== -1) {
      let targetIndex = insertIndex;

      if (startIndex < insertIndex) {
        targetIndex = insertIndex - 1;
      }

      if (targetIndex !== startIndex) {
        this.store.reorderBoards(startIndex, targetIndex);
      }
    }

    this.resetDragState();
  }

  onDragEnd(event: DragEvent) {
    event.preventDefault();
    this.resetDragState();
  }

  private resetDragState() {
    this.draggingBoardId.set(null);
    this.dragOverBoardId.set(null);
    this.dragInsertIndex.set(-1);
    this.dragStartIndex = -1;
  }

  shouldShowSpaceBefore(boardIndex: number): boolean {
    const insertIndex = this.dragInsertIndex();
    const draggingIndex = this.dragStartIndex;

    if (insertIndex === -1 || draggingIndex === -1) {
      return false;
    }

    return (
      boardIndex === insertIndex && boardIndex !== draggingIndex && boardIndex !== draggingIndex + 1
    );
  }

  getBoardDragOffset(boardIndex: number): number {
    const insertIndex = this.dragInsertIndex();
    const draggingIndex = this.dragStartIndex;

    if (insertIndex === -1 || draggingIndex === -1) {
      return 0;
    }

    const GAP_SIZE = 20; // pixels

    if (boardIndex === draggingIndex) {
      return 0;
    }

    if (draggingIndex < insertIndex) {
      if (boardIndex === insertIndex) {
        return GAP_SIZE;
      }
    } else if (draggingIndex > insertIndex) {
      if (boardIndex >= insertIndex && boardIndex < draggingIndex) {
        return GAP_SIZE;
      }
    }

    return 0;
  }
}
