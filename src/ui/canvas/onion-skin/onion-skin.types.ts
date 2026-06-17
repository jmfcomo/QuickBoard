export type OnionOverlayRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type OnionSkinLayer = Readonly<{
  id: string;
  onionPreviewUrl: string;
  color: string;
  opacity: number;
}>;