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
    '(document:mouseup)': 'stopScrub()',
  },
})
export class TimelineEditor {
  readonly store = inject(AppStore);
  readonly actions = inject(TimelineActions);
  readonly playback = inject(PlaybackService);

  @ViewChild('timelineContent') timelineContent!: ElementRef;

  scale = signal(40); // pixels per second
  isScrubbing = signal(false);

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
    }
  }

  stopScrub() {
    if (this.isScrubbing()) {
      this.isScrubbing.set(false);

      if (this.wasPlaying) {
        this.playback.play();
      }
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
