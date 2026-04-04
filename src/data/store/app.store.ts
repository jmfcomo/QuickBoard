import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { computed } from '@angular/core';
import type { OutputData } from '@editorjs/editorjs';
import { CanvasDataService } from '../../services/canvas-data.service';

export interface Board {
  id: string;
  scriptData: OutputData | null;
  previewUrl: string | null;
  backgroundColor: string;
  duration: number;
}

export interface AudioTrack {
  id: string;
  name: string;
  url: string;
  startTime: number;
  duration: number;
  trimStart: number;
  fileDuration: number;
  laneIndex: number;
  volume: number;
}

export interface AudioLaneMixer {
  volume: number; // 0–1 linear gain
  muted: boolean;
}

interface AppState {
  boards: Board[];
  currentBoardId: string | null;
  audioTracks: AudioTrack[];
  audioLaneCount: number;
  audioLaneMixers: AudioLaneMixer[];
  isPlaying: boolean;
  currentTime: number; // seconds
}

const firstBoardId = crypto.randomUUID();

const initialState: AppState = {
  boards: [
    {
      id: firstBoardId,
      scriptData: null,
      previewUrl: null,
      backgroundColor: '#ffffff',
      duration: 3,
    },
  ],
  currentBoardId: firstBoardId,
  audioTracks: [],
  audioLaneCount: 1,
  audioLaneMixers: [{ volume: 1, muted: false }],
  isPlaying: false,
  currentTime: 0,
};

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const canvasDataService = inject(CanvasDataService);
    return {
      setCurrentBoard(boardId: string) {
        patchState(store, { currentBoardId: boardId });
      },

      addBoard() {
        const currentBoard = store.boards().find((board) => board.id === store.currentBoardId());
        const backgroundColor = currentBoard?.backgroundColor ?? '#ffffff';
        const duration = currentBoard?.duration ?? 3;
        const newBoard: Board = {
          id: crypto.randomUUID(),
          scriptData: null,
          previewUrl: null,
          backgroundColor,
          duration,
        };
        patchState(store, { boards: [...store.boards(), newBoard] });
        return newBoard.id;
      },

      deleteBoard(boardId: string) {
        canvasDataService.deleteCanvasData(boardId);
        const boards = store.boards().filter((b) => b.id !== boardId);
        patchState(store, { boards });
      },

      updateBoardPreview(boardId: string, previewUrl: string) {
        const boards = store
          .boards()
          .map((board) => (board.id === boardId ? { ...board, previewUrl } : board));
        patchState(store, { boards });
      },

      updateBackgroundColor(boardId: string, backgroundColor: string) {
        const boards = store
          .boards()
          .map((board) => (board.id === boardId ? { ...board, backgroundColor } : board));
        patchState(store, { boards });
      },

      updateScriptData(boardId: string, scriptData: OutputData) {
        const clonedData = JSON.parse(JSON.stringify(scriptData)) as OutputData;
        const boards = store
          .boards()
          .map((board) => (board.id === boardId ? { ...board, scriptData: clonedData } : board));
        patchState(store, { boards });
      },

      exportAsJson(): string {
        return JSON.stringify(
          {
            boards: store.boards().map((b) => ({
              ...b,
              canvasData: canvasDataService.getCanvasData(b.id),
            })),
            currentBoardId: store.currentBoardId(),
            audioTracks: store.audioTracks(),
            audioLaneCount: store.audioLaneCount(),
            audioLaneMixers: store.audioLaneMixers(),
          },
          null,
          2,
        );
      },

      loadFromJson(jsonString: string) {
        try {
          const data = JSON.parse(jsonString) as AppState & { boards: unknown[] };
          if (!data || !Array.isArray(data.boards)) {
            throw new Error('Invalid JSON structure: "boards" array is required');
          }

          canvasDataService.clear();
          const cleanedBoards = (data.boards as unknown[]).map((iterBoard) => {
            const b = iterBoard as { id: string; canvasData?: unknown };
            if (b.canvasData) {
              let shapes: unknown[] = [];
              let backgroundShapes: unknown[] = [];

              // Handle case where canvasData might be a serialized string in deeply old files
              const parsedCanvasData =
                typeof b.canvasData === 'string'
                  ? (JSON.parse(b.canvasData) as Record<string, unknown>)
                  : (b.canvasData as Record<string, unknown>);

              // Only attempt pre-hydration if LC is globally available (standard browser environment)
              if (typeof LC !== 'undefined' && LC.snapshotJSONToShapes) {
                try {
                  shapes = parsedCanvasData['shapes']
                    ? (LC.snapshotJSONToShapes(
                        parsedCanvasData['shapes'] as Record<string, unknown>[],
                      ) as unknown[])
                    : [];
                  backgroundShapes = parsedCanvasData['backgroundShapes']
                    ? (LC.snapshotJSONToShapes(
                        parsedCanvasData['backgroundShapes'] as Record<string, unknown>[],
                      ) as unknown[])
                    : [];
                } catch (e) {
                  console.warn('Failed to pre-hydrate LC shapes for board', b.id, e);
                  shapes = [];
                  backgroundShapes = [];
                }
              }

              canvasDataService.setCanvasData(b.id, {
                snapshot: parsedCanvasData,
                shapes: shapes.length > 0 ? shapes : undefined,
                backgroundShapes: backgroundShapes.length > 0 ? backgroundShapes : undefined,
              });
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { canvasData, ...rest } = b;
            return rest;
          });

          const laneCount = typeof data.audioLaneCount === 'number' ? data.audioLaneCount : 1;
          const defaultMixers = Array.from({ length: laneCount }, () => ({
            volume: 1,
            muted: false,
          }));
          const laneMixers = Array.isArray(data.audioLaneMixers)
            ? data.audioLaneMixers
            : defaultMixers;
          const normalizedTracks = Array.isArray(data.audioTracks)
            ? data.audioTracks.map((track) => ({
                ...track,
                volume:
                  typeof (track as Partial<AudioTrack>).volume === 'number'
                    ? (track as AudioTrack).volume
                    : (laneMixers[(track as AudioTrack).laneIndex]?.volume ?? 1),
              }))
            : [];
          patchState(store, {
            boards: cleanedBoards as Board[],
            currentBoardId: data.currentBoardId || data.boards[0]?.id || null,
            audioTracks: normalizedTracks,
            audioLaneCount: laneCount,
            audioLaneMixers: laneMixers,
          });
        } catch (error) {
          console.error('Failed to load JSON:', error);
          throw new Error('Invalid JSON format or structure');
        }
      },

      updateBoardDuration(boardId: string, duration: number) {
        const boards = store
          .boards()
          .map((board) => (board.id === boardId ? { ...board, duration } : board));
        patchState(store, { boards });
      },

      reorderBoards(fromIndex: number, toIndex: number) {
        const boards = [...store.boards()];
        const [movedBoard] = boards.splice(fromIndex, 1);
        boards.splice(toIndex, 0, movedBoard);
        patchState(store, { boards });
      },

      setIsPlaying(isPlaying: boolean) {
        patchState(store, { isPlaying });
      },

      setCurrentTime(time: number) {
        patchState(store, { currentTime: time });
      },

      updateAudioUrl(trackId: string, url: string) {
        patchState(store, (state) => ({
          audioTracks: state.audioTracks.map((t) => (t.id === trackId ? { ...t, url } : t)),
        }));
      },

      addAudioTrack(track: AudioTrack) {
        patchState(store, (state) => ({
          audioTracks: [...state.audioTracks, track],
        }));
      },

      removeAudioTrack(trackId: string) {
        patchState(store, (state) => ({
          audioTracks: state.audioTracks.filter((t) => t.id !== trackId),
        }));
      },

      updateAudioStartTime(trackId: string, newStartTime: number) {
        patchState(store, (state) => ({
          audioTracks: state.audioTracks.map((t) =>
            t.id === trackId ? { ...t, startTime: newStartTime } : t,
          ),
        }));
      },

      updateAudioTrim(trackId: string, startTime: number, duration: number, trimStart: number) {
        patchState(store, (state) => ({
          audioTracks: state.audioTracks.map((t) =>
            t.id === trackId ? { ...t, startTime, duration, trimStart } : t,
          ),
        }));
      },

      addAudioLane() {
        if (store.audioLaneCount() < 4) {
          patchState(store, {
            audioLaneCount: store.audioLaneCount() + 1,
            audioLaneMixers: [...store.audioLaneMixers(), { volume: 1, muted: false }],
          });
        }
      },

      setAudioLaneVolume(laneIndex: number, volume: number) {
        const mixers = store
          .audioLaneMixers()
          .map((m, i) => (i === laneIndex ? { ...m, volume } : m));
        patchState(store, { audioLaneMixers: mixers });
      },

      updateAudioVolume(trackId: string, volume: number) {
        patchState(store, (state) => ({
          audioTracks: state.audioTracks.map((t) => (t.id === trackId ? { ...t, volume } : t)),
        }));
      },

      setAudioLaneMuted(laneIndex: number, muted: boolean) {
        const mixers = store
          .audioLaneMixers()
          .map((m, i) => (i === laneIndex ? { ...m, muted } : m));
        patchState(store, { audioLaneMixers: mixers });
      },

      updateAudioLane(trackId: string, laneIndex: number) {
        patchState(store, (state) => ({
          audioTracks: state.audioTracks.map((t) => (t.id === trackId ? { ...t, laneIndex } : t)),
        }));
      },

      removeAudioLane(laneIndex: number) {
        patchState(store, (state) => ({
          // Drop clips on the removed lane; shift higher-indexed lanes down by 1
          audioTracks: state.audioTracks
            .filter((t) => t.laneIndex !== laneIndex)
            .map((t) => (t.laneIndex > laneIndex ? { ...t, laneIndex: t.laneIndex - 1 } : t)),
          audioLaneCount: Math.max(1, state.audioLaneCount - 1),
          audioLaneMixers: state.audioLaneMixers.filter((_, i) => i !== laneIndex),
        }));
      },

      /**
       * Restore a previously-deleted board at a specific index.
       * Used exclusively by the undo system.
       */
      restoreBoard(board: Board, index: number) {
        const boards = [...store.boards()];
        const clampedIndex = Math.max(0, Math.min(index, boards.length));
        boards.splice(clampedIndex, 0, board);
        patchState(store, { boards });
      },
    };
  }),
  withComputed((store) => ({
    totalDuration: computed(() => {
      return store.boards().reduce((acc, b) => acc + (b.duration || 3), 0);
    }),
  })),
);
