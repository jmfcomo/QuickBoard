import { Injectable, inject } from '@angular/core';
import { AppStore, AudioTrack } from '../data/store/app.store';
import * as Tone from 'tone';

@Injectable({ providedIn: 'root' })
export class AudioService {
  readonly store = inject(AppStore);
  private players = new Map<string, Tone.Player>();

  async importAudioFile(file: File, startTime = 0, laneIndex = 0): Promise<void> {
    const url = URL.createObjectURL(file);
    const id = crypto.randomUUID();

    try {
      const player = new Tone.Player({
        url: url,
        onload: () => {
          const duration = player.buffer.duration;

          player.toDestination();

          player.sync().start(startTime);

          this.players.set(id, player);

          const newTrack: AudioTrack = {
            id,
            name: file.name,
            url,
            startTime,
            duration,
            laneIndex,
          };

          this.store.addAudioTrack(newTrack);
        },
      });
    } catch (error) {
      console.error('Failed to load audio file:', error);
      URL.revokeObjectURL(url);
    }
  }

  updatePlayerStartTime(trackId: string, newStartTime: number) {
    const player = this.players.get(trackId);
    if (player) {
      player.unsync();
      player.sync().start(newStartTime);
      this.store.updateAudioStartTime(trackId, newStartTime);
    }
  }

  removeTrack(trackId: string) {
    const player = this.players.get(trackId);
    if (player) {
      player.dispose();
      this.players.delete(trackId);
      this.store.removeAudioTrack(trackId);
    }
  }

  removeLane(laneIndex: number) {
    this.store
      .audioTracks()
      .filter((t) => t.laneIndex === laneIndex)
      .forEach((t) => {
        const player = this.players.get(t.id);
        if (player) {
          player.dispose();
          this.players.delete(t.id);
        }
      });
    this.store.removeAudioLane(laneIndex);
  }
}
