import { Component, inject, computed } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';

@Component({
  selector: 'app-timeline-menu',
  imports: [],
  templateUrl: './timeline-menu.html',
  styleUrl: './timeline-menu.css',
})
export class TimelineMenu {
  readonly store = inject(AppStore);

  currentDuration = computed(() => {
    const id = this.store.currentBoardId();
    const board = this.store.boards().find((b) => b.id === id);
    return board?.duration ?? 3;
  });

  updateDuration(value: string) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) {
      const id = this.store.currentBoardId();
      if (id) this.store.updateBoardDuration(id, Math.max(0.1, n));
    }
  }
}
