import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import type { OutputData } from '@editorjs/editorjs';

interface Board {
  id: string;
  canvasData: Record<string, unknown> | null;
  scriptData: OutputData | null;
  previewUrl: string | null;
}

interface AppState {
  boards: Board[];
  currentBoardId: string | null;
}

const firstBoardId = crypto.randomUUID();

const initialState: AppState = {
  boards: [
    {
      id: firstBoardId,
      canvasData: null,
      scriptData: null,
      previewUrl: null,
    },
  ],
  currentBoardId: firstBoardId,
};

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setCurrentBoard(boardId: string) {
      patchState(store, { currentBoardId: boardId });
    },
    addBoard() {
      const newBoard: Board = {
        id: crypto.randomUUID(),
        canvasData: null,
        scriptData: null,
        previewUrl: null,
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
        .map((board) => (board.id === boardId ? { ...board, canvasData, previewUrl: previewUrl ?? board.previewUrl } : board));
      patchState(store, { boards });
    },
    updateScriptData(boardId: string, scriptData: OutputData) {
      const clonedData = JSON.parse(JSON.stringify(scriptData)) as OutputData;
      const boards = store
        .boards()
        .map((board) => (board.id === boardId ? { ...board, scriptData: clonedData } : board));
      patchState(store, { boards });
    },
  })),
);
