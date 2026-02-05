import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { PlaybackService } from '../../../data/services/playback.service';

@Component({
  selector: 'app-timeline',
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineComponent {
  readonly store = inject(AppStore);
  readonly playbackService = inject(PlaybackService);

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

  async togglePlayback() {
    await this.playbackService.togglePlayback();
  }

  stopPlayback() {
    this.playbackService.stop();
  }

  get isPlaying() {
    return this.store.playback().isPlaying;
  }

  get currentFrame() {
    return this.store.playback().currentPlaybackIndex + 1;
  }

  get totalFrames() {
    return this.store.boards().length;
  }

  toggleLoop() {
    this.store.toggleLoop();
  }

  get isLooping() {
    return this.store.playback().loop;
  }

  updateFrameDuration(boardId: string, newDuration: string): void {
    const parsedDuration = Number(newDuration);
    this.playbackService.updateFrameDuration(boardId, parsedDuration);
  }
}
