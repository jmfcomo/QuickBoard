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
import { createTimelineData } from '../helpers/timeline.editor.graphics';
import { PlaybackService } from '../../../services/playback.service';
import { TimelineZoomService } from '../../../services/timeline-zoom.service';
import { BoardsTrackComponent } from '../boards-track/boards-track';
import { AudioTracksComponent } from '../audio-tracks/audio-tracks';
import { TimelineControlsComponent } from '../timeline-controls/timeline-controls';

@Component({
  selector: 'app-timeline-editor',
  imports: [BoardsTrackComponent, AudioTracksComponent, TimelineControlsComponent],
  templateUrl: './timeline-editor.html',
  styleUrl: './timeline-editor.css',
  host: {
    '(document:mousemove)': 'onMouseMove($event)',
    '(document:mouseup)': 'onMouseUp()',
    '(wheel)': 'onWheel($event)',
  },
})
export class TimelineEditor implements AfterViewInit {
  readonly store = inject(AppStore);
  readonly playback = inject(PlaybackService);
  readonly zoom = inject(TimelineZoomService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('timelineContent') timelineContent!: ElementRef;
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  readonly scale = this.zoom.scale;
  containerWidth = signal(800);
  isScrubbing = signal(false);

  private wasPlaying = false;

  playheadPosition = computed(() => this.store.currentTime() * this.scale());

  private readonly _data = createTimelineData(this.store, this.scale, this.containerWidth);
  totalWidth = this._data.totalWidth;
  rulerTicks = this._data.rulerTicks;

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

  startScrub(event: MouseEvent) {
    event.preventDefault();
    this.wasPlaying = this.store.isPlaying();
    if (this.wasPlaying) {
      this.playback.pause();
    }
    this.isScrubbing.set(true);
    this.seekToMouse(event);
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isScrubbing()) return;
    event.preventDefault();
    this.seekToMouse(event);
  }

  onRulerClick(event: MouseEvent) {
    event.preventDefault();
    this.seekToMouse(event);
  }

  async onMouseUp(): Promise<void> {
    if (!this.isScrubbing()) return;
    this.isScrubbing.set(false);
    if (this.wasPlaying) {
      try {
        await this.playback.play();
      } catch (err) {
        console.error('Failed to resume playback after scrubbing:', err);
      }
    }
  }

  onWheel(event: WheelEvent) {
    if (!event.shiftKey) return;
    event.preventDefault();
    if (event.deltaY < 0) {
      this.zoom.zoomIn();
    } else {
      this.zoom.zoomOut();
    }
  }

  private seekToMouse(event: MouseEvent) {
    if (!this.timelineContent?.nativeElement) return;
    const rect = this.timelineContent.nativeElement.getBoundingClientRect();
    const seconds = Math.max(0, (event.clientX - rect.left) / this.scale());
    this.playback.seek(seconds);
  }

  private scrollToPlayhead(playheadPos: number) {
    const container = this.scrollContainer?.nativeElement;
    if (!container) return;
    const scrollLeft = container.scrollLeft;
    const containerWidth = this.containerWidth();
    const scrollRight = scrollLeft + containerWidth;
    const leftPadding = containerWidth * 0.2;
    const rightPadding = containerWidth * 0.2;
    if (playheadPos < scrollLeft + leftPadding) {
      container.scrollLeft = Math.max(0, playheadPos - leftPadding);
    } else if (playheadPos > scrollRight - rightPadding) {
      container.scrollLeft = playheadPos - containerWidth + rightPadding;
    }
  }
}
