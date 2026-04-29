import type { OutputData } from '@editorjs/editorjs';

/**
 * Internal type for canvas data stored in persistence.
 * This is what gets serialized/deserialized from JSON.
 */
export interface PersistedCanvasData {
  snapshot: Record<string, unknown>;
  shapes?: unknown[];
  backgroundShapes?: unknown[];
}

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
  boards: (PersistedBoard & { canvasData?: PersistedCanvasData })[];
  currentBoardId: string | null;
  onionSkinEnabled: boolean;
  audioTracks: {
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
  audioLaneCount: number;
  audioLaneMixers: {
    volume: number;
    muted: boolean;
  }[];
  fps?: number;
  width?: number;
  height?: number;
}
