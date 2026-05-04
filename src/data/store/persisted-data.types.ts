import type { OutputData } from '@editorjs/editorjs';

/**
 * Current canvas snapshot format stored in persistence.
 * AppStore.exportAsJson() writes the Literally Canvas snapshot object directly.
 */
export type PersistedCanvasSnapshot = Record<string, unknown>;

/**
 * Legacy wrapped canvas format for backward compatibility.
 */
export interface LegacyPersistedCanvasData {
  snapshot: PersistedCanvasSnapshot | string;
  shapes?: unknown[];
  backgroundShapes?: unknown[];
}

/**
 * Internal type for canvas data stored in persistence.
 * Supports current and legacy serialized shapes.
 */
export type PersistedCanvasData = PersistedCanvasSnapshot | LegacyPersistedCanvasData;

/**
 * Board as serialized in JSON format.
 * Note: canvasData is handled separately by CanvasDataService
 */
export interface PersistedBoard {
  id: string;
  scriptData: OutputData | null;
  previewUrl: string | null;
  backgroundColor: string;
  duration: number;
}

/**
 * Complete project data as serialized to JSON file.
 */
export interface PersistedProjectData {
  boards: (PersistedBoard & { canvasData?: PersistedCanvasData | string })[];
  currentBoardId: string | null;
  onionSkinEnabled?: boolean;
  audioTracks?: {
    id: string;
    name: string;
    url: string;
    startTime: number;
    duration: number;
    trimStart: number;
    fileDuration: number;
    laneIndex: number;
    volume: number;
  }[];
  audioLaneCount?: number;
  audioLaneMixers?: {
    volume: number;
    muted: boolean;
  }[];
  fps?: number;
  width?: number;
  height?: number;
}
