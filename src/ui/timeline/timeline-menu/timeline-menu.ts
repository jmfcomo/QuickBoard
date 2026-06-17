import { Component, inject, computed, signal, effect, OnDestroy } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { AppStore } from '../../../data/store/app.store';
import { PlaybackService } from '../../../services/playback.service';
import { TimelineZoomService } from '../../../services/timeline-zoom.service';
import { BoilService } from '../../canvas/boil';
import { formatTime as formatTimeUtil } from '../helpers/format-time';

@Component({
  selector: 'app-timeline-menu',
  imports: [],
  templateUrl: './timeline-menu.html',
  styleUrl: './timeline-menu.css',
})
export class TimelineMenu implements OnDestroy {
  readonly store = inject(AppStore);
  readonly playback = inject(PlaybackService);
  readonly zoom = inject(TimelineZoomService);
  private readonly boil = inject(BoilService);
  private readonly document = inject(DOCUMENT);

  private boilHoldTimer: number | null = null;
  private boilPointerActive = false;
  private boilHoldTriggered = false;

  readonly boilSubmenuOpen = signal(false);

  readonly zoomScale = this.zoom.scale;
  readonly sliderPosition = this.zoom.sliderPosition;
  readonly zoomPercent = this.zoom.zoomPercent;
  readonly sliderMin = this.zoom.SLIDER_MIN;
  readonly sliderMax = this.zoom.SLIDER_MAX;
  readonly isMinZoom = computed(() => this.sliderPosition() <= this.sliderMin);
  readonly isMaxZoom = computed(() => this.sliderPosition() >= this.sliderMax);

  currentDuration = computed(() => {
    const id = this.store.currentBoardId();
    const board = this.store.boards().find((b) => b.id === id);
    return board?.duration ?? 3;
  });

  currentBoilEnabled = computed(() => {
    const id = this.store.currentBoardId();
    const board = this.store.boards().find((b) => b.id === id);
    return board?.boilEnabled ?? false;
  });

  /** Effective boil parameters for the current board (per-frame over defaults). */
  readonly currentBoilParams = computed(() => {
    const id = this.store.currentBoardId();
    const board = this.store.boards().find((b) => b.id === id);
    return this.boil.resolveParams(board ?? {});
  });

  constructor() {
    effect((onCleanup) => {
      const handlePointerDown = (event: PointerEvent) => this.handleDocumentPointerDown(event);
      this.document.addEventListener('pointerdown', handlePointerDown, true);
      onCleanup(() => {
        this.document.removeEventListener('pointerdown', handlePointerDown, true);
      });
    });
  }

  ngOnDestroy(): void {
    this.clearBoilHoldTimer();
  }

  updateDuration(value: string) {
    const n = Number(value);
    const minDuration = 1 / (this.store.fps() || 24);
    if (Number.isFinite(n) && n > 0) {
      const id = this.store.currentBoardId();
      if (id) this.store.updateBoardDuration(id, Math.max(minDuration, n));
    }
  }

  togglePlayback() {
    this.playback.togglePlayback();
  }

  toggleOnionSkin() {
    this.store.toggleOnionSkin();
  }

  toggleBoil() {
    const id = this.store.currentBoardId();
    if (id) {
      this.store.toggleBoardBoil(id);
    }
  }

  // --- Boil button: click toggles, Alt+click / press-and-hold / right-click opens submenu ---

  onBoilPointerDown(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }

    this.boilPointerActive = true;
    this.boilHoldTriggered = false;
    this.clearBoilHoldTimer();

    if (event.altKey) {
      this.boilHoldTriggered = true;
      this.boilSubmenuOpen.set(true);
      return;
    }

    this.boilHoldTimer = window.setTimeout(() => {
      if (!this.boilPointerActive) {
        return;
      }
      this.boilHoldTriggered = true;
      this.boilSubmenuOpen.set(true);
    }, 300);
  }

  onBoilPointerUp() {
    if (!this.boilPointerActive) {
      return;
    }

    this.boilPointerActive = false;
    const wasHold = this.boilHoldTriggered;
    this.boilHoldTriggered = false;
    this.clearBoilHoldTimer();

    if (wasHold) {
      return;
    }

    this.toggleBoil();
  }

  onBoilPointerCancel() {
    this.boilPointerActive = false;
    this.boilHoldTriggered = false;
    this.clearBoilHoldTimer();
  }

  onBoilContextMenu(event: MouseEvent) {
    event.preventDefault();
    this.clearBoilHoldTimer();
    this.boilPointerActive = false;
    this.boilHoldTriggered = false;
    this.boilSubmenuOpen.set(true);
  }

  setBoilParam(key: 'variations' | 'holdFrames' | 'amount', value: string) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return;
    }
    const id = this.store.currentBoardId();
    if (!id) {
      return;
    }
    const clamped =
      key === 'amount' ? Math.max(0, n) : Math.max(key === 'variations' ? 2 : 1, Math.round(n));
    this.store.setBoardBoilParams(id, { [key]: clamped });
  }

  private handleDocumentPointerDown(event: PointerEvent) {
    if (!this.boilSubmenuOpen()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.closest('.boil-btn') || target.closest('.boil-submenu'))) {
      return;
    }
    this.boilSubmenuOpen.set(false);
  }

  private clearBoilHoldTimer() {
    if (this.boilHoldTimer !== null) {
      clearTimeout(this.boilHoldTimer);
      this.boilHoldTimer = null;
    }
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
      this.zoom.setSliderPosition(n);
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
