import { Injectable, OnDestroy, inject } from '@angular/core';
import { AppStore } from '../data/store/app.store';
import * as Tone from 'tone';

@Injectable({ providedIn: 'root' })
export class PlaybackService implements OnDestroy {
  readonly store = inject(AppStore);

  private playbackFrameId: number | null = null;

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
    if (this.playbackFrameId !== null) {
      cancelAnimationFrame(this.playbackFrameId);
      this.playbackFrameId = null;
    }
  }

  private syncVisuals(time: number) {
    let accumulatedTime = 0;
    const boards = this.store.boards();

    for (const board of boards) {
      const duration = board.duration;
      const startTime = accumulatedTime;
      const endTime = accumulatedTime + duration;

      if (time >= startTime && time < endTime) {
        if (this.store.currentBoardId() !== board.id) {
          this.store.setCurrentBoard(board.id);
        }
        return;
      }
      accumulatedTime += duration;
    }
  }

  ngOnDestroy() {
    this.stop();
  }
}
