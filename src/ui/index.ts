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
export { ExportProgressComponent } from './export-progress/export-progress.component';
export { ExportSettingsComponent } from './export-settings/export-settings.component';
export { EXPORT_RESOLUTIONS } from './export-settings/export-resolutions';
export type { ExportResolution } from './export-settings/export-resolutions';
