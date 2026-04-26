import { Injectable, inject, signal } from '@angular/core';
import { AppStore } from '../data/store/app.store';
import { CanvasDataService } from './canvas-data.service';
import type { LCInstance } from '../ui/canvas/literally-canvas-interfaces';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { ExportSettings } from '../ui/export-settings/export-resolutions';
import type { AudioTrack } from '../data';
import { appSettings } from 'src/settings-loader';

@Injectable({ providedIn: 'root' })
export class ExportService {
  readonly store = inject(AppStore);
  readonly canvasDataService = inject(CanvasDataService);

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

      const dataUrl = await this.renderSingleBoard(this.canvasDataService.getCanvasData(board.id), board.backgroundColor, scale);
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
        lc.setImageSize(appSettings.board.width, appSettings.board.height);
        if (canvasData) {
          lc.loadSnapshot(canvasData);
        } else {
          lc.repaintLayer('main');
        }
        lc.setColor('background', backgroundColor ?? appSettings.board.defaultBackgroundColor);
        const dataUrl = lc.getImage({ scale }).toDataURL(mimeType, 0.9);
        resolve(dataUrl);
      } catch {
        // Fall back to a blank white frame on error
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(appSettings.board.width * scale);
        canvas.height = Math.round(appSettings.board.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = backgroundColor ?? appSettings.board.defaultBackgroundColor;
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
    abortSignal?: AbortSignal,
    startIndex = 0,
    endIndex?: number,
  ): Promise<void> {
    const allBoards = this.store.boards();
    const end = endIndex ?? allBoards.length - 1;
    const boards = allBoards.slice(startIndex, end + 1);
    const padLength = Math.max(3, String(allBoards.length).length);
    const ext = mimeType === 'image/jpeg' ? '.jpg' : '.png';
    for (let i = 0; i < boards.length; i++) {
      if (abortSignal?.aborted) {
        throw new Error('Export canceled by user.');
      }
      const board = boards[i];
      const frameNum = String(startIndex + i + 1).padStart(padLength, '0');
      const fileName = `${prefix}_${frameNum}${ext}`;
      const dataUrl = await this.renderSingleBoard(
        this.canvasDataService.getCanvasData(board.id),
        board.backgroundColor,
        scale,
        mimeType,
      );
      await onFrame({ name: fileName, dataUrl }, i + 1, boards.length);
    }
  }

  private async loadFFmpeg(): Promise<FFmpeg> {
    if (this.ffmpeg) return this.ffmpeg;

    this.exportMessage.set('Loading video engine...');
    const ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
      this.exportProgress.set(Math.round(progress * 100));
    });

    const isElectron = window.location.protocol === 'app:';
    const coreBaseURL = isElectron ? 'app://localhost/assets/ffmpeg/core' : '/assets/ffmpeg/core';

    const coreURL = await toBlobURL(`${coreBaseURL}/ffmpeg-core.js`, 'application/javascript');
    const wasmURL = await toBlobURL(`${coreBaseURL}/ffmpeg-core.wasm`, 'application/wasm');
    const classWorkerURL = isElectron
      ? 'app://localhost/assets/ffmpeg/worker/worker.js'
      : '/assets/ffmpeg/worker/worker.js';

    await ffmpeg.load({ coreURL, wasmURL, classWorkerURL });

    this.ffmpeg = ffmpeg;
    return ffmpeg;
  }

  async exportVideoWithSettings(
    settings: ExportSettings,
    onFrameProgress?: (current: number, total: number, fileName: string) => void,
    onPhaseMessage?: (message: string) => void,
    onEncodingProgress?: (progress: number) => void,
    abortSignal?: AbortSignal,
  ): Promise<Uint8Array> {
    const allBoards = this.store.boards();
    const audioTracks = this.store.audioTracks();
    const startIndex = settings.startIndex;
    const endIndex = settings.endIndex;
    const boards = allBoards.slice(startIndex, endIndex + 1);

    if (!boards.length) {
      const message =
        'There are no boards to export. Please add at least one board before exporting a video.';
      this.exportMessage.set(message);
      throw new Error(message);
    }

    onPhaseMessage?.('Loading video engine...');
    const ffmpeg = await this.loadFFmpeg();
    if (abortSignal?.aborted) throw new Error('Export canceled by user.');

    onPhaseMessage?.('Rendering frames...');
    let concatText = '';
    const writtenFrames: string[] = [];
    const safePrefix = this.sanitizePrefix(settings.prefix);

    await this.renderBoardsAtScaleStreaming(
      settings.resolution.scale,
      safePrefix,
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
        if (current < total) {
          concatText += `duration ${duration}\n`;
        }
        onFrameProgress?.(current, total, frame.name);
      },
      'image/jpeg',
      abortSignal,
      startIndex,
      endIndex,
    );

    if (abortSignal?.aborted) throw new Error('Export canceled by user.');

    await ffmpeg.writeFile('concat.txt', concatText);

    const ffmpegArgs: string[] = ['-f', 'concat', '-safe', '0', '-i', 'concat.txt'];
    const writtenAudio: string[] = [];

    const timeOffset = allBoards
      .slice(0, startIndex)
      .reduce((sum, b) => sum + (b.duration ?? 3), 0);
    const exportDuration = boards.reduce((sum, b) => sum + (b.duration ?? 3), 0);

    const activeAudioTracks = audioTracks.filter((track) => {
      const absoluteStartTime = track.startTime;
      const trackEndTime = track.duration > 0 ? absoluteStartTime + track.duration : Infinity;
      return trackEndTime > timeOffset && absoluteStartTime < timeOffset + exportDuration;
    });

    if (activeAudioTracks.length > 0) {
      onPhaseMessage?.('Processing audio...');
      let filterStr = '';
      let amixInputs = '';

      for (let i = 0; i < activeAudioTracks.length; i++) {
        const track: AudioTrack = activeAudioTracks[i];

        const response = await fetch(track.url);
        const blob = await response.blob();

        let audioExtension = 'mp3';
        const urlExtMatch = track.url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
        if (urlExtMatch && urlExtMatch[1]) {
          audioExtension = urlExtMatch[1].toLowerCase();
        }

        if (
          (!audioExtension || audioExtension === 'mp3') &&
          blob.type &&
          blob.type.startsWith('audio/')
        ) {
          const mimeSubtype = blob.type.split('/')[1]?.split(';')[0]?.toLowerCase();
          if (mimeSubtype) {
            switch (mimeSubtype) {
              case 'mpeg':
                audioExtension = 'mp3';
                break;
              case 'x-wav':
              case 'wav':
                audioExtension = 'wav';
                break;
              case 'ogg':
                audioExtension = 'ogg';
                break;
              case 'webm':
                audioExtension = 'webm';
                break;
              case 'aac':
                audioExtension = 'aac';
                break;
              default:
                audioExtension = mimeSubtype;
                break;
            }
          }
        }

        const audioFileName = `audio_${i}.${audioExtension}`;
        await ffmpeg.writeFile(audioFileName, await fetchFile(blob));
        writtenAudio.push(audioFileName);

        ffmpegArgs.push('-i', audioFileName);

        const absoluteStartTime = track.startTime;
        let trackTrimStart = Math.max(0, track.trimStart);
        let trackDuration = track.duration;
        let delayMs = 0;

        if (absoluteStartTime >= timeOffset) {
          delayMs = Math.floor((absoluteStartTime - timeOffset) * 1000);
        } else {
          // starts before the exported range
          const overlap = timeOffset - absoluteStartTime;
          trackTrimStart += overlap;
          if (trackDuration > 0) {
            trackDuration = Math.max(0, trackDuration - overlap);
          }
          // delayMs remains 0
        }

        const hasTrimStart = trackTrimStart > 0;
        const hasDuration = trackDuration > 0;

        if (hasTrimStart || hasDuration) {
          let filterChain = `[${i + 1}:a]atrim=`;

          if (hasTrimStart) {
            filterChain += `start=${trackTrimStart}`;
          } else {
            filterChain += 'start=0';
          }

          if (hasDuration) {
            filterChain += `:duration=${trackDuration}`;
          }

          filterChain += `,asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[a${i}];`;
          filterStr += filterChain;
        } else {
          filterStr += `[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}];`;
        }

        amixInputs += `[a${i}]`;
      }

      if (abortSignal?.aborted) throw new Error('Export canceled by user.');

      filterStr += `${amixInputs}amix=inputs=${activeAudioTracks.length}:normalize=0[aout]`;
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
      '-t',
      String(exportDuration),
      'output.mp4',
    );

    onPhaseMessage?.('Encoding video...');

    let foundFirstTime = false;
    const totalDuration = boards.reduce((sum, b) => sum + (b.duration ?? 3), 0);
    const logHandler = ({ message }: { message: string }) => {
      const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (timeMatch && totalDuration > 0) {
        foundFirstTime = true;
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseFloat(timeMatch[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        let p = (currentTime / totalDuration) * 100;
        p = Math.max(0, Math.min(100, Math.round(p)));
        onEncodingProgress?.(p);
      } else if (!foundFirstTime && !message.includes('time=')) {
        onEncodingProgress?.(0);
      }
    };
    ffmpeg.on('log', logHandler);

    const abortHandler = () => {
      ffmpeg.terminate();
      this.ffmpeg = null;
    };
    abortSignal?.addEventListener('abort', abortHandler, { once: true });

    try {
      await ffmpeg.exec(ffmpegArgs);
    } catch (e) {
      if (abortSignal?.aborted) {
        throw new Error('Export canceled by user.');
      }
      throw e;
    } finally {
      ffmpeg.off('log', logHandler);
      abortSignal?.removeEventListener('abort', abortHandler);
    }

    if (abortSignal?.aborted) throw new Error('Export canceled by user.');
    onEncodingProgress?.(100);

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

  private sanitizePrefix(prefix: string): string {
    if (!prefix) {
      return 'frame';
    }
    return prefix.replace(/['"\r\n/\\]/g, '_');
  }

  async exportPDFWithSettings(
    settings: ExportSettings,
    onProgress?: (current: number, total: number, fileName: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<Uint8Array> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [appSettings.board.width * settings.resolution.scale, appSettings.board.height * settings.resolution.scale],
    });

    const allBoards = this.store.boards();
    const [cols, rows] = settings.table.split('x').map((value) => Number(value));
    const boardsPerPage = cols * rows;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const cellWidth = pageWidth / cols;
    const cellHeight = pageHeight / rows;
    const boardAspectRatio = appSettings.board.height / appSettings.board.width;
    const baseImageWidth = cellWidth * 0.9;
    const targetImageWidth = baseImageWidth * 1.5;
    const maxImageWidth = cellWidth * 0.98;
    let imageWidth = Math.min(targetImageWidth, maxImageWidth);
    let imageHeight = imageWidth * boardAspectRatio;
    const maxImageHeight = cellHeight * 0.75;
    if (imageHeight > maxImageHeight) {
      imageHeight = maxImageHeight;
      imageWidth = imageHeight / boardAspectRatio;
    }
    const textFontSize = 24;

    await this.renderBoardsAtScaleStreaming(
      settings.resolution.scale,
      settings.prefix,
      async (frame, current, total) => {
        const boardIndex = current - 1;
        const board = allBoards[settings.startIndex + boardIndex];
        const pageSlot = boardIndex % boardsPerPage;
        const colIndex = pageSlot % cols;
        const rowIndex = Math.floor(pageSlot / cols);
        const cellX = colIndex * cellWidth;
        const cellY = rowIndex * cellHeight;
        const imgX = cellX + (cellWidth - imageWidth) / 2;
        const imgY = cellY + cellHeight * 0.05;
        const captionY = imgY + imageHeight + 50;
        const scriptText = board?.scriptData?.blocks
          ?.map((block) => {
            const text = typeof block?.data?.text === 'string' ? block.data.text : '';
            return text.length > 0 ? `"${text}"` : '';
          })
          .filter((text) => text.length > 0)
          .join(', ') ?? '';

        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.rect(cellX + 2, cellY + 2, cellWidth - 4, cellHeight - 4, 'S');

        doc.addImage(frame.dataUrl, 'PNG', imgX, imgY, imageWidth, imageHeight);
        doc.rect(imgX, imgY, imageWidth, imageHeight, 'S');

        if (scriptText) {
          doc.setFontSize(textFontSize);
          doc.text(scriptText.split(/\r?\n/), cellX + cellWidth / 2, captionY, {
            align: 'center' as const,
            maxWidth: imageWidth,
          });
        }

        if (pageSlot === boardsPerPage - 1 && current < total) {
          doc.addPage();
        }

        onProgress?.(current, total, frame.name);
      },
      'image/png',
      abortSignal,
    );

    const pdfBlob = doc.output('blob');
    const arrayBuffer = await pdfBlob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
}
