import { Injectable, inject } from '@angular/core';
import { AppStore } from '../data/store/app.store';
import type { LCInstance } from '../ui/canvas/literally-canvas-interfaces';

@Injectable({ providedIn: 'root' })
export class ImageExportService {
  readonly store = inject(AppStore);

  collectFramesForElectron(): { name: string; dataUrl: string }[] {
    const boards = this.store.boards();
    const padLength = Math.max(3, String(boards.length).length);
    return boards
      .map((board, index) => {
        if (!board.previewUrl?.startsWith('data:image/')) return null;
        const frameNum = String(index + 1).padStart(padLength, '0');
        return { name: `board_${frameNum}.png`, dataUrl: board.previewUrl };
      })
      .filter((f): f is { name: string; dataUrl: string } => f !== null);
  }

  async renderBoardsAtScale(
    scale: number,
    onProgress?: (current: number, total: number, fileName: string) => void,
  ): Promise<{ name: string; dataUrl: string }[]> {
    const boards = this.store.boards();
    const padLength = Math.max(3, String(boards.length).length);
    const frames: { name: string; dataUrl: string }[] = [];

    for (let index = 0; index < boards.length; index++) {
      const board = boards[index];
      const frameNum = String(index + 1).padStart(padLength, '0');
      const fileName = `board_${frameNum}.png`;

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
        lc.setColor('background', backgroundColor ?? '#ffffff');
        if (canvasData) {
          lc.loadSnapshot(canvasData);
        } else {
          lc.repaintLayer('main');
        }
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

  async exportPngSequence(scale = 1): Promise<void> {
    const boards = this.store.boards();

    if (boards.length === 0) {
      console.warn('No boards available to export.');
      return;
    }

    if (!('showDirectoryPicker' in window)) {
      console.error('Directory selection is not supported in this environment.');
      alert(
        'Your browser does not support folder selection. Please use a Chromium-based browser or the native app.',
      );
      return;
    }

    try {
      const dirHandle = await (
        window as unknown as {
          showDirectoryPicker: (options: { mode: string }) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker({
        mode: 'readwrite',
      });

      const frames = await this.renderBoardsAtScale(scale);

      for (const frame of frames) {
        const response = await fetch(frame.dataUrl);
        const blob = await response.blob();

        const fileHandle = await dirHandle.getFileHandle(frame.name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      }

      console.log('Successfully exported PNG sequence!');
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Export canceled by user.');
      } else {
        console.error('Failed to export PNG sequence:', error);
      }
    }
  }
}
