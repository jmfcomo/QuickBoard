import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { computed } from '@angular/core';
import type { OutputData } from '@editorjs/editorjs';

interface Board {
  id: string;
  canvasData: Record<string, unknown> | null;
  scriptData: OutputData | null;
  previewUrl: string | null;
  backgroundColor: string;
  duration: number;
}

interface AppState {
  boards: Board[];
  currentBoardId: string | null;
  isPlaying: boolean;
  currentTime: number; // seconds
}

const firstBoardId = crypto.randomUUID();

const initialState: AppState = {
  boards: [
    {
      id: firstBoardId,
      canvasData: null,
      scriptData: null,
      previewUrl: null,
      backgroundColor: '#ffffff',
      duration: 3,
    },
  ],
  currentBoardId: firstBoardId,
  isPlaying: false,
  currentTime: 0,
};

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setCurrentBoard(boardId: string) {
      patchState(store, { currentBoardId: boardId });
    },
    addBoard() {
      const currentBoard = store.boards().find((board) => board.id === store.currentBoardId());
      const backgroundColor = currentBoard?.backgroundColor ?? '#ffffff';
      const duration = currentBoard?.duration ?? 3;
      const newBoard: Board = {
        id: crypto.randomUUID(),
        canvasData: null,
        scriptData: null,
        previewUrl: null,
        backgroundColor,
        duration,
      };
      patchState(store, { boards: [...store.boards(), newBoard] });
      return newBoard.id;
    },
    deleteBoard(boardId: string) {
      const boards = store.boards().filter((b) => b.id !== boardId);
      patchState(store, { boards });
    },
    updateCanvasData(boardId: string, canvasData: Record<string, unknown>, previewUrl?: string) {
      const boards = store
        .boards()
        .map((board) =>
          board.id === boardId
            ? { ...board, canvasData, previewUrl: previewUrl ?? board.previewUrl }
            : board,
        );
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
          boards: store.boards(),
          currentBoardId: store.currentBoardId(),
        },
        null,
        2,
      );
    },
    loadFromJson(jsonString: string) {
      try {
        const data = JSON.parse(jsonString) as AppState;
        if (!data || !Array.isArray(data.boards)) {
          throw new Error('Invalid JSON structure: "boards" array is required');
        }
        patchState(store, {
          boards: data.boards,
          currentBoardId: data.currentBoardId || data.boards[0]?.id || null,
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
    setIsPlaying(isPlaying: boolean) {
      patchState(store, { isPlaying });
    },
    setCurrentTime(time: number) {
      patchState(store, { currentTime: time });
    },
  })),
  withComputed((store) => ({
    totalDuration: computed(() => {
      return store.boards().reduce((acc, b) => acc + (b.duration || 3), 0);
    }),
  })),
);
