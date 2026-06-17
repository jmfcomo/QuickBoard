import { Component, inject } from '@angular/core';
import { AppStore } from '../../../../data/store/app.store';
import { PlaybackService } from '../../../../services/playback.service';

@Component({
  selector: 'app-playback-controls',
  imports: [],
  templateUrl: './playback-controls.component.html',
  styleUrl: './playback-controls.component.css',
})
export class PlaybackControlsComponent {
  private readonly store = inject(AppStore);
  private readonly playback = inject(PlaybackService);

  readonly isPlaying = this.store.isPlaying;

  togglePlayback() {
    this.playback.togglePlayback();
  }

  goToStart() {
    this.playback.seek(0);
  }

  backOneBoard() {
    const boards = this.store.boards();
    const currentId = this.store.currentBoardId();
    if (!currentId) return this.playback.seek(0);

    const currentIndex = boards.findIndex((b) => b.id === currentId);
    if (currentIndex === -1) return this.playback.seek(0);

    const targetIndex = Math.max(0, currentIndex - 1);
    const targetTime = boards.slice(0, targetIndex).reduce((s, x) => s + x.duration, 0);
    this.playback.seek(targetTime);
  }

  forwardOneBoard() {
    const boards = this.store.boards();
    const currentId = this.store.currentBoardId();
    const total = this.store.totalDuration();
    if (!currentId) return this.playback.seek(total);

    const currentIndex = boards.findIndex((b) => b.id === currentId);
    if (currentIndex === -1) return this.playback.seek(total);

    const targetIndex = Math.min(boards.length - 1, currentIndex + 1);
    const targetTime = boards.slice(0, targetIndex).reduce((s, x) => s + x.duration, 0);
    this.playback.seek(targetTime);
  }

  goToEnd() {
    const total = this.store.totalDuration();
    this.playback.seek(total);
  }
}
