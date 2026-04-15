export function getGlobalPoint(shape: Record<string, unknown>, nx: number, ny: number) {
  const sw =
    ((shape['cropWidth'] as number) ||
      (shape['image'] ? (shape['image'] as HTMLImageElement).width : 0)) *
    (shape['scale'] as number);
  const sh =
    ((shape['cropHeight'] as number) ||
      (shape['image'] ? (shape['image'] as HTMLImageElement).height : 0)) *
    (shape['scale'] as number);
  const rot = (shape['rotation'] as number) || 0;
  const cx = (shape['x'] as number) + sw / 2;
  const cy = (shape['y'] as number) + sh / 2;
  const lx = (nx - 0.5) * sw;
  const ly = (ny - 0.5) * sh;
  return {
    x: cx + Math.cos(rot) * lx - Math.sin(rot) * ly,
    y: cy + Math.sin(rot) * lx + Math.cos(rot) * ly,
  };
}

export function setGlobalPointAnchor(
  shape: Record<string, unknown>,
  nx: number,
  ny: number,
  targetG: { x: number; y: number },
) {
  const sw =
    ((shape['cropWidth'] as number) ||
      (shape['image'] ? (shape['image'] as HTMLImageElement).width : 0)) *
    (shape['scale'] as number);
  const sh =
    ((shape['cropHeight'] as number) ||
      (shape['image'] ? (shape['image'] as HTMLImageElement).height : 0)) *
    (shape['scale'] as number);
  const rot = (shape['rotation'] as number) || 0;
  const lx = (nx - 0.5) * sw;
  const ly = (ny - 0.5) * sh;
  shape['x'] = targetG.x - sw / 2 - Math.cos(rot) * lx + Math.sin(rot) * ly;
  shape['y'] = targetG.y - sh / 2 - Math.sin(rot) * lx - Math.cos(rot) * ly;
}

export function ptToLocal(gx: number, gy: number, shape: Record<string, unknown>) {
  const sw =
    ((shape['cropWidth'] as number) ||
      (shape['image'] ? (shape['image'] as HTMLImageElement).width : 0)) *
    (shape['scale'] as number);
  const sh =
    ((shape['cropHeight'] as number) ||
      (shape['image'] ? (shape['image'] as HTMLImageElement).height : 0)) *
    (shape['scale'] as number);
  const dx = gx - ((shape['x'] as number) + sw / 2);
  const dy = gy - ((shape['y'] as number) + sh / 2);
  const rot = -((shape['rotation'] as number) || 0);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return { lx: dx * cos - dy * sin + sw / 2, ly: dx * sin + dy * cos + sh / 2, sw, sh };
}
