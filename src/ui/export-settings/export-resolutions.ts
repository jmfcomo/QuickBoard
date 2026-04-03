export interface ExportResolution {
  label: string;
  scale: number;
  width: number;
  height: number;
}

export interface ExportSettings {
  format: 'png' | 'video';
  resolution: ExportResolution;
  prefix: string;
  dirPath: string;
  startIndex: number;
  endIndex: number;
}

export const EXPORT_RESOLUTIONS: ExportResolution[] = [
  { label: '480 × 270  — Draft', scale: 0.25, width: 480, height: 270 },
  { label: '960 × 540  — SD', scale: 0.5, width: 960, height: 540 },
  { label: '1920 × 1080  — Full HD', scale: 1, width: 1920, height: 1080 },
  { label: '3840 × 2160  — 4K', scale: 2, width: 3840, height: 2160 },
  { label: '7680 × 4320  — 8K', scale: 4, width: 7680, height: 4320 },
];
