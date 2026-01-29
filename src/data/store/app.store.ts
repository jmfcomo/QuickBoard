import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import type { OutputData } from '@editorjs/editorjs';

interface AppState {
  canvasData: Record<string, unknown> | null;
  scriptData: OutputData | null;
}

const initialState: AppState = {
  canvasData: null,
  scriptData: null,
};

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    updateCanvasData(canvasData: Record<string, unknown>) {
      patchState(store, { canvasData });
    },
    updateScriptData(scriptData: OutputData) {
      patchState(store, { scriptData });
    },
  })),
);
