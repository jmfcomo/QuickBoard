import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CanvasComponent } from '../ui/canvas/canvas/canvas.component';
import { ScriptComponent } from '../ui/script/script/script.component';
import { TimelineComponent } from '../ui/timeline/timeline/timeline.component';
import { SbdService } from './app.sbd.service';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-root',
  imports: [CanvasComponent, ScriptComponent, TimelineComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('QuickBoard');
  private readonly sbd = inject(SbdService);
  private removeRequestSaveListener?: () => void;
  private removeLoadDataListener?: () => void;
  private removeThemeListener?: () => void;
  private readonly themeService = inject(ThemeService);

  protected readonly timelineHeight = signal(200);
  protected readonly scriptWidth = signal(250);
  protected isDraggingVertical = false;
  protected isDraggingHorizontal = false;
  private activeDragState: {
    type: 'vertical' | 'horizontal';
    startPos: number;
    startSize: number;
  } | null = null;

  private static readonly MIN_TIMELINE_HEIGHT = 60;
  private static readonly MAX_TIMELINE_HEIGHT = 800;
  private static readonly MIN_SCRIPT_WIDTH = 100;
  private static readonly MAX_SCRIPT_WIDTH = 600;

  onVerticalDragStart(event: MouseEvent): void {
    this.activeDragState = {
      type: 'vertical',
      startPos: event.clientY,
      startSize: this.timelineHeight(),
    };
    this.isDraggingVertical = true;
    event.preventDefault();
  }

  onHorizontalDragStart(event: MouseEvent): void {
    this.activeDragState = {
      type: 'horizontal',
      startPos: event.clientX,
      startSize: this.scriptWidth(),
    };
    this.isDraggingHorizontal = true;
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.activeDragState) return;
    if (this.activeDragState.type === 'vertical') {
      const newHeight = Math.max(
        App.MIN_TIMELINE_HEIGHT,
        Math.min(
          App.MAX_TIMELINE_HEIGHT,
          this.activeDragState.startSize + (this.activeDragState.startPos - event.clientY),
        ),
      );
      this.timelineHeight.set(newHeight);
    } else {
      const newWidth = Math.max(
        App.MIN_SCRIPT_WIDTH,
        Math.min(
          App.MAX_SCRIPT_WIDTH,
          this.activeDragState.startSize + (this.activeDragState.startPos - event.clientX),
        ),
      );
      this.scriptWidth.set(newWidth);
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.activeDragState = null;
    this.isDraggingVertical = false;
    this.isDraggingHorizontal = false;
  }

  ngOnInit() {
    if (window.quickboard?.onRequestSave) {
      this.removeRequestSaveListener = window.quickboard.onRequestSave(async (payload) => {
        try {
          const zipData = await this.sbd.buildSbdZip();
          window.quickboard?.sendSaveBinary({ filePath: payload.filePath, data: zipData });
        } catch (err) {
          console.error('Failed to build .sbd file:', err);
        }
      });
    }

    if (window.quickboard?.onLoadData) {
      this.removeLoadDataListener = window.quickboard.onLoadData(async (payload) => {
        try {
          if (payload.isBinary) {
            await this.sbd.loadSbdZip(payload.content);
          } else {
            // Legacy plain-JSON fallback
            this.sbd.loadLegacyJson(payload.content);
          }
        } catch (err) {
          console.error('Failed to load data from file:', err);
          const message = err instanceof Error ? err.message : String(err);
          window.alert(`Failed to load file: ${message}`);
        }
      });
    }

    this.removeThemeListener = this.themeService.initTheme();
  }

  ngOnDestroy() {
    this.removeRequestSaveListener?.();
    this.removeLoadDataListener?.();
    this.removeThemeListener?.();
  }
}
