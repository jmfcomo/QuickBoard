import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

interface AppState {
  canvasData: Record<string, unknown> | null;
}

const initialState: AppState = {
  canvasData: null,
};

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    updateCanvasData(canvasData: Record<string, unknown>) {
      patchState(store, { canvasData });
    },
  })),
);
