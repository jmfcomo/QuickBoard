// Canvas
export { CanvasComponent, PropertiesBarComponent, Brush, BucketFill, ObjectEraser } from './canvas';
export type {
  ColorPicker,
  LCTool,
  LCInstance,
  LiterallyCanvasTool,
  LiterallyCanvas,
} from './canvas';

// Timeline
export {
  TimelineComponent,
  TimelineControlsComponent,
  TimelineEditor,
  TimelineMenu,
  AudioTracksComponent,
  BoardsTrackComponent,
  formatTime,
  TimelineActions,
  TimelineDrag,
  createTimelineData,
} from './timeline';

// Script
export { ScriptComponent } from './script';

// Dialogs
export { VersionDialogComponent, AboutDialogComponent } from './dialogs';
export type { VersionInfo, AboutInfo } from './dialogs';
