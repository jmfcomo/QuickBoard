import { Injectable, inject, signal } from '@angular/core';
import { AppStore, AudioTrack } from '../data/store/app.store';
import * as Tone from 'tone';

const DEFAULT_VOLUME = 1;
const DEFAULT_MUTED = false;

@Injectable({ providedIn: 'root' })
export class AudioService {
  readonly store = inject(AppStore);
  private players = new Map<string, Tone.Player>();
  private _fileBuffers = new Map<string, { buffer: ArrayBuffer; fileName: string }>();

  readonly waveforms = signal<Record<string, number[]>>({});

  private buildWaveform(buffer: Tone.ToneAudioBuffer, samples = 300): number[] {
    const raw = buffer.toArray(0) as Float32Array;
    const blockSize = Math.max(1, Math.floor(raw.length / samples));
    const peaks: number[] = [];
    for (let i = 0; i < samples; i++) {
      let peak = 0;
      for (let j = 0; j < blockSize; j++) {
        const v = Math.abs(raw[i * blockSize + j] ?? 0);
        if (v > peak) peak = v;
      }
      peaks.push(peak);
    }
    return peaks;
  }

  async importAudioFile(file: File, startTime = 0, laneIndex = 0): Promise<string> {
    const url = URL.createObjectURL(file);
    const id = crypto.randomUUID();

    const arrayBuffer = await file.arrayBuffer();

    return new Promise<string>((resolve, reject) => {
      try {
        const player = new Tone.Player({
          url: url,
          onload: () => {
            const duration = player.buffer.duration;
            const mixer = this.store.audioLaneMixers()[laneIndex];
            const initialVolume = mixer?.volume ?? DEFAULT_VOLUME;
            player.volume.value = Tone.gainToDb(Math.max(0, initialVolume));
            player.mute = mixer?.muted ?? DEFAULT_MUTED;

            player.toDestination();
            player.sync().start(startTime, 0, duration);
            this.players.set(id, player);
            this._fileBuffers.set(id, { buffer: arrayBuffer, fileName: file.name });

            this.waveforms.update((w) => ({ ...w, [id]: this.buildWaveform(player.buffer) }));

            const newTrack: AudioTrack = {
              id,
              name: file.name,
              url,
              startTime,
              duration,
              trimStart: 0,
              fileDuration: duration,
              laneIndex,
              volume: initialVolume,
            };

            this.store.addAudioTrack(newTrack);
            resolve(id);
          },
        });
      } catch (error) {
        console.error('Failed to load audio file:', error);
        URL.revokeObjectURL(url);
        reject(error);
      }
    });
  }

  updatePlayerStartTime(trackId: string, newStartTime: number) {
    const player = this.players.get(trackId);
    if (player) {
      const track = this.store.audioTracks().find((t) => t.id === trackId);
      const trimStart = track?.trimStart ?? 0;
      const duration = track?.duration;
      player.unsync();
      player.sync().start(newStartTime, trimStart, duration);
      this.store.updateAudioStartTime(trackId, newStartTime);
    }
  }

  updateTrim(trackId: string, startTime: number, duration: number, trimStart: number) {
    const player = this.players.get(trackId);
    if (player) {
      player.unsync();
      player.sync().start(startTime, trimStart, duration);
    }
    this.store.updateAudioTrim(trackId, startTime, duration, trimStart);
  }

  updateLane(trackId: string, laneIndex: number) {
    const player = this.players.get(trackId);
    const mixer = this.store.audioLaneMixers()[laneIndex];
    if (player) {
      player.mute = mixer?.muted ?? DEFAULT_MUTED;
    }
    this.store.updateAudioLane(trackId, laneIndex);
  }

  removeTrack(trackId: string) {
    const player = this.players.get(trackId);
    if (player) {
      player.dispose();
      this.players.delete(trackId);
    }
    // Always remove from store regardless of player state
    this.store.removeAudioTrack(trackId);
    this._fileBuffers.delete(trackId);
    this.waveforms.update((w) => {
      const next = { ...w };
      delete next[trackId];
      return next;
    });
  }

  removeLane(laneIndex: number) {
    const ids = this.store
      .audioTracks()
      .filter((t) => t.laneIndex === laneIndex)
      .map((t) => t.id);
    ids.forEach((id) => {
      const player = this.players.get(id);
      if (player) {
        player.dispose();
        this.players.delete(id);
      }
      this._fileBuffers.delete(id);
    });
    this.waveforms.update((w) => {
      const next = { ...w };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    this.store.removeAudioLane(laneIndex);
  }

  setLaneVolume(laneIndex: number, volume: number) {
    this.store.setAudioLaneVolume(laneIndex, volume);
  }

  setTrackVolume(trackId: string, volume: number) {
    const safeVolume = Math.max(0, Math.min(1, volume));
    const track = this.store.audioTracks().find((t) => t.id === trackId);
    const player = this.players.get(trackId);
    if (player) {
      player.volume.value = Tone.gainToDb(Math.max(0, safeVolume));
    }
    this.store.updateAudioVolume(trackId, safeVolume);
    if (track) {
      this.store.setAudioLaneVolume(track.laneIndex, safeVolume);
    }
  }

  setLaneMuted(laneIndex: number, muted: boolean) {
    const tracks = this.store.audioTracks().filter((t) => t.laneIndex === laneIndex);
    tracks.forEach((t) => {
      const player = this.players.get(t.id);
      if (player) {
        player.mute = muted;
      }
    });
    this.store.setAudioLaneMuted(laneIndex, muted);
  }

  getFileBuffers(): Map<string, { buffer: ArrayBuffer; fileName: string }> {
    return new Map(this._fileBuffers);
  }

  async restoreAudioTrack(track: AudioTrack, buffer: ArrayBuffer, fileName: string): Promise<void> {
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);

    return new Promise<void>((resolve) => {
      const player = new Tone.Player({
        url,
        onload: () => {
          const mixer = this.store.audioLaneMixers()[track.laneIndex];
          const trackVolume =
            typeof track.volume === 'number' ? track.volume : (mixer?.volume ?? DEFAULT_VOLUME);
          player.volume.value = Tone.gainToDb(Math.max(0, trackVolume));
          player.mute = mixer?.muted ?? DEFAULT_MUTED;

          player.toDestination();
          player.sync().start(track.startTime, track.trimStart, track.duration);
          this.players.set(track.id, player);
          this._fileBuffers.set(track.id, { buffer, fileName });

          this.waveforms.update((w) => ({
            ...w,
            [track.id]: this.buildWaveform(player.buffer),
          }));

          this.store.addAudioTrack({ ...track, url, volume: trackVolume });
          resolve();
        },
      });
    });
  }
  async loadFromSavedTracks(tracks: AudioTrack[], files: Map<string, Blob>): Promise<void> {
    this.players.forEach((p) => p.dispose());
    this.players.clear();
    this._fileBuffers.clear();
    this.waveforms.set({});

    await Promise.all(
      tracks.map(
        (track) =>
          new Promise<void>((resolve) => {
            const blob = files.get(track.id);
            if (!blob) {
              console.warn(`Audio file not found in zip for track ${track.id}`);
              resolve();
              return;
            }

            const url = URL.createObjectURL(blob);
            const player = new Tone.Player({
              url,
              onload: () => {
                const mixer = this.store.audioLaneMixers()[track.laneIndex];
                const trackVolume =
                  typeof track.volume === 'number'
                    ? track.volume
                    : (mixer?.volume ?? DEFAULT_VOLUME);
                player.volume.value = Tone.gainToDb(Math.max(0, trackVolume));
                player.mute = mixer?.muted ?? DEFAULT_MUTED;

                player.toDestination();
                player.sync().start(track.startTime, track.trimStart, track.duration);
                this.players.set(track.id, player);

                blob.arrayBuffer().then((buf) => {
                  this._fileBuffers.set(track.id, { buffer: buf, fileName: track.name });
                });

                this.waveforms.update((w) => ({
                  ...w,
                  [track.id]: this.buildWaveform(player.buffer),
                }));

                this.store.updateAudioUrl(track.id, url);
                resolve();
              },
            });
          }),
      ),
    );
  }
}
