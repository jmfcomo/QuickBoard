import { Component, ElementRef, ViewChild, computed, inject, input, signal } from '@angular/core';
import { AppStore, AudioTrack } from '../../../data/store/app.store';
import { AudioService } from '../../../services/audio.service';
import { UndoRedoService } from '../../../services/undo-redo.service';

@Component({
  selector: 'app-audio-tracks',
  imports: [],
  templateUrl: './audio-tracks.html',
  styleUrl: './audio-tracks.css',
  host: {
    '(document:mousemove)': 'onMouseMove($event)',
    '(document:mouseup)': 'onMouseUp()',
  },
})
export class AudioTracksComponent {
  readonly store = inject(AppStore);
  readonly audio = inject(AudioService);
  private readonly undoRedo = inject(UndoRedoService);

  scale = input.required<number>();

  @ViewChild('audioFileInput') audioFileInputRef!: ElementRef<HTMLInputElement>;

  readonly MIN_DURATION = 0.5;
  readonly MAX_AUDIO_LANES = 4;
  readonly ADD_AUDIO_BUTTON_WIDTH = 72;
  readonly ADD_AUDIO_BUTTON_GAP_PX = 20;
  readonly VOLUME_LINE_PADDING_PX = 4;
  readonly MIN_ADD_AUDIO_LEFT_PX = 8;

  // Audio clip drag state
  audioDragTrackId = signal<string | null>(null);
  audioDragTargetLane = signal<number | null>(null);
  private _audioDragging = false;
  private _audioDragTrackId: string | null = null;
  private _audioDragStartX = 0;
  private _audioDragOriginalStartTime = 0;
  private _audioDragOriginalLane = 0;
  private _pendingAudioLane = 0;
  private _pendingAudioStartTime = 0;

  // Audio clip trim state
  audioTrimTrackId = signal<string | null>(null);
  private _audioTrimming = false;
  private _audioTrimTrackId: string | null = null;
  private _audioTrimEdge: 'left' | 'right' | null = null;
  private _audioTrimStartX = 0;
  private _audioTrimOriginalStartTime = 0;
  private _audioTrimOriginalDuration = 0;
  private _audioTrimOriginalTrimStart = 0;
  private _audioTrimFileDuration = 0;

  hoveredClipId = signal<string | null>(null);

  // Clip volume drag state
  volumeDragTrackId = signal<string | null>(null);
  private _volumeDragging = false;
  private _volumeTrackId: string | null = null;
  private _volumeDragRect: DOMRect | null = null;
  private _volumeOriginalTrackVolume = 1;
  private _volumeOriginalLaneVolume = 1;

  projectWidthPx = computed(() => this.store.totalDuration() * this.scale());

  canAddLane = computed(() => this.store.audioLaneCount() < this.MAX_AUDIO_LANES);

  audioLanes = computed(() => {
    const tracks = this.store.audioTracks();
    const s = this.scale();
    const waveforms = this.audio.waveforms();
    const clipH = 36;
    const projW = this.store.totalDuration() * s;
    return Array.from({ length: this.store.audioLaneCount() }, (_, i) => ({
      laneIndex: i,
      clips: tracks
        .filter((t) => t.laneIndex === i)
        .map((t) => {
          const w = Math.max(t.duration * s, 40);
          const leftPx = t.startTime * s;
          const visibleRight = Math.min(leftPx + w, projW);
          const deleteLeftPx = Math.max(leftPx + 4, visibleRight - 20);
          return {
            ...t,
            volume: typeof t.volume === 'number' ? t.volume : 1,
            leftPx,
            widthPx: w,
            deleteLeftPx,
            waveformPath: this.buildWaveformPath(
              waveforms[t.id] ?? [],
              w,
              clipH,
              t.trimStart,
              t.duration,
              t.fileDuration,
            ),
          };
        })
        .sort((a, b) => a.startTime - b.startTime),
      addButtonLeftPx: this.computeLaneAddButtonLeftPx(i, tracks, s, projW),
    }));
  });

  onMouseMove(event: MouseEvent) {
    if (this._volumeDragging) {
      event.preventDefault();
      this.handleVolumeDragMove(event);
    } else if (this._audioTrimming) {
      event.preventDefault();
      this.handleAudioTrimMove(event);
    } else if (this._audioDragging) {
      event.preventDefault();
      this.handleAudioClipDragMove(event);
    }
  }

  async onMouseUp(): Promise<void> {
    if (this._audioDragging) {
      const targetLane = this.audioDragTargetLane();
      const trackId = this._audioDragTrackId;
      const originalLane = this._audioDragOriginalLane;
      const originalStartTime = this._audioDragOriginalStartTime;

      if (trackId !== null && targetLane !== null && targetLane !== originalLane) {
        this.audio.updateLane(trackId, targetLane);
      }

      // Record the committed move as an undoable command
      if (trackId !== null) {
        const finalTrack = this.store.audioTracks().find((t) => t.id === trackId);
        const finalStartTime = finalTrack?.startTime ?? originalStartTime;
        const finalLane = finalTrack?.laneIndex ?? originalLane;

        const hasStartTimeChange = finalStartTime !== originalStartTime;
        const hasLaneChange = finalLane !== originalLane;

        if (hasStartTimeChange || hasLaneChange) {
          const capturedTrackId = trackId;
          this.undoRedo.record({
            undo: () => {
              this.audio.updatePlayerStartTime(capturedTrackId, originalStartTime);
              if (hasLaneChange) this.audio.updateLane(capturedTrackId, originalLane);
            },
            redo: () => {
              this.audio.updatePlayerStartTime(capturedTrackId, finalStartTime);
              if (hasLaneChange) this.audio.updateLane(capturedTrackId, finalLane);
            },
          });
        }
      }

      this._audioDragging = false;
      this._audioDragTrackId = null;
      this._audioDragOriginalLane = 0;
      this.audioDragTrackId.set(null);
      this.audioDragTargetLane.set(null);
    }

    if (this._volumeDragging) {
      const trackId = this._volumeTrackId;
      if (trackId) {
        const track = this.store.audioTracks().find((t) => t.id === trackId);
        if (track) {
          const laneVolume = this.store.audioLaneMixers()[track.laneIndex]?.volume ?? 1;
          const finalTrackVolume = track.volume;
          const initialTrackVolume = this._volumeOriginalTrackVolume;
          const initialLaneVolume = this._volumeOriginalLaneVolume;

          if (Math.abs(finalTrackVolume - initialTrackVolume) > 0.0001) {
            this.undoRedo.record({
              undo: () => {
                this.audio.setTrackVolume(trackId, initialTrackVolume);
                this.store.setAudioLaneVolume(track.laneIndex, initialLaneVolume);
              },
              redo: () => {
                this.audio.setTrackVolume(trackId, finalTrackVolume);
                this.store.setAudioLaneVolume(track.laneIndex, laneVolume);
              },
            });
          }
        }
      }

      this._volumeDragging = false;
      this._volumeTrackId = null;
      this._volumeDragRect = null;
      this.volumeDragTrackId.set(null);
    }

    if (this._audioTrimming) {
      const trackId = this._audioTrimTrackId;
      if (trackId !== null) {
        const finalTrack = this.store.audioTracks().find((t) => t.id === trackId);
        if (finalTrack) {
          const origStart = this._audioTrimOriginalStartTime;
          const origDuration = this._audioTrimOriginalDuration;
          const origTrimStart = this._audioTrimOriginalTrimStart;
          const finalStart = finalTrack.startTime;
          const finalDuration = finalTrack.duration;
          const finalTrimStart = finalTrack.trimStart;

          if (
            origStart !== finalStart ||
            origDuration !== finalDuration ||
            origTrimStart !== finalTrimStart
          ) {
            const capturedId = trackId;
            this.undoRedo.record({
              undo: () => this.audio.updateTrim(capturedId, origStart, origDuration, origTrimStart),
              redo: () =>
                this.audio.updateTrim(capturedId, finalStart, finalDuration, finalTrimStart),
            });
          }
        }
      }

      this._audioTrimming = false;
      this._audioTrimTrackId = null;
      this._audioTrimEdge = null;
      this.audioTrimTrackId.set(null);
    }
  }

  private snap(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private buildWaveformPath(
    peaks: number[],
    width: number,
    height: number,
    trimStart: number,
    duration: number,
    fileDuration: number,
  ): string {
    if (!peaks.length) return '';

    const safeFileDuration = Math.max(0.001, fileDuration || 0);
    const startRatio = Math.max(0, Math.min(1, trimStart / safeFileDuration));
    const endRatio = Math.max(0, Math.min(1, (trimStart + duration) / safeFileDuration));
    const startIdx = Math.floor(startRatio * peaks.length);
    const endIdx = Math.max(startIdx + 1, Math.ceil(endRatio * peaks.length));
    const visiblePeaks = peaks.slice(startIdx, endIdx);
    if (!visiblePeaks.length) return '';

    const mid = height / 2;
    const step = width / visiblePeaks.length;
    let d = `M 0 ${mid}`;
    for (let i = 0; i < visiblePeaks.length; i++) {
      const x = i * step;
      const amp = visiblePeaks[i] * mid * 0.85;
      d += ` L ${x.toFixed(1)} ${(mid - amp).toFixed(1)}`;
    }
    for (let i = visiblePeaks.length - 1; i >= 0; i--) {
      const x = i * step;
      const amp = visiblePeaks[i] * mid * 0.85;
      d += ` L ${x.toFixed(1)} ${(mid + amp).toFixed(1)}`;
    }
    return d + ' Z';
  }

  openAudioFile(laneIndex: number, startTime = 0) {
    this._pendingAudioLane = laneIndex;
    this._pendingAudioStartTime = startTime;
    this.audioFileInputRef.nativeElement.value = '';
    this.audioFileInputRef.nativeElement.click();
  }

  async handleFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // importAudioFile now resolves once the track is fully loaded and in the store
    const trackId = await this.audio.importAudioFile(
      file,
      this._pendingAudioStartTime,
      this._pendingAudioLane,
    );

    this.fitTrackToLaneSpace(trackId, this._pendingAudioLane, this._pendingAudioStartTime);

    this.recordAudioTrackAdd(trackId);
  }

  onLaneMouseMove(event: MouseEvent, laneIndex: number) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const cursorX = event.clientX - rect.left;

    const s = this.scale();
    const projW = this.projectWidthPx();
    const tracks = this.store.audioTracks().filter((t) => t.laneIndex === laneIndex);
    const hoveredTrack = tracks.find((t) => {
      const left = t.startTime * s;
      const right = Math.min(left + Math.max(t.duration * s, 40), projW);
      return cursorX >= left && cursorX <= right;
    });
    this.hoveredClipId.set(hoveredTrack?.id ?? null);
  }

  onLaneMouseLeave() {
    this.hoveredClipId.set(null);
  }

  addAudioAtLaneEnd(laneIndex: number) {
    const startTime = this.getLaneInsertTime(laneIndex);
    this.openAudioFile(laneIndex, startTime);
  }

  onLaneDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
  }

  async onLaneDrop(event: DragEvent, laneIndex: number) {
    event.preventDefault();

    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
      file.type.startsWith('audio/'),
    );
    if (files.length === 0) return;

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    let cursorSec = Math.max(0, this.snap((event.clientX - rect.left) / this.scale()));

    const addedTrackIds: string[] = [];
    for (const file of files) {
      const startTime = cursorSec;
      const trackId = await this.audio.importAudioFile(file, startTime, laneIndex);
      this.fitTrackToLaneSpace(trackId, laneIndex, startTime);
      addedTrackIds.push(trackId);

      const inserted = this.store.audioTracks().find((t) => t.id === trackId);
      if (!inserted) continue;
      cursorSec = this.snap(inserted.startTime + inserted.duration);
    }

    if (addedTrackIds.length === 1) {
      this.recordAudioTrackAdd(addedTrackIds[0]);
      return;
    }

    if (addedTrackIds.length > 1) {
      const snapshots = addedTrackIds
        .map((trackId) => {
          const trackSnapshot = this.store.audioTracks().find((t) => t.id === trackId);
          const bufferEntry = this.audio.getFileBuffers().get(trackId);
          if (!trackSnapshot || !bufferEntry) return null;
          return {
            trackSnapshot,
            buffer: bufferEntry.buffer,
            fileName: bufferEntry.fileName,
          };
        })
        .filter((entry): entry is { trackSnapshot: AudioTrack; buffer: ArrayBuffer; fileName: string } => !!entry);

      if (snapshots.length > 0) {
        this.undoRedo.record({
          undo: () => {
            snapshots.forEach((entry) => this.audio.removeTrack(entry.trackSnapshot.id));
          },
          redo: () => {
            snapshots.forEach((entry) => {
              void this.audio.restoreAudioTrack(entry.trackSnapshot, entry.buffer, entry.fileName);
            });
          },
        });
      }
    }
  }

  onLaneTrackClick(event: MouseEvent, laneIndex: number) {
    if ((event.target as Element).closest('.audio-clip, button')) return;
    const track = event.currentTarget as HTMLElement;
    const rect = track.getBoundingClientRect();
    const startTime = Math.max(0, this.snap((event.clientX - rect.left) / this.scale()));
    this.openAudioFile(laneIndex, startTime);
  }

  removeAudioTrack(trackId: string) {
    const trackSnapshot = this.store.audioTracks().find((t) => t.id === trackId);
    const bufferEntry = this.audio.getFileBuffers().get(trackId);
    this.audio.removeTrack(trackId);

    if (trackSnapshot && bufferEntry) {
      const { buffer, fileName } = bufferEntry;
      this.undoRedo.record({
        undo: async () => this.audio.restoreAudioTrack(trackSnapshot, buffer, fileName),
        redo: () => this.audio.removeTrack(trackSnapshot.id),
      });
    }
  }

  addAudioLane() {
    this.store.addAudioLane();
  }

  removeAudioLane(laneIndex: number) {
    this.audio.removeLane(laneIndex);
  }

  startAudioClipDrag(event: MouseEvent, trackId: string, currentStartTime: number) {
    event.preventDefault();
    event.stopPropagation();
    const track = this.store.audioTracks().find((t) => t.id === trackId);
    this._audioDragging = true;
    this._audioDragTrackId = trackId;
    this._audioDragStartX = event.clientX;
    this._audioDragOriginalStartTime = currentStartTime;
    this._audioDragOriginalLane = track?.laneIndex ?? 0;
    this.audioDragTrackId.set(trackId);
    this.audioDragTargetLane.set(track?.laneIndex ?? 0);
    this.hoveredClipId.set(null);
  }

  startAudioTrim(event: MouseEvent, trackId: string, edge: 'left' | 'right') {
    event.preventDefault();
    event.stopPropagation();
    const track = this.store.audioTracks().find((t) => t.id === trackId);
    if (!track) return;
    this._audioTrimming = true;
    this._audioTrimTrackId = trackId;
    this._audioTrimEdge = edge;
    this._audioTrimStartX = event.clientX;
    this._audioTrimOriginalStartTime = track.startTime;
    this._audioTrimOriginalDuration = track.duration;
    this._audioTrimOriginalTrimStart = track.trimStart;
    this._audioTrimFileDuration = track.fileDuration;
    this.audioTrimTrackId.set(trackId);
  }

  private handleAudioTrimMove(event: MouseEvent) {
    if (!this._audioTrimTrackId) return;
    const deltaX = event.clientX - this._audioTrimStartX;
    const deltaSec = this.snap(deltaX / this.scale());
    const MIN = this.MIN_DURATION;

    if (this._audioTrimEdge === 'right') {
      const newDuration = this.snap(
        Math.max(
          MIN,
          Math.min(
            this._audioTrimOriginalDuration + deltaSec,
            this._audioTrimFileDuration - this._audioTrimOriginalTrimStart,
          ),
        ),
      );
      this.audio.updateTrim(
        this._audioTrimTrackId,
        this._audioTrimOriginalStartTime,
        newDuration,
        this._audioTrimOriginalTrimStart,
      );
    } else {
      const newTrimStart = this.snap(
        Math.max(
          0,
          Math.min(this._audioTrimOriginalTrimStart + deltaSec, this._audioTrimFileDuration - MIN),
        ),
      );
      const trimDelta = newTrimStart - this._audioTrimOriginalTrimStart;
      const newStartTime = this.snap(Math.max(0, this._audioTrimOriginalStartTime + trimDelta));
      const actualTrimDelta = newStartTime - this._audioTrimOriginalStartTime;
      const newDuration = this.snap(
        Math.max(MIN, this._audioTrimOriginalDuration - actualTrimDelta),
      );
      const finalTrimStart = this.snap(this._audioTrimOriginalTrimStart + actualTrimDelta);
      this.audio.updateTrim(this._audioTrimTrackId, newStartTime, newDuration, finalTrimStart);
    }
  }

  private handleAudioClipDragMove(event: MouseEvent) {
    if (!this._audioDragTrackId) return;
    const deltaX = event.clientX - this._audioDragStartX;
    const deltaSec = this.snap(deltaX / this.scale());
    const newStartTime = Math.max(0, this.snap(this._audioDragOriginalStartTime + deltaSec));
    this.audio.updatePlayerStartTime(this._audioDragTrackId, newStartTime);

    const el = document.elementFromPoint(event.clientX, event.clientY);
    const laneEl = el?.closest('[data-lane-index]');
    if (laneEl) {
      const idx = parseInt(laneEl.getAttribute('data-lane-index') ?? '', 10);
      if (!isNaN(idx)) {
        this.audioDragTargetLane.set(idx);
      }
    }
  }

  startVolumeDrag(event: MouseEvent, trackId: string) {
    event.preventDefault();
    event.stopPropagation();

    const clipElement = (event.currentTarget as HTMLElement).closest('.audio-clip');
    if (!clipElement) return;

    this._volumeDragging = true;
    this._volumeTrackId = trackId;
    this._volumeDragRect = clipElement.getBoundingClientRect();
    const track = this.store.audioTracks().find((t) => t.id === trackId);
    this._volumeOriginalTrackVolume = track?.volume ?? 1;
    this._volumeOriginalLaneVolume =
      track ? (this.store.audioLaneMixers()[track.laneIndex]?.volume ?? 1) : 1;
    this.volumeDragTrackId.set(trackId);
    this.handleVolumeDragMove(event);
  }

  private handleVolumeDragMove(event: MouseEvent) {
    if (!this._volumeDragging || !this._volumeTrackId || !this._volumeDragRect) return;
    const y = event.clientY - this._volumeDragRect.top;
    const paddedHeight = Math.max(1, this._volumeDragRect.height - this.VOLUME_LINE_PADDING_PX * 2);
    const clampedY = Math.max(this.VOLUME_LINE_PADDING_PX, Math.min(y, this._volumeDragRect.height - this.VOLUME_LINE_PADDING_PX));
    const ratio = 1 - (clampedY - this.VOLUME_LINE_PADDING_PX) / paddedHeight;
    const volume = Math.max(0, Math.min(1, ratio));
    this.audio.setTrackVolume(this._volumeTrackId, volume);
  }

  getVolumeLineTopPercent(volume: number): number {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    const topPadPercent = 10;
    const bottomPadPercent = 10;
    const usablePercent = 100 - topPadPercent - bottomPadPercent;
    return topPadPercent + (1 - clampedVolume) * usablePercent;
  }

  getVolumeTooltip(volume: number): string {
    return `${Math.round(Math.max(0, Math.min(1, volume)) * 100)}%`;
  }

  private getLaneInsertTime(laneIndex: number): number {
    const laneTracks = this.store
      .audioTracks()
      .filter((t) => t.laneIndex === laneIndex)
      .sort((a, b) => a.startTime - b.startTime);

    if (laneTracks.length === 0) return 0;

    const laneEnd = Math.max(...laneTracks.map((t) => t.startTime + t.duration));
    return this.snap(Math.min(laneEnd, this.store.totalDuration()));
  }

  private computeLaneAddButtonLeftPx(
    laneIndex: number,
    tracks: AudioTrack[],
    scale: number,
    projectWidth: number,
  ): number | null {
    const maxLeft = Math.max(0, projectWidth - this.ADD_AUDIO_BUTTON_WIDTH);
    if (maxLeft < this.MIN_ADD_AUDIO_LEFT_PX) {
      return null;
    }

    const laneTracks = tracks
      .filter((t) => t.laneIndex === laneIndex)
      .map((t) => {
        const left = Math.max(0, t.startTime * scale);
        const right = Math.min(projectWidth, left + Math.max(t.duration * scale, 40));
        return { left, right };
      })
      .filter((clip) => clip.right > this.MIN_ADD_AUDIO_LEFT_PX && clip.left < projectWidth)
      .sort((a, b) => a.left - b.left);

    if (laneTracks.length === 0) {
      return this.MIN_ADD_AUDIO_LEFT_PX;
    }

    const lastClip = laneTracks[laneTracks.length - 1];
    const rightSideCandidate = lastClip.right + this.ADD_AUDIO_BUTTON_GAP_PX;
    if (rightSideCandidate <= maxLeft) {
      return rightSideCandidate;
    }

    for (let i = laneTracks.length - 1; i >= 0; i--) {
      const current = laneTracks[i];
      const prevRight = i > 0 ? laneTracks[i - 1].right : this.MIN_ADD_AUDIO_LEFT_PX;
      const slotStart = prevRight + (i > 0 ? this.ADD_AUDIO_BUTTON_GAP_PX : 0);
      const slotEnd = current.left - this.ADD_AUDIO_BUTTON_GAP_PX;
      const candidate = slotEnd - this.ADD_AUDIO_BUTTON_WIDTH;

      if (candidate >= slotStart && candidate >= this.MIN_ADD_AUDIO_LEFT_PX) {
        return Math.min(maxLeft, candidate);
      }
    }

    return null;
  }

  private fitTrackToLaneSpace(trackId: string, laneIndex: number, requestedStart: number) {
    const track = this.store.audioTracks().find((t) => t.id === trackId);
    if (!track) return;

    const totalDuration = this.store.totalDuration();
    const laneTracks = this.store
      .audioTracks()
      .filter((t) => t.laneIndex === laneIndex && t.id !== trackId)
      .sort((a, b) => a.startTime - b.startTime);

    const startTime = Math.max(0, this.snap(Math.min(requestedStart, totalDuration)));
    const nextTrack = laneTracks.find((t) => t.startTime > startTime);
    const endCap = Math.min(totalDuration, nextTrack?.startTime ?? totalDuration);
    const maxDuration = Math.max(0.1, this.snap(endCap - startTime));
    const fittedDuration = Math.min(track.fileDuration, track.duration, maxDuration);

    this.audio.updateTrim(trackId, startTime, fittedDuration, track.trimStart);
  }

  private recordAudioTrackAdd(trackId: string) {
    const trackSnapshot = this.store.audioTracks().find((t) => t.id === trackId);
    const bufferEntry = this.audio.getFileBuffers().get(trackId);
    if (!trackSnapshot || !bufferEntry) return;

    const { buffer, fileName } = bufferEntry;
    this.undoRedo.record({
      undo: () => this.audio.removeTrack(trackId),
      redo: () => {
        void this.audio.restoreAudioTrack(trackSnapshot, buffer, fileName);
      },
    });
  }
}
