import { Injectable } from '@angular/core';
import { appSettings } from 'src/settings-loader';

@Injectable({ providedIn: 'root' })
export class WindowScalingService {
  private readonly minTimelineHeight = 120;
  private readonly minScriptWidth = 120;
  private readonly editorsGap = 8;
  private readonly defaultToolbarWidth = 52;
  private readonly canvasAspectRatio = appSettings.board.width / appSettings.board.height;

  init(host: HTMLElement): () => void {
    const onWindowResize = () => this.clampEditorsHeightToBounds(host);

    window.addEventListener('resize', onWindowResize);
    window.requestAnimationFrame(() => {
      this.clampEditorsHeightToBounds(host);
      this.applyLaunchScaleWorkaround(host);
    });

    return () => {
      window.removeEventListener('resize', onWindowResize);
    };
  }

  onResizeMouseDown(event: MouseEvent, host: HTMLElement): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const editors = host.querySelector('.editors') as HTMLElement | null;
    const app = host.querySelector('.app') as HTMLElement | null;
    const bounds = this.getEditorsHeightBounds(host);
    if (!editors || !app || !bounds) {
      return;
    }

    const startY = event.clientY;
    const startHeight = editors.getBoundingClientRect().height;
    const totalHeight = app.getBoundingClientRect().height;
    if (totalHeight <= 0) {
      return;
    }

    let resizeRafId: number | null = null;

    const applyEditorsHeight = (height: number): void => {
      const clampedHeight = Math.min(Math.max(height, bounds.min), bounds.max);
      const heightPercent = (clampedHeight / totalHeight) * 100;
      host.style.setProperty('--editors-height', `${heightPercent}%`);
    };

    const onMove = (moveEvent: MouseEvent) => {
      const rawHeight = startHeight + moveEvent.clientY - startY;
      applyEditorsHeight(rawHeight);

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
      window.dispatchEvent(new Event('resize'));
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  private applyLaunchScaleWorkaround(host: HTMLElement): void {
    const app = host.querySelector('.app') as HTMLElement | null;
    if (!app) {
      return;
    }

    const previousZoom = app.style.zoom;
    app.style.zoom = '101%';

    window.requestAnimationFrame(() => {
      app.style.zoom = previousZoom || '100%';
      window.dispatchEvent(new Event('resize'));
    });
  }

  private clampEditorsHeightToBounds(host: HTMLElement): void {
    const editors = host.querySelector('.editors') as HTMLElement | null;
    const app = host.querySelector('.app') as HTMLElement | null;
    if (!editors || !app) {
      return;
    }

    if (app.classList.contains('canvas-fullscreen')) {
      return;
    }

    const totalHeight = app.getBoundingClientRect().height;
    if (totalHeight <= 0) {
      return;
    }

    const bounds = this.getEditorsHeightBounds(host);
    if (!bounds) {
      return;
    }

    const currentHeight = editors.getBoundingClientRect().height;
    const clampedHeight = Math.min(Math.max(currentHeight, bounds.min), bounds.max);
    const heightPercent = (clampedHeight / totalHeight) * 100;
    host.style.setProperty('--editors-height', `${heightPercent}%`);
  }

  private getEditorsHeightBounds(host: HTMLElement): { min: number; max: number } | null {
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
    const toolsBarWidth = toolsBar
      ? toolsBar.getBoundingClientRect().width + 8
      : this.defaultToolbarWidth;
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
