import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { AppStore } from '../../../../data/store/app.store';
import { BoilService } from '../../../canvas/boil';

@Component({
  selector: 'app-boil-control',
  imports: [],
  templateUrl: './boil-control.component.html',
  styleUrls: ['../frame-control.css', './boil-control.component.css'],
})
export class BoilControlComponent implements OnDestroy {
  private readonly store = inject(AppStore);
  private readonly boil = inject(BoilService);
  private readonly document = inject(DOCUMENT);

  private holdTimer: number | null = null;
  private pointerActive = false;
  private holdTriggered = false;

  readonly submenuOpen = signal(false);

  readonly currentBoilEnabled = computed(() => {
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
    this.clearHoldTimer();
  }

  toggleBoil() {
    const id = this.store.currentBoardId();
    if (id) {
      this.store.toggleBoardBoil(id);
    }
    if (!this.currentBoilEnabled()) {
      this.submenuOpen.set(false);
    }
  }

  // --- Boil button: click toggles, Alt+click / press-and-hold / right-click opens submenu ---

  onPointerDown(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }

    this.pointerActive = true;
    this.holdTriggered = false;
    this.clearHoldTimer();

    // The submenu only adjusts an active boil, so it's gated behind boil being on.
    if (!this.currentBoilEnabled()) {
      return;
    }

    if (event.altKey) {
      this.holdTriggered = true;
      this.submenuOpen.set(true);
      return;
    }

    this.holdTimer = window.setTimeout(() => {
      if (!this.pointerActive) {
        return;
      }
      this.holdTriggered = true;
      this.submenuOpen.set(true);
    }, 300);
  }

  onPointerUp() {
    if (!this.pointerActive) {
      return;
    }

    this.pointerActive = false;
    const wasHold = this.holdTriggered;
    this.holdTriggered = false;
    this.clearHoldTimer();

    if (wasHold) {
      return;
    }

    this.toggleBoil();
  }

  onPointerCancel() {
    this.pointerActive = false;
    this.holdTriggered = false;
    this.clearHoldTimer();
  }

  onContextMenu(event: MouseEvent) {
    event.preventDefault();
    this.clearHoldTimer();
    this.pointerActive = false;
    this.holdTriggered = false;
    if (!this.currentBoilEnabled()) {
      return;
    }
    this.submenuOpen.set(true);
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
    if (!this.submenuOpen()) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target && (target.closest('.boil-btn') || target.closest('.submenu'))) {
      return;
    }
    this.submenuOpen.set(false);
  }

  private clearHoldTimer() {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }
}
