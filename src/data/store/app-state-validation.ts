import { appSettings } from 'src/settings-loader';
import type { CanvasDataService } from '../../services/canvas-data.service';

export interface ProjectDimensions {
  fps: number;
  width: number;
  height: number;
}

/**
 * Validates and sanitizes FPS value.
 * Returns a valid positive integer or the fallback value.
 */
export function sanitizeFps(fps: number, fallback: number): number {
  return Number.isFinite(fps) && fps > 0 ? Math.max(1, Math.floor(fps)) : fallback;
}

/**
 * Validates and sanitizes width/height values.
 * Returns valid positive integers or the fallback values.
 */
export function sanitizeResolution(
  width: number,
  height: number,
  fallbackWidth: number,
  fallbackHeight: number
): { width: number; height: number } {
  const sanitizedWidth =
    Number.isFinite(width) && width > 0 ? Math.max(1, Math.floor(width)) : fallbackWidth;
  const sanitizedHeight =
    Number.isFinite(height) && height > 0 ? Math.max(1, Math.floor(height)) : fallbackHeight;
  return { width: sanitizedWidth, height: sanitizedHeight };
}

/**
 * Extracts and validates project dimensions from loaded data.
 * Attempts legacy migration from first board's canvasData.imageSize if needed.
 */
export function extractProjectDimensions(
  data: {
    fps?: unknown;
    width?: unknown;
    height?: unknown;
  },
  cleanedBoards: Array<{ id: string }>,
  canvasDataService: CanvasDataService
): ProjectDimensions {
  let fps = typeof data.fps === 'number' ? data.fps : appSettings.board.defaultFps;
  let width = typeof data.width === 'number' ? data.width : appSettings.board.width;
  let height = typeof data.height === 'number' ? data.height : appSettings.board.height;

  // Legacy migration: extract resolution from first board's canvasData.imageSize
  if (typeof data.width !== 'number' && typeof data.height !== 'number') {
    const firstBoard = cleanedBoards[0];
    if (firstBoard) {
      const cached = canvasDataService.getCanvasData(firstBoard.id);
      const snapshot = cached?.['snapshot'] as Record<string, unknown> | undefined;
      const imageSize = snapshot?.['imageSize'] as { width?: number; height?: number } | undefined;
      if (
        imageSize &&
        typeof imageSize.width === 'number' &&
        typeof imageSize.height === 'number'
      ) {
        width = imageSize.width;
        height = imageSize.height;
      }
    }
  }

  // Validate and sanitize all dimensions
  fps = sanitizeFps(fps, appSettings.board.defaultFps);
  const resolution = sanitizeResolution(
    width,
    height,
    appSettings.board.width,
    appSettings.board.height
  );

  return {
    fps,
    width: resolution.width,
    height: resolution.height,
  };
}
