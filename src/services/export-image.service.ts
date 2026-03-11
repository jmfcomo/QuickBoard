import { Injectable, inject } from '@angular/core';
import { AppStore } from '../data/store/app.store';
import type { LCInstance } from '../ui/canvas/literally-canvas-interfaces';

@Injectable({ providedIn: 'root' })
export class ImageExportService {
  readonly store = inject(AppStore);

  async renderBoardsAtScale(
    scale: number,
    prefix: string,
    onProgress?: (current: number, total: number, fileName: string) => void,
  ): Promise<{ name: string; dataUrl: string }[]> {
    const boards = this.store.boards();
    const padLength = Math.max(3, String(boards.length).length);
    const frames: { name: string; dataUrl: string }[] = [];

    for (let index = 0; index < boards.length; index++) {
      const board = boards[index];
      const frameNum = String(index + 1).padStart(padLength, '0');
      const fileName = `${prefix}_${frameNum}.png`;

      const dataUrl = await this.renderSingleBoard(board.canvasData, board.backgroundColor, scale);
      frames.push({ name: fileName, dataUrl });
      onProgress?.(index + 1, boards.length, fileName);
    }

    return frames;
  }

  private renderSingleBoard(
    canvasData: Record<string, unknown> | null,
    backgroundColor: string,
    scale: number,
  ): Promise<string> {
    return new Promise((resolve) => {
      const container = document.createElement('div');
      container.style.cssText =
        'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
      document.body.appendChild(container);

      let lc: LCInstance | null = null;
      try {
        lc = LC.init(container, { imageURLPrefix: 'assets/lc-images' });
        lc.setImageSize(1920, 1080);
        if (canvasData) {
          lc.loadSnapshot(canvasData);
        } else {
          lc.repaintLayer('main');
        }
        lc.setColor('background', backgroundColor ?? '#ffffff');
        const dataUrl = lc.getImage({ scale }).toDataURL('image/png');
        resolve(dataUrl);
      } catch {
        // Fall back to a blank white frame on error
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(1920 * scale);
        canvas.height = Math.round(1080 * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = backgroundColor ?? '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        resolve(canvas.toDataURL('image/png'));
      } finally {
        try {
          lc?.teardown();
        } catch {
          // ignore teardown errors
        }
        document.body.removeChild(container);
      }
    });
  }

  async renderBoardsAtScaleStreaming(
    scale: number,
    prefix: string,
    onFrame: (
      frame: { name: string; dataUrl: string },
      current: number,
      total: number,
    ) => Promise<void>,
  ): Promise<void> {
    const boards = this.store.boards();
    const padLength = Math.max(3, String(boards.length).length);
    for (let index = 0; index < boards.length; index++) {
      const board = boards[index];
      const frameNum = String(index + 1).padStart(padLength, '0');
      const fileName = `${prefix}_${frameNum}.png`;
      const dataUrl = await this.renderSingleBoard(board.canvasData, board.backgroundColor, scale);
      await onFrame({ name: fileName, dataUrl }, index + 1, boards.length);
    }
  }
}
