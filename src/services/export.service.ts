import { Injectable, inject, signal } from '@angular/core';
import { AppStore } from '../data/store/app.store';
import type { LCInstance } from '../ui/canvas/literally-canvas-interfaces';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { ExportSettings } from '../ui/export-settings/export-resolutions';

@Injectable({ providedIn: 'root' })
export class ExportService {
  readonly store = inject(AppStore);

  readonly isExporting = signal(false);
  readonly exportProgress = signal(0);
  readonly exportMessage = signal('');

  private ffmpeg: FFmpeg | null = null;

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
    mimeType = 'image/png',
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
        const dataUrl = lc.getImage({ scale }).toDataURL(mimeType, 0.9);
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
        resolve(canvas.toDataURL(mimeType, 0.9));
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
    mimeType = 'image/png',
  ): Promise<void> {
    const boards = this.store.boards();
    const padLength = Math.max(3, String(boards.length).length);
    const ext = mimeType === 'image/jpeg' ? '.jpg' : '.png';
    for (let index = 0; index < boards.length; index++) {
      const board = boards[index];
      const frameNum = String(index + 1).padStart(padLength, '0');
      const fileName = `${prefix}_${frameNum}${ext}`;
      const dataUrl = await this.renderSingleBoard(
        board.canvasData,
        board.backgroundColor,
        scale,
        mimeType,
      );
      await onFrame({ name: fileName, dataUrl }, index + 1, boards.length);
    }
  }

  private async loadFFmpeg(): Promise<FFmpeg> {
    if (this.ffmpeg) return this.ffmpeg;

    this.exportMessage.set('Loading video engine...');
    const ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
      this.exportProgress.set(Math.round(progress * 100));
    });

    // When running in Electron the page loads from app://localhost, so we can
    // fetch local assets via that scheme. toBlobURL patches the wasmURL into
    // ffmpeg-core.js so the WASM module can find its companion file.
    const isElectron = window.location.protocol === 'app:';
    const coreBaseURL = isElectron
      ? 'app://localhost/assets/ffmpeg/core'
      : 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

    const coreURL = await toBlobURL(`${coreBaseURL}/ffmpeg-core.js`, 'application/javascript');
    const wasmURL = await toBlobURL(`${coreBaseURL}/ffmpeg-core.wasm`, 'application/wasm');
    const classWorkerURL = isElectron
      ? 'app://localhost/assets/ffmpeg/worker/worker.js'
      : undefined;

    await ffmpeg.load({ coreURL, wasmURL, classWorkerURL });

    this.ffmpeg = ffmpeg;
    return ffmpeg;
  }

  async exportVideoWithSettings(
    settings: ExportSettings,
    onFrameProgress?: (current: number, total: number, fileName: string) => void,
    onPhaseMessage?: (message: string) => void,
  ): Promise<Uint8Array> {
    const boards = this.store.boards();
    const audioTracks = this.store.audioTracks();

    onPhaseMessage?.('Loading video engine...');
    const ffmpeg = await this.loadFFmpeg();

    onPhaseMessage?.('Rendering frames...');
    let concatText = '';
    let lastFileName = '';
    const writtenFrames: string[] = [];

    await this.renderBoardsAtScaleStreaming(
      settings.resolution.scale,
      settings.prefix,
      async (frame, current, total) => {
        // Convert data URL to raw bytes for the FFmpeg virtual FS
        const base64 = frame.dataUrl.slice(frame.dataUrl.indexOf(',') + 1);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        await ffmpeg.writeFile(frame.name, bytes);
        writtenFrames.push(frame.name);

        const duration = boards[current - 1]?.duration ?? 3;
        concatText += `file '${frame.name}'\n`;
        concatText += `duration ${duration}\n`;
        lastFileName = frame.name;

        onFrameProgress?.(current, total, frame.name);
      },
    );

    if (lastFileName) {
      concatText += `file '${lastFileName}'\n`;
    }

    await ffmpeg.writeFile('concat.txt', concatText);

    const ffmpegArgs: string[] = ['-f', 'concat', '-safe', '0', '-i', 'concat.txt'];
    const writtenAudio: string[] = [];

    if (audioTracks.length > 0) {
      onPhaseMessage?.('Processing audio...');
      let filterStr = '';
      let amixInputs = '';

      for (let i = 0; i < audioTracks.length; i++) {
        const track = audioTracks[i];
        const audioFileName = `audio_${i}.mp3`;

        const response = await fetch(track.url);
        const blob = await response.blob();
        await ffmpeg.writeFile(audioFileName, await fetchFile(blob));
        writtenAudio.push(audioFileName);

        ffmpegArgs.push('-i', audioFileName);

        const delayMs = Math.floor(track.startTime * 1000);
        filterStr += `[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}];`;
        amixInputs += `[a${i}]`;
      }

      filterStr += `${amixInputs}amix=inputs=${audioTracks.length}:normalize=0[aout]`;
      ffmpegArgs.push('-filter_complex', filterStr);
      ffmpegArgs.push('-map', '0:v');
      ffmpegArgs.push('-map', '[aout]');
    } else {
      ffmpegArgs.push('-map', '0:v');
    }

    ffmpegArgs.push(
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-shortest',
      'output.mp4',
    );

    onPhaseMessage?.('Encoding video...');
    await ffmpeg.exec(ffmpegArgs);

    onPhaseMessage?.('Saving file...');
    const fileData = await ffmpeg.readFile('output.mp4');
    const result =
      fileData instanceof Uint8Array
        ? fileData
        : new Uint8Array(fileData as unknown as ArrayBuffer);

    for (const f of [...writtenFrames, ...writtenAudio, 'concat.txt', 'output.mp4']) {
      try {
        await ffmpeg.deleteFile(f);
      } catch {
        // ignore
      }
    }

    return result;
  }
}
