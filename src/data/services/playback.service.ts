import { Injectable, inject, effect } from '@angular/core';
import * as Tone from 'tone';
import { AppStore } from '../store/app.store';

interface FrameSchedule {
  boardId: string;
  boardIndex: number;
  startTime: number;
  duration: number;
}

@Injectable({
  providedIn: 'root',
})
export class PlaybackService {
  private readonly store = inject(AppStore);
  private timeline: Tone.Part | null = null;
  private frameSchedule: FrameSchedule[] = [];
  private isInitialized = false;
  private stopScheduleId: number | null = null;

  constructor() {
    effect(() => {
      const playback = this.store.playback();
      if (playback.isPlaying && !this.isPlaying()) {
        this.play();
      } else if (!playback.isPlaying && this.isPlaying()) {
        this.pause();
      }
    });

    effect(() => {
      const loop = this.store.playback().loop;
      if (this.timeline) {
        this.timeline.loop = true;
        this.timeline.loopEnd = this.getTotalDuration();
        if (loop) {
          this.clearScheduledStop();
        } else if (this.isPlaying()) {
          this.scheduleStopAtLoopEnd();
        }
      }
    });
  }

  // init Tone.js
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await Tone.start();
    this.isInitialized = true;
    console.log('Tone.js initialized');
  }

  // build schedule
  private buildFrameSchedule(): void {
    const boards = this.store.boards();
    this.frameSchedule = [];

    let currentTime = 0;
    boards.forEach((board, index) => {
      const duration = board.duration || 2;
      this.frameSchedule.push({
        boardId: board.id,
        boardIndex: index,
        startTime: currentTime,
        duration,
      });
      currentTime += duration;
    });
  }

  // schedule timeline
  private async createTimeline(): Promise<void> {
    this.cleanup();
    this.buildFrameSchedule();

    if (this.frameSchedule.length === 0) return;

    const events: [number, number][] = this.frameSchedule.map((frame) => [
      frame.startTime,
      frame.boardIndex,
    ]);

    this.timeline = new Tone.Part((time, boardIndex: number) => {
      Tone.Draw.schedule(() => {
        this.updateFrame(boardIndex);
      }, time);
    }, events);

    this.timeline.loop = true;
    this.timeline.loopEnd = this.getTotalDuration();
  }

  private updateFrame(boardIndex: number): void {
    const boards = this.store.boards();
    if (boardIndex >= 0 && boardIndex < boards.length) {
      const board = boards[boardIndex];
      this.store.setCurrentBoard(board.id);
      this.store.setCurrentPlaybackIndex(boardIndex);
    }
  }

  async play(): Promise<void> {
    await this.initialize();

    if (!this.timeline) {
      await this.createTimeline();
    }

    if (this.timeline) {
      Tone.getTransport().start();
      this.timeline.start(0);
      if (!this.store.playback().loop) {
        this.scheduleStopAtLoopEnd();
      }
    }
  }

  pause(): void {
    if (this.timeline) {
      Tone.getTransport().pause();
    }
    this.clearScheduledStop();
  }

  stop(): void {
    this.pause();
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;

    this.clearScheduledStop();

    // reset to start
    this.store.setPlaybackState(false, 0);
    if (this.store.boards().length > 0) {
      this.store.setCurrentBoard(this.store.boards()[0].id);
    }
  }

  async togglePlayback(): Promise<void> {
    const isPlaying = this.store.playback().isPlaying;
    this.store.setIsPlaying(!isPlaying);
  }

  isPlaying(): boolean {
    return Tone.getTransport().state === 'started';
  }

  getTotalDuration(): number {
    return this.frameSchedule.reduce((total, frame) => total + frame.duration, 0);
  }

  private cleanup(): void {
    if (this.timeline) {
      this.timeline.dispose();
      this.timeline = null;
    }
    this.clearScheduledStop();
  }

  private scheduleStopAtLoopEnd(): void {
    if (this.frameSchedule.length === 0) return;

    const currentIndex = this.store.playback().currentPlaybackIndex;
    const transport = Tone.getTransport();

    // Calculate remaining time based on current frame progress
    const currentFrame = this.frameSchedule[currentIndex];
    const elapsedInFrame = transport.seconds - currentFrame.startTime;
    const remainingInFrame = Math.max(0, currentFrame.duration - elapsedInFrame);

    // Sum remaining durations from current frame to the end
    const remaining =
      remainingInFrame +
      this.frameSchedule
        .slice(currentIndex + 1)
        .reduce((total, frame) => total + frame.duration, 0);

    if (remaining <= 0) return;

    this.clearScheduledStop();
    this.stopScheduleId = transport.scheduleOnce(() => {
      this.stop();
    }, `+${remaining}`);
  }

  private clearScheduledStop(): void {
    if (this.stopScheduleId !== null) {
      Tone.getTransport().clear(this.stopScheduleId);
      this.stopScheduleId = null;
    }
  }

  async rebuild(): Promise<void> {
    const wasPlaying = this.isPlaying();
    this.stop();

    if (wasPlaying) {
      await this.play();
    }
  }

  destroy(): void {
    this.stop();
    this.cleanup();
    this.isInitialized = false;
  }
}
