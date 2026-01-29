import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import type { OutputData } from '@editorjs/editorjs';

interface Frame {
  id: string;
  canvasData: Record<string, unknown> | null;
  scriptData: OutputData | null;
}

interface AppState {
  frames: Frame[];
  currentFrameId: string | null;
}

const firstFrameId = crypto.randomUUID();

const initialState: AppState = {
  frames: [
    {
      id: firstFrameId,
      canvasData: null,
      scriptData: null,
    },
  ],
  currentFrameId: firstFrameId,
};

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setCurrentFrame(frameId: string) {
      patchState(store, { currentFrameId: frameId });
    },
    addFrame() {
      const newFrame: Frame = {
        id: crypto.randomUUID(),
        canvasData: null,
        scriptData: null,
      };
      patchState(store, { frames: [...store.frames(), newFrame] });
      return newFrame.id;
    },
    deleteFrame(frameId: string) {
      const frames = store.frames().filter((f) => f.id !== frameId);
      patchState(store, { frames });
    },
    updateCanvasData(frameId: string, canvasData: Record<string, unknown>) {
      const frames = store
        .frames()
        .map((frame) => (frame.id === frameId ? { ...frame, canvasData } : frame));
      patchState(store, { frames });
    },
    updateScriptData(frameId: string, scriptData: OutputData) {
      const clonedData = JSON.parse(JSON.stringify(scriptData)) as OutputData;
      const frames = store
        .frames()
        .map((frame) => (frame.id === frameId ? { ...frame, scriptData: clonedData } : frame));
      patchState(store, { frames });
    },
  })),
);
