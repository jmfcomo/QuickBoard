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

  private onionHoldTimer: number | null = null;
  private onionPointerActive = false;
  private onionHoldTriggered = false;

  readonly onionSubmenuOpen = signal(false);

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
    this.clearOnionHoldTimer();
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
    if (!this.store.onionSkinEnabled()) {
      this.onionSubmenuOpen.set(false);
    }
  }

  // --- Onion skin button: click toggles, Alt+click / press-and-hold / right-click opens submenu ---

  onOnionPointerDown(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }

    this.onionPointerActive = true;
    this.onionHoldTriggered = false;
    this.clearOnionHoldTimer();

    // The submenu only adjusts an active onion skin, so it's gated behind onion being on.
    if (!this.store.onionSkinEnabled()) {
      return;
    }

    if (event.altKey) {
      this.onionHoldTriggered = true;
      this.onionSubmenuOpen.set(true);
      return;
    }

    this.onionHoldTimer = window.setTimeout(() => {
      if (!this.onionPointerActive) {
        return;
      }
      this.onionHoldTriggered = true;
      this.onionSubmenuOpen.set(true);
    }, 300);
  }

  onOnionPointerUp() {
    if (!this.onionPointerActive) {
      return;
    }

    this.onionPointerActive = false;
    const wasHold = this.onionHoldTriggered;
    this.onionHoldTriggered = false;
    this.clearOnionHoldTimer();

    if (wasHold) {
      return;
    }

    this.toggleOnionSkin();
  }

  onOnionPointerCancel() {
    this.onionPointerActive = false;
    this.onionHoldTriggered = false;
    this.clearOnionHoldTimer();
  }

  onOnionContextMenu(event: MouseEvent) {
    event.preventDefault();
    this.clearOnionHoldTimer();
    this.onionPointerActive = false;
    this.onionHoldTriggered = false;
    if (!this.store.onionSkinEnabled()) {
      return;
    }
    this.onionSubmenuOpen.set(true);
  }

  setOnionFramesBack(value: string) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return;
    }
    this.store.setOnionFramesBack(n);
  }

  setOnionFramesForward(value: string) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return;
    }
    this.store.setOnionFramesForward(n);
  }

  setOnionPrevColor(value: string) {
    this.store.setOnionPrevColor(value);
  }

  setOnionNextColor(value: string) {
    this.store.setOnionNextColor(value);
  }

  private clearOnionHoldTimer() {
    if (this.onionHoldTimer !== null) {
      clearTimeout(this.onionHoldTimer);
      this.onionHoldTimer = null;
    }
  }

  toggleBoil() {
    const id = this.store.currentBoardId();
    if (id) {
      this.store.toggleBoardBoil(id);
    }
    if (!this.currentBoilEnabled()) {
      this.boilSubmenuOpen.set(false);
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

    // The submenu only adjusts an active boil, so it's gated behind boil being on.
    if (!this.currentBoilEnabled()) {
      return;
    }

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
    if (!this.currentBoilEnabled()) {
      return;
    }
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
      key === 'amount'
        ? Math.max(0, Math.min(20, n))
        : key === 'variations'
          ? Math.max(2, Math.min(12, Math.round(n)))
          : Math.max(1, Math.min(24, Math.round(n)));
    this.store.setBoardBoilParams(id, { [key]: clamped });
  }

  private handleDocumentPointerDown(event: PointerEvent) {
    const target = event.target instanceof Element ? event.target : null;

    if (this.boilSubmenuOpen()) {
      if (!(target && (target.closest('.boil-btn') || target.closest('.boil-submenu')))) {
        this.boilSubmenuOpen.set(false);
      }
    }

    if (this.onionSubmenuOpen()) {
      if (!(target && (target.closest('.onion-skin-btn') || target.closest('.onion-submenu')))) {
        this.onionSubmenuOpen.set(false);
      }
    }
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
