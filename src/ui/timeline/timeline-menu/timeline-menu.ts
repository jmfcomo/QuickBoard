import { Component, inject, computed } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { PlaybackService } from '../../../services/playback.service';
import { TimelineZoomService } from '../../../services/timeline-zoom.service';
import { formatTime as formatTimeUtil } from '../helpers/format-time';

@Component({
  selector: 'app-timeline-menu',
  imports: [],
  templateUrl: './timeline-menu.html',
  styleUrl: './timeline-menu.css',
})
export class TimelineMenu {
  readonly store = inject(AppStore);
  readonly playback = inject(PlaybackService);
  readonly zoom = inject(TimelineZoomService);

  readonly zoomScale = this.zoom.scale;
  readonly zoomPercent = this.zoom.zoomPercent;
  readonly minScale = this.zoom.MIN_SCALE;
  readonly maxScale = this.zoom.MAX_SCALE;
  readonly zoomStep = this.zoom.STEP;
  readonly isMinZoom = computed(() => this.zoomScale() <= this.minScale);
  readonly isMaxZoom = computed(() => this.zoomScale() >= this.maxScale);

  currentDuration = computed(() => {
    const id = this.store.currentBoardId();
    const board = this.store.boards().find((b) => b.id === id);
    return board?.duration ?? 3;
  });

  updateDuration(value: string) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) {
      const id = this.store.currentBoardId();
      if (id) this.store.updateBoardDuration(id, Math.max(0.01, n));
    }
  }

  togglePlayback() {
    this.playback.togglePlayback();
  }

  toggleOnionSkin() {
    this.store.toggleOnionSkin();
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

  updateZoom(value: string) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      this.zoom.setScale(n);
    }
  }

  zoomIn() {
    this.zoom.zoomIn();
  }

  zoomOut() {
    this.zoom.zoomOut();
  }

  resetZoom() {
    this.zoom.reset();
  }

  formatTime(seconds: number, hundredths = false): string {
    return formatTimeUtil(seconds, hundredths);
  }
}
