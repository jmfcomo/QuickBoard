// Component
export { CanvasComponent } from './canvas/canvas.component';
export { ClearCanvasConfirmComponent } from './clear-canvas-confirm';
export { OnionSkinOverlayComponent } from './onion-skin';
export { ToolsBarComponent } from './tools-bar';

// Properties bar
export type { ColorPicker } from './properties-bar/properties-bar.component';
export { PropertiesBarComponent } from './properties-bar/properties-bar.component';

// Interfaces
export type {
  LCTool,
  LCInstance,
  LiterallyCanvasTool,
  LiterallyCanvas,
} from './literally-canvas-interfaces';

export type { OnionOverlayRect, OnionSkinLayer } from './onion-skin';

export { OnionSkinService } from './onion-skin';
export { CanvasUndoRedoService } from './undo-redo';
export { CanvasPersistenceService } from './persistence';

// Tools
export { Brush, BucketFill, ObjectEraser, ZoomTool } from './tools';
export type { ZoomClientPoint } from './tools';
