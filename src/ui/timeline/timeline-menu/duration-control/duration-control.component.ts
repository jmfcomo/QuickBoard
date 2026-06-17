import { Component, inject, computed } from '@angular/core';
import { AppStore } from '../../../../data/store/app.store';

@Component({
  selector: 'app-duration-control',
  imports: [],
  templateUrl: './duration-control.component.html',
  styleUrl: './duration-control.component.css',
})
export class DurationControlComponent {
  private readonly store = inject(AppStore);

  readonly currentDuration = computed(() => {
    const id = this.store.currentBoardId();
    const board = this.store.boards().find((b) => b.id === id);
    return board?.duration ?? 3;
  });

  updateDuration(value: string) {
    const n = Number(value);
    const minDuration = 1 / (this.store.fps() || 24);
    if (Number.isFinite(n) && n > 0) {
      const id = this.store.currentBoardId();
      if (id) this.store.updateBoardDuration(id, Math.max(minDuration, n));
    }
  }
}
