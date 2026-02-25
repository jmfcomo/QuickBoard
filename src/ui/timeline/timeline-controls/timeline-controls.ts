import { Component, computed, inject } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { AudioService } from '../../../services/audio.service';

@Component({
  selector: 'app-timeline-controls',
  imports: [],
  templateUrl: './timeline-controls.html',
  styleUrl: './timeline-controls.css',
})
export class TimelineControlsComponent {
  readonly store = inject(AppStore);
  readonly audio = inject(AudioService);

  readonly MAX_AUDIO_LANES = 4;

  audioLanes = computed(() => {
    const mixers = this.store.audioLaneMixers();
    return Array.from({ length: this.store.audioLaneCount() }, (_, i) => ({
      laneIndex: i,
      volume: mixers[i]?.volume ?? 1,
      muted: mixers[i]?.muted ?? false,
    }));
  });

  canAddLane = computed(() => this.store.audioLaneCount() < this.MAX_AUDIO_LANES);

  setLaneMuted(laneIndex: number) {
    const current = this.store.audioLaneMixers()[laneIndex]?.muted ?? false;
    this.audio.setLaneMuted(laneIndex, !current);
  }

  setLaneVolume(laneIndex: number, event: Event) {
    const input = event.target as HTMLInputElement;
    this.audio.setLaneVolume(laneIndex, parseFloat(input.value) / 100);
  }

  removeLane(laneIndex: number) {
    this.audio.removeLane(laneIndex);
  }
}
