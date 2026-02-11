import { Injectable, OnDestroy, inject, effect } from '@angular/core';
import { AppStore } from '../data/store/app.store';
import * as Tone from 'tone';

interface BoardTimeRange {
  id: string;
  startTime: number;
  endTime: number;
}

@Injectable({ providedIn: 'root' })
export class PlaybackService implements OnDestroy {
  readonly store = inject(AppStore);

  private playbackFrameId: number | null = null;
  private boardTimeRanges: BoardTimeRange[] = [];
  private currentBoardIndex = 0;

  constructor() {
    // Precompute time ranges whenever boards change
    effect(() => {
      this.precomputeTimeRanges(this.store.boards());
    });
  }

  async play() {
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }

    const duration = this.store.totalDuration();
    if (this.store.currentTime() >= duration && duration > 0) {
      Tone.Transport.seconds = 0;
      this.store.setCurrentTime(0);
    }

    Tone.Transport.start();
    this.store.setIsPlaying(true);
    this.startUiLoop();
  }

  pause() {
    Tone.Transport.pause();
    this.store.setIsPlaying(false);
    this.stopUiLoop();
  }

  togglePlayback() {
    if (this.store.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  stop() {
    Tone.Transport.stop();
    this.store.setIsPlaying(false);
    this.store.setCurrentTime(0);
    this.stopUiLoop();
  }

  seek(time: number) {
    const duration = this.store.totalDuration();
    const safeTime = Math.max(0, Math.min(time, duration));

    Tone.Transport.seconds = safeTime;

    this.store.setCurrentTime(safeTime);
    this.syncVisuals(safeTime);
  }

  private startUiLoop() {
    this.stopUiLoop();

    const loop = () => {
      const time = Tone.Transport.seconds;
      const duration = this.store.totalDuration();

      if (time >= duration && duration > 0) {
        this.pause();
        this.seek(duration);
        return;
      }

      this.store.setCurrentTime(time);
      this.syncVisuals(time);

      if (this.store.isPlaying()) {
        this.playbackFrameId = requestAnimationFrame(loop);
      }
    };

    this.playbackFrameId = requestAnimationFrame(loop);
  }

  private stopUiLoop() {
    if (this.playbackFrameId) {
      cancelAnimationFrame(this.playbackFrameId);
      this.playbackFrameId = null;
    }
  }

  private precomputeTimeRanges(boards: { id: string; duration: number }[]) {
    let accumulatedTime = 0;
    this.boardTimeRanges = boards.map((board) => {
      const range: BoardTimeRange = {
        id: board.id,
        startTime: accumulatedTime,
        endTime: accumulatedTime + board.duration,
      };
      accumulatedTime += board.duration;
      return range;
    });
    this.currentBoardIndex = 0;
  }

  private syncVisuals(time: number) {
    if (this.boardTimeRanges.length === 0) {
      return;
    }

    // Fast path: check current index first (O(1) for sequential playback)
    const current = this.boardTimeRanges[this.currentBoardIndex];
    if (current && time >= current.startTime && time < current.endTime) {
      if (this.store.currentBoardId() !== current.id) {
        this.store.setCurrentBoard(current.id);
      }
      return;
    }

    // Check next board (handles most forward playback cases in O(1))
    if (
      this.currentBoardIndex + 1 < this.boardTimeRanges.length &&
      time >= this.boardTimeRanges[this.currentBoardIndex + 1].startTime
    ) {
      this.currentBoardIndex++;
      const next = this.boardTimeRanges[this.currentBoardIndex];
      if (time >= next.startTime && time < next.endTime) {
        if (this.store.currentBoardId() !== next.id) {
          this.store.setCurrentBoard(next.id);
        }
        return;
      }
    }

    // Binary search for seeking or large jumps (O(log n))
    this.currentBoardIndex = this.binarySearchBoard(time);
    const found = this.boardTimeRanges[this.currentBoardIndex];
    if (found && this.store.currentBoardId() !== found.id) {
      this.store.setCurrentBoard(found.id);
    }
  }

  private binarySearchBoard(time: number): number {
    let left = 0;
    let right = this.boardTimeRanges.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const range = this.boardTimeRanges[mid];

      if (time >= range.startTime && time < range.endTime) {
        return mid;
      } else if (time < range.startTime) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return Math.max(0, Math.min(left, this.boardTimeRanges.length - 1));
  }

  ngOnDestroy() {
    this.stop();
  }
}
