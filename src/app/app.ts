import { Component, ElementRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
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
  private readonly minTimelineHeight = 120;
  private readonly minScriptWidth = 120;
  private readonly editorsGap = 8;
  private readonly defaultToolbarWidth = 52;
  private readonly canvasAspectRatio = 1920 / 1080;
  private readonly sbd = inject(SbdService);
  private readonly el = inject(ElementRef);
  private removeRequestSaveListener?: () => void;
  private removeLoadDataListener?: () => void;
  private removeThemeListener?: () => void;
  private readonly themeService = inject(ThemeService);
  private readonly onWindowResize = () => this.clampEditorsHeightToBounds();

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

    window.addEventListener('resize', this.onWindowResize);
    window.requestAnimationFrame(() => this.clampEditorsHeightToBounds());
  }

  onResizeMouseDown(e: MouseEvent) {
    e.preventDefault();
    const host = this.el.nativeElement as HTMLElement;
    const editors = host.querySelector('.editors') as HTMLElement;
    const app = host.querySelector('.app') as HTMLElement;
    const startY = e.clientY;
    const startHeight = editors.getBoundingClientRect().height;
    let resizeRafId: number | null = null;

    const applyEditorsHeight = (height: number): void => {
      const totalHeight = app.getBoundingClientRect().height;
      if (totalHeight <= 0) return;
      const heightPercent = (height / totalHeight) * 100;
      host.style.setProperty('--editors-height', `${heightPercent}%`);
    };

    const onMove = (ev: MouseEvent) => {
      const bounds = this.getEditorsHeightBounds();
      if (!bounds) {
        return;
      }

      const rawHeight = startHeight + ev.clientY - startY;
      const proposedHeight = Math.min(Math.max(rawHeight, bounds.min), bounds.max);
      applyEditorsHeight(proposedHeight);

      // Mirror app/window scaling behavior by emitting a resize signal.
      if (resizeRafId !== null) {
        cancelAnimationFrame(resizeRafId);
      }
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null;
        window.dispatchEvent(new Event('resize'));
      });
    };

    const onUp = () => {
      if (resizeRafId !== null) {
        cancelAnimationFrame(resizeRafId);
        resizeRafId = null;
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      // Final resize after drag completes for precise fit at the settled height.
      window.dispatchEvent(new Event('resize'));
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  ngOnDestroy() {
    this.removeRequestSaveListener?.();
    this.removeLoadDataListener?.();
    this.removeThemeListener?.();
    window.removeEventListener('resize', this.onWindowResize);
  }

  private clampEditorsHeightToBounds(): void {
    const host = this.el.nativeElement as HTMLElement;
    const editors = host.querySelector('.editors') as HTMLElement | null;
    const app = host.querySelector('.app') as HTMLElement | null;
    if (!editors || !app) {
      return;
    }

    const totalHeight = app.getBoundingClientRect().height;
    if (totalHeight <= 0) {
      return;
    }

    const bounds = this.getEditorsHeightBounds();
    if (!bounds) {
      return;
    }

    const currentHeight = editors.getBoundingClientRect().height;
    const clampedHeight = Math.min(Math.max(currentHeight, bounds.min), bounds.max);
    const heightPercent = (clampedHeight / totalHeight) * 100;
    host.style.setProperty('--editors-height', `${heightPercent}%`);
  }

  private getEditorsHeightBounds(): { min: number; max: number } | null {
    const host = this.el.nativeElement as HTMLElement;
    const app = host.querySelector('.app') as HTMLElement | null;
    const editors = host.querySelector('.editors') as HTMLElement | null;
    const handle = host.querySelector('.resize-handle') as HTMLElement | null;
    const canvasHost = host.querySelector('app-canvas') as HTMLElement | null;
    const scriptHost = host.querySelector('app-script') as HTMLElement | null;

    if (!app || !editors || !canvasHost) {
      return null;
    }

    const totalHeight = app.getBoundingClientRect().height;
    const handleHeight = handle?.getBoundingClientRect().height ?? 5;
    const canvasStage = canvasHost.querySelector('.canvas-stage') as HTMLElement | null;
    const canvasHostHeight = canvasHost.getBoundingClientRect().height;
    const canvasStageHeight = canvasStage?.getBoundingClientRect().height ?? 0;
    const nonStageHeight = Math.max(0, canvasHostHeight - canvasStageHeight);
    const lcRoot = canvasHost.querySelector('.literally') as HTMLElement | null;
    const lcMinHeight = lcRoot
      ? (parseFloat(window.getComputedStyle(lcRoot).minHeight) || 0)
      : 0;
    const minHeight = Math.max(100, Math.ceil(nonStageHeight + lcMinHeight));
    const maxByVertical = totalHeight - this.minTimelineHeight - handleHeight;

    const editorsWidth = editors.getBoundingClientRect().width;
    const scriptMinWidth = scriptHost
      ? (parseFloat(window.getComputedStyle(scriptHost).minWidth) || this.minScriptWidth)
      : this.minScriptWidth;
    const toolsBar = canvasHost.querySelector('.tools-bar') as HTMLElement | null;
    const toolsBarWidth = toolsBar ? toolsBar.getBoundingClientRect().width + 8 : this.defaultToolbarWidth;
    const availableCanvasHostWidth = editorsWidth - scriptMinWidth - this.editorsGap;
    const maxByHorizontal = Math.floor(
      Math.max(0, availableCanvasHostWidth - toolsBarWidth) / this.canvasAspectRatio,
    );

    const maxHeight = Math.floor(Math.min(maxByVertical, maxByHorizontal));
    return {
      min: Math.floor(minHeight),
      max: Math.max(Math.floor(minHeight), maxHeight),
    };
  }
}
