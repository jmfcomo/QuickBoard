import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { TimelineActions } from '../helpers/timeline.actions';
import { TimelineDrag } from '../helpers/timeline.drag';
import { createTimelineData } from '../helpers/timeline.editor.graphics';
import { PlaybackService } from '../../../services/playback.service';
import { AudioService } from '../../../services/audio.service';

@Component({
  selector: 'app-timeline-editor',
  imports: [],
  templateUrl: './timeline-editor.html',
  styleUrl: './timeline-editor.css',
  host: {
    '(document:mousemove)': 'handleDrag($event)',
    '(document:mouseup)': 'stopDrag()',
  },
})
export class TimelineEditor implements AfterViewInit {
  readonly store = inject(AppStore);
  readonly actions = inject(TimelineActions);
  readonly drag = inject(TimelineDrag);
  readonly playback = inject(PlaybackService);
  readonly audio = inject(AudioService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('timelineContent') timelineContent!: ElementRef;
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('audioFileInput') audioFileInputRef!: ElementRef<HTMLInputElement>;

  readonly MIN_DURATION = 0.5;
  readonly MAX_AUDIO_LANES = 4;

  scale = signal(40); // pixels per second
  containerWidth = signal(800);
  isScrubbing = signal(false);

  // Resize state
  private isResizing = signal(false);
  resizingBoardId = signal<string | null>(null);
  private resizeEdge = signal<'left' | 'right' | null>(null);
  private resizeStartX = 0;
  private resizeStartDuration = 0;
  private resizeStartPrevDuration = 0;
  private resizePrevBoardId: string | null = null;

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

  // Lane hover state for the floating add button
  hoverLaneIndex = signal<number | null>(null);
  hoverLaneX = signal(0);

  private wasPlaying = false;

  playheadPosition = computed(() => {
    const time = this.store.currentTime();
    return time * this.scale();
  });

  private readonly _shared = createTimelineData(this.store, this.scale, this.containerWidth);
  timelineBoards = this._shared.timelineBoards;
  totalWidth = this._shared.totalWidth;
  addButtonLeftPx = this._shared.addButtonLeftPx;
  rulerTicks = this._shared.rulerTicks;

  projectWidthPx = computed(() => this.store.totalDuration() * this.scale());

  audioLanes = computed(() => {
    const tracks = this.store.audioTracks();
    const s = this.scale();
    const waveforms = this.audio.waveforms();
    const clipH = 36; // lane 48px - 6px top - 6px bottom
    return Array.from({ length: this.store.audioLaneCount() }, (_, i) => ({
      laneIndex: i,
      clips: tracks
        .filter((t) => t.laneIndex === i)
        .map((t) => {
          const w = Math.max(t.duration * s, 40);
          return {
            ...t,
            leftPx: t.startTime * s,
            widthPx: w,
            waveformPath: this.buildWaveformPath(waveforms[t.id] ?? [], w, clipH),
          };
        }),
    }));
  });

  canAddLane = computed(() => this.store.audioLaneCount() < this.MAX_AUDIO_LANES);

  constructor() {
    effect(() => {
      const playheadPos = this.playheadPosition();
      const isPlaying = this.store.isPlaying();

      if ((isPlaying || !this.isScrubbing()) && this.scrollContainer?.nativeElement) {
        this.scrollToPlayhead(playheadPos);
      }
    });
  }

  ngAfterViewInit() {
    const el = this.scrollContainer.nativeElement;
    this.containerWidth.set(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      this.containerWidth.set(entries[0].contentRect.width);
    });
    observer.observe(el);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  addBoard() {
    this.actions.addBoard();
  }

  selectBoard(boardId: string) {
    this.actions.selectBoard(boardId);
  }

  deleteBoard(boardId: string) {
    this.actions.deleteBoard(boardId);
  }

  startScrub(event: MouseEvent) {
    event.preventDefault();

    this.wasPlaying = this.store.isPlaying();
    if (this.wasPlaying) {
      this.playback.pause();
    }

    this.isScrubbing.set(true);

    this.seekToMouse(event);
  }

  handleDrag(event: MouseEvent) {
    if (this.isScrubbing()) {
      event.preventDefault();
      this.seekToMouse(event);
    } else if (this.isResizing()) {
      event.preventDefault();
      this.handleResizeDrag(event);
    } else if (this._audioTrimming) {
      event.preventDefault();
      this.handleAudioTrimMove(event);
    } else if (this._audioDragging) {
      event.preventDefault();
      this.handleAudioClipDragMove(event);
    }
  }

  onRulerClick(event: MouseEvent) {
    event.preventDefault();
    this.seekToMouse(event);
  }

  async stopDrag(): Promise<void> {
    if (this.isScrubbing()) {
      this.isScrubbing.set(false);

      if (this.wasPlaying) {
        try {
          await this.playback.play();
        } catch (err) {
          console.error('Failed to resume playback after scrubbing:', err);
        }
      }
    }

    if (this.isResizing()) {
      this.isResizing.set(false);
      this.resizingBoardId.set(null);
      this.resizeEdge.set(null);
      this.resizePrevBoardId = null;
    }

    if (this._audioDragging) {
      // Commit lane change if the clip was dropped on a different lane
      const targetLane = this.audioDragTargetLane();
      if (
        this._audioDragTrackId !== null &&
        targetLane !== null &&
        targetLane !== this._audioDragOriginalLane
      ) {
        this.audio.updateLane(this._audioDragTrackId, targetLane);
      }
      this._audioDragging = false;
      this._audioDragTrackId = null;
      this._audioDragOriginalLane = 0;
      this.audioDragTrackId.set(null);
      this.audioDragTargetLane.set(null);
    }

    if (this._audioTrimming) {
      this._audioTrimming = false;
      this._audioTrimTrackId = null;
      this._audioTrimEdge = null;
      this.audioTrimTrackId.set(null);
    }
  }

  startResize(event: MouseEvent, boardId: string, edge: 'left' | 'right') {
    event.preventDefault();
    event.stopPropagation();

    this.isResizing.set(true);
    this.resizingBoardId.set(boardId);
    this.resizeEdge.set(edge);
    this.resizeStartX = event.clientX;

    const board = this.store.boards().find((b) => b.id === boardId);
    this.resizeStartDuration = board?.duration ?? 3;

    if (edge === 'left') {
      const boards = this.store.boards();
      const idx = boards.findIndex((b) => b.id === boardId);
      if (idx > 0) {
        this.resizePrevBoardId = boards[idx - 1].id;
        this.resizeStartPrevDuration = boards[idx - 1].duration ?? 3;
      } else {
        this.resizePrevBoardId = null;
        this.resizeStartPrevDuration = 0;
      }
    }
  }

  /** Round to nearest hundredth of a second to avoid floating-point drift. */
  private snap(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private handleResizeDrag(event: MouseEvent) {
    const deltaX = event.clientX - this.resizeStartX;
    const deltaSec = this.snap(deltaX / this.scale());
    const boardId = this.resizingBoardId();
    if (!boardId) return;

    if (this.resizeEdge() === 'right') {
      const newDuration = this.snap(
        Math.max(this.MIN_DURATION, this.resizeStartDuration + deltaSec),
      );
      this.store.updateBoardDuration(boardId, newDuration);
    } else if (this.resizeEdge() === 'left' && this.resizePrevBoardId) {
      let clampedDelta = deltaSec;

      // Clamp so the previous board doesn't go below minimum
      if (this.resizeStartPrevDuration + clampedDelta < this.MIN_DURATION) {
        clampedDelta = this.snap(this.MIN_DURATION - this.resizeStartPrevDuration);
      }
      // Clamp so the current board doesn't go below minimum
      if (this.resizeStartDuration - clampedDelta < this.MIN_DURATION) {
        clampedDelta = this.snap(this.resizeStartDuration - this.MIN_DURATION);
      }

      const prevDuration = this.snap(this.resizeStartPrevDuration + clampedDelta);
      const currDuration = this.snap(this.resizeStartDuration - clampedDelta);
      this.store.updateBoardDuration(this.resizePrevBoardId, prevDuration);
      this.store.updateBoardDuration(boardId, currDuration);
    }
  }

  private seekToMouse(event: MouseEvent) {
    if (!this.timelineContent?.nativeElement) return;

    const rect = this.timelineContent.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const seconds = Math.max(0, x / this.scale());

    this.playback.seek(seconds);
  }

  private scrollToPlayhead(playheadPos: number) {
    const container = this.scrollContainer?.nativeElement;
    if (!container) return;

    const scrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;
    const scrollRight = scrollLeft + containerWidth;

    // Add padding so playhead doesn't sit right at the edge (20% from edges)
    const leftPadding = containerWidth * 0.2;
    const rightPadding = containerWidth * 0.2;

    // Check if playhead is out of view or too close to edges
    if (playheadPos < scrollLeft + leftPadding) {
      // Scroll left to keep playhead visible with padding
      container.scrollLeft = Math.max(0, playheadPos - leftPadding);
    } else if (playheadPos > scrollRight - rightPadding) {
      // Scroll right to keep playhead visible with padding
      container.scrollLeft = playheadPos - containerWidth + rightPadding;
    }
  }

  // ─── Audio track methods ────────────────────────────────────────

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
    await this.audio.importAudioFile(file, this._pendingAudioStartTime, this._pendingAudioLane);
  }

  onLaneMouseMove(event: MouseEvent, laneIndex: number) {
    if ((event.target as Element).closest('.audio-clip, .audio-trim-handle')) {
      this.hoverLaneIndex.set(null);
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.hoverLaneIndex.set(laneIndex);
    this.hoverLaneX.set(event.clientX - rect.left);
  }

  onLaneMouseLeave() {
    this.hoverLaneIndex.set(null);
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
    this.audio.removeTrack(trackId);
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
      // left edge: move startTime and trimStart together, duration shrinks/grows
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

    // Detect target lane from element under cursor
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const laneEl = el?.closest('[data-lane-index]');
    if (laneEl) {
      const idx = parseInt(laneEl.getAttribute('data-lane-index') ?? '', 10);
      if (!isNaN(idx)) {
        this.audioDragTargetLane.set(idx);
      }
    }
  }

  // ─── Board drag / drop ─────────────────────────────────────────

  onDragStart(event: DragEvent, boardId: string, boardIndex: number) {
    this.drag.startDrag(event, boardId, boardIndex);
  }

  onDragOver(event: DragEvent, boardId: string) {
    this.drag.handleDragOver(event, boardId);
  }

  onDragLeave(event: DragEvent) {
    this.drag.handleDragLeave(event);
  }

  onTrackDragOver(event: DragEvent) {
    this.drag.handleTrackDragOver(event);
  }

  onTrackDrop(event: DragEvent) {
    this.drag.handleTrackDrop(event);
  }

  onDrop(event: DragEvent) {
    this.drag.handleDrop(event);
  }

  onDragEnd(event: DragEvent) {
    this.drag.handleDragEnd(event);
  }

  shouldShowSpaceBefore(boardIndex: number): boolean {
    return this.drag.shouldShowSpaceBefore(boardIndex);
  }

  getBoardDragOffset(boardIndex: number): number {
    return this.drag.getBoardDragOffset(boardIndex);
  }
}
