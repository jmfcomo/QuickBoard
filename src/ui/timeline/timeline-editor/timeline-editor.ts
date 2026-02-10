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
})
export class TimelineEditor {
  readonly store = inject(AppStore);
  readonly actions = inject(TimelineActions);
  readonly playback = inject(PlaybackService);

  @ViewChild('timelineContent') timelineContent!: ElementRef;

  scale = signal(40); // pixels per second
  isScrubbing = signal(false);

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
    this.isScrubbing.set(true);
    this.seekToMouse(event);
  }

  handleDrag(event: MouseEvent) {
    if (this.isScrubbing()) {
      event.preventDefault();
      this.seekToMouse(event);
    }
  }

  stopScrub() {
    this.isScrubbing.set(false);
  }

  private seekToMouse(event: MouseEvent) {
    if (!this.timelineContent) return;
    const rect = this.timelineContent.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const seconds = Math.max(0, x / this.scale());

    this.playback.seek(seconds);
  }
}
