import { Component, ElementRef, ViewChild, computed, inject, input, signal } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
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

  // Lane hover state
  hoverLaneIndex = signal<number | null>(null);
  hoverLaneX = signal(0);
  hoveredClipId = signal<string | null>(null);

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
            leftPx,
            widthPx: w,
            deleteLeftPx,
            waveformPath: this.buildWaveformPath(waveforms[t.id] ?? [], w, clipH),
          };
        }),
    }));
  });

  onMouseMove(event: MouseEvent) {
    if (this._audioTrimming) {
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

  private buildWaveformPath(peaks: number[], width: number, height: number): string {
    if (!peaks.length) return '';
    const mid = height / 2;
    const step = width / peaks.length;
    let d = `M 0 ${mid}`;
    for (let i = 0; i < peaks.length; i++) {
      const x = i * step;
      const amp = peaks[i] * mid * 0.85;
      d += ` L ${x.toFixed(1)} ${(mid - amp).toFixed(1)}`;
    }
    for (let i = peaks.length - 1; i >= 0; i--) {
      const x = i * step;
      const amp = peaks[i] * mid * 0.85;
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

    const trackSnapshot = this.store.audioTracks().find((t) => t.id === trackId);
    const bufferEntry = this.audio.getFileBuffers().get(trackId);
    if (trackSnapshot && bufferEntry) {
      const { buffer, fileName } = bufferEntry;
      this.undoRedo.record({
        undo: () => this.audio.removeTrack(trackId),
        redo: async () => this.audio.restoreAudioTrack(trackSnapshot, buffer, fileName),
      });
    }
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

    if ((event.target as Element).closest('.audio-clip, .audio-trim-handle')) {
      this.hoverLaneIndex.set(null);
      return;
    }
    this.hoverLaneIndex.set(laneIndex);
    this.hoverLaneX.set(cursorX);
  }

  onLaneMouseLeave() {
    this.hoverLaneIndex.set(null);
    this.hoveredClipId.set(null);
  }

  addAudioAtHover(laneIndex: number) {
    const startTime = Math.max(0, this.snap(this.hoverLaneX() / this.scale()));
    this.openAudioFile(laneIndex, startTime);
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
}
