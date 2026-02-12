import { Component, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
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
}
