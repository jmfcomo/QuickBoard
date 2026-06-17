import { Component, OnDestroy, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { AppStore } from '../../../../data/store/app.store';

@Component({
  selector: 'app-onion-control',
  imports: [],
  templateUrl: './onion-control.component.html',
  styleUrls: ['../frame-control.css', './onion-control.component.css'],
})
export class OnionControlComponent implements OnDestroy {
  readonly store = inject(AppStore);
  private readonly document = inject(DOCUMENT);

  private holdTimer: number | null = null;
  private pointerActive = false;
  private holdTriggered = false;

  readonly submenuOpen = signal(false);

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

  toggleOnionSkin() {
    this.store.toggleOnionSkin();
    if (!this.store.onionSkinEnabled()) {
      this.submenuOpen.set(false);
    }
  }

  // --- Onion skin button: click toggles, Alt+click / press-and-hold / right-click opens submenu ---

  onPointerDown(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }

    this.pointerActive = true;
    this.holdTriggered = false;
    this.clearHoldTimer();

    // The submenu only adjusts an active onion skin, so it's gated behind onion being on.
    if (!this.store.onionSkinEnabled()) {
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

    this.toggleOnionSkin();
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
    if (!this.store.onionSkinEnabled()) {
      return;
    }
    this.submenuOpen.set(true);
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

  private handleDocumentPointerDown(event: PointerEvent) {
    if (!this.submenuOpen()) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target && (target.closest('.onion-skin-btn') || target.closest('.submenu'))) {
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
