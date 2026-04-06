import { LCInstance, LCTool } from '../literally-canvas-interfaces';

class TransformAction {
  constructor(
    private readonly lc: LCInstance,
    private readonly shape: Record<string, unknown>,
    private readonly fromState: Record<string, unknown>,
    private readonly toState: Record<string, unknown>,
  ) {}

  do(): void {
    this.applyState(this.toState);
    this.lc.repaintLayer('main');
  }

  undo(): void {
    this.applyState(this.fromState);
    this.lc.repaintLayer('main');
  }

  private applyState(state: Record<string, unknown>): void {
    if (typeof this.shape['setUpperLeft'] === 'function') {
      if (state['x'] !== undefined && state['y'] !== undefined) {
        (this.shape['setUpperLeft'] as (pos: { x: number; y: number }) => void).call(this.shape, {
          x: state['x'] as number,
          y: state['y'] as number,
        });
      }
    } else {
      if (state['x'] !== undefined) this.shape['x'] = state['x'];
      if (state['y'] !== undefined) this.shape['y'] = state['y'];
    }
    if (state['scale'] !== undefined) this.shape['scale'] = state['scale'];
    if (state['width'] !== undefined) this.shape['width'] = state['width'];
    if (state['height'] !== undefined) this.shape['height'] = state['height'];
    if (state['rotation'] !== undefined) this.shape['rotation'] = state['rotation'];
    if (state['cropX'] !== undefined) this.shape['cropX'] = state['cropX'];
    if (state['cropY'] !== undefined) this.shape['cropY'] = state['cropY'];
    if (state['cropWidth'] !== undefined) this.shape['cropWidth'] = state['cropWidth'];
    if (state['cropHeight'] !== undefined) this.shape['cropHeight'] = state['cropHeight'];
  }
}

function getGlobalPoint(shape: Record<string, unknown>, nx: number, ny: number) {
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

function setGlobalPointAnchor(
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

function ptToLocal(gx: number, gy: number, shape: Record<string, unknown>) {
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

export function registerImprovedSelectShapes(LC: Record<string, unknown>): void {
  if (
    !LC ||
    typeof LC['defineShape'] !== 'function' ||
    typeof LC['defineCanvasRenderer'] !== 'function'
  )
    return;

  LC['defineShape']('Image', {
    constructor: function (this: Record<string, unknown>, args: Record<string, unknown>) {
      if (!args) args = {};
      this['x'] = args['x'] || 0;
      this['y'] = args['y'] || 0;
      this['scale'] = args['scale'] || 1;
      this['image'] = args['image'] || null;
      this['crossOrigin'] =
        (args['image'] && (args['image'] as HTMLImageElement).crossOrigin) || null;
      this['rotation'] = args['rotation'] || 0;
      this['cropX'] = args['cropX'] || 0;
      this['cropY'] = args['cropY'] || 0;
      this['cropWidth'] =
        args['cropWidth'] || (this['image'] ? (this['image'] as HTMLImageElement).width : 0);
      this['cropHeight'] =
        args['cropHeight'] || (this['image'] ? (this['image'] as HTMLImageElement).height : 0);
    },
    getBoundingRect: function (this: Record<string, unknown>) {
      if (!this['image'])
        return { x: this['x'] as number, y: this['y'] as number, width: 0, height: 0 };
      const w =
        ((this['cropWidth'] as number) || (this['image'] as HTMLImageElement).width) *
        (this['scale'] as number);
      const h =
        ((this['cropHeight'] as number) || (this['image'] as HTMLImageElement).height) *
        (this['scale'] as number);

      if (!this['rotation']) {
        return { x: this['x'] as number, y: this['y'] as number, width: w, height: h };
      }

      const cx = (this['x'] as number) + w / 2;
      const cy = (this['y'] as number) + h / 2;
      const cos = Math.cos(this['rotation'] as number);
      const sin = Math.sin(this['rotation'] as number);
      const pts = [
        { x: -w / 2, y: -h / 2 },
        { x: w / 2, y: -h / 2 },
        { x: -w / 2, y: h / 2 },
        { x: w / 2, y: h / 2 },
      ];
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of pts) {
        const lx = p.x * cos - p.y * sin + cx;
        const ly = p.x * sin + p.y * cos + cy;
        minX = Math.min(minX, lx);
        minY = Math.min(minY, ly);
        maxX = Math.max(maxX, lx);
        maxY = Math.max(maxY, ly);
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    },
    toJSON: function (this: Record<string, unknown>) {
      const data: Record<string, unknown> = {
        x: this['x'],
        y: this['y'],
        imageSrc: this['image'] ? (this['image'] as HTMLImageElement).src : null,
        imageObject: this['image'],
        scale: this['scale'],
        rotation: this['rotation'],
        cropX: this['cropX'],
        cropY: this['cropY'],
        cropWidth: this['cropWidth'],
        cropHeight: this['cropHeight'],
      };
      if (this['crossOrigin']) data['crossOrigin'] = this['crossOrigin'];
      return data;
    },
    fromJSON: function (data: Record<string, unknown>) {
      let img = null;
      if (data['imageObject'] && (data['imageObject'] as HTMLImageElement).width) {
        img = data['imageObject'];
      } else if (data['imageSrc']) {
        img = new Image();
        img.src = data['imageSrc'] as string;
        if (data['crossOrigin']) img.crossOrigin = data['crossOrigin'] as string;
      }
      const LCglobal = (window as unknown as Record<string, unknown>)['LC'] as Record<
        string,
        unknown
      >;
      return (LCglobal['createShape'] as (n: string, a: Record<string, unknown>) => unknown)(
        'Image',
        {
          x: data['x'],
          y: data['y'],
          image: img,
          scale: data['scale'],
          rotation: data['rotation'],
          cropX: data['cropX'],
          cropY: data['cropY'],
          cropWidth: data['cropWidth'],
          cropHeight: data['cropHeight'],
        },
      );
    },
  });

  LC['defineCanvasRenderer'](
    'Image',
    function (
      ctx: CanvasRenderingContext2D,
      shape: Record<string, unknown>,
      retryCallback: () => void,
    ) {
      if (shape['image'] && (shape['image'] as HTMLImageElement).width) {
        const w = (shape['cropWidth'] as number) || (shape['image'] as HTMLImageElement).width;
        const h = (shape['cropHeight'] as number) || (shape['image'] as HTMLImageElement).height;
        const sw = w * (shape['scale'] as number);
        const sh = h * (shape['scale'] as number);
        ctx.save();
        const cx = (shape['x'] as number) + sw / 2;
        const cy = (shape['y'] as number) + sh / 2;
        ctx.translate(cx, cy);
        if (shape['rotation']) ctx.rotate(shape['rotation'] as number);

        const cxOffset = (shape['cropX'] as number) || 0;
        const cyOffset = (shape['cropY'] as number) || 0;

        ctx.beginPath();
        ctx.rect(-sw / 2, -sh / 2, sw, sh);
        ctx.clip();

        ctx.drawImage(
          shape['image'] as HTMLImageElement,
          cxOffset,
          cyOffset,
          w,
          h,
          -sw / 2,
          -sh / 2,
          sw,
          sh,
        );
        ctx.restore();
      } else if (retryCallback) {
        if (shape['image']) (shape['image'] as HTMLImageElement).onload = retryCallback;
      }
    },
  );

  LC['defineShape']('ImageSelectionOverlay', {
    constructor: function (
      this: { shape: unknown; overrideBg: string },
      args: { shape: unknown; overrideBg: string },
    ) {
      this.shape = args.shape;
      this.overrideBg = args.overrideBg;
    },
    getBoundingRect: function (this: {
      shape: { getBoundingRect: () => { x: number; y: number; width: number; height: number } };
    }) {
      return this.shape.getBoundingRect();
    },
  });

  LC['defineCanvasRenderer'](
    'ImageSelectionOverlay',
    function (ctx: CanvasRenderingContext2D, overlayShape: Record<string, unknown>) {
      const shape = overlayShape['shape'] as Record<string, unknown>;
      if (!shape || shape['className'] !== 'Image' || !shape['image']) return;

      const w =
        ((shape['cropWidth'] as number) || (shape['image'] as HTMLImageElement).width) *
        (shape['scale'] as number);
      const h =
        ((shape['cropHeight'] as number) || (shape['image'] as HTMLImageElement).height) *
        (shape['scale'] as number);

      ctx.save();
      ctx.translate((shape['x'] as number) + w / 2, (shape['y'] as number) + h / 2);
      if (shape['rotation']) ctx.rotate(shape['rotation'] as number);

      if (overlayShape['overrideBg']) {
        ctx.fillStyle = overlayShape['overrideBg'] as string;
        ctx.fillRect(-w / 2, -h / 2, w, h);
      } else {
        ctx.strokeStyle = '#0066cc';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.setLineDash([]);

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0066cc';

        const drawHandle = (x: number, y: number, isCrop = false) => {
          ctx.beginPath();
          if (isCrop) {
            ctx.fillRect(x - 4, y - 4, 8, 8);
            ctx.strokeRect(x - 4, y - 4, 8, 8);
          } else {
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
          }
        };

        drawHandle(-w / 2, -h / 2);
        drawHandle(w / 2, -h / 2);
        drawHandle(-w / 2, h / 2);
        drawHandle(w / 2, h / 2);

        drawHandle(0, -h / 2, true);
        drawHandle(0, h / 2, true);
        drawHandle(-w / 2, 0, true);
        drawHandle(w / 2, 0, true);

        ctx.beginPath();
        ctx.moveTo(0, -h / 2);
        ctx.lineTo(0, -h / 2 - 25);
        ctx.stroke();
        drawHandle(0, -h / 2 - 25);
      }

      ctx.restore();
    },
  );
}

export class ImprovedSelectShape implements LCTool {
  name = 'SelectShape';
  iconName = 'select';
  usesSimpleAPI = false;

  private readonly selectCanvas = document.createElement('canvas');
  private readonly selectCtx = this.selectCanvas.getContext('2d', { willReadFrequently: true });
  private _selectShapeUnsubscribe: (() => void) | null = null;
  private selectedShape: Record<string, unknown> | null = null;
  private dragOffset = { x: 0, y: 0 };
  private initialPosition = { x: 0, y: 0 };
  private initialScale = 1;
  private initialRotation = 0;
  private initialCrop = { x: 0, y: 0, w: 0, h: 0 };
  private dragMode: string | null = null;
  private didDrag = false;

  constructor(private readonly lc: LCInstance) {
    this.selectCanvas.style.backgroundColor = 'transparent';
  }

  willBecomeActive(): void {
    // Empty
  }

  didBecomeActive(lc: LCInstance): void {
    const unsub1 = lc.on('lc-pointerdown', (e: unknown) =>
      this.onDown(e as { x: number; y: number }, lc),
    );
    const unsub2 = lc.on('lc-pointerdrag', (e: unknown) =>
      this.onDrag(e as { x: number; y: number }, lc),
    );
    const unsub3 = lc.on('lc-pointerup', (e: unknown) =>
      this.onUp(e as { x: number; y: number }, lc),
    );
    this._selectShapeUnsubscribe = () => {
      if (typeof unsub1 === 'function') (unsub1 as () => void)();
      if (typeof unsub2 === 'function') (unsub2 as () => void)();
      if (typeof unsub3 === 'function') (unsub3 as () => void)();
    };
    this._drawSelectCanvas(lc);
  }

  willBecomeInactive(lc: LCInstance): void {
    if (this._selectShapeUnsubscribe) this._selectShapeUnsubscribe();
    lc.setShapesInProgress([]);
    this.selectedShape = null;
  }

  didBecomeInactive(): void {
    // Empty
  }

  private onDown(e: { x: number; y: number }, lc: LCInstance): void {
    this.didDrag = false;

    if (
      this.selectedShape &&
      this.selectedShape['className'] === 'Image' &&
      this.selectedShape['image']
    ) {
      const sw =
        ((this.selectedShape['cropWidth'] as number) ||
          (this.selectedShape['image'] as HTMLImageElement).width) *
        (this.selectedShape['scale'] as number);
      const sh =
        ((this.selectedShape['cropHeight'] as number) ||
          (this.selectedShape['image'] as HTMLImageElement).height) *
        (this.selectedShape['scale'] as number);
      const { lx, ly } = ptToLocal(e.x, e.y, this.selectedShape);

      const pad = 15;

      this.dragMode = null;
      if (Math.abs(lx - sw / 2) < pad && Math.abs(ly + 25) < pad) this.dragMode = 'rotate';
      else if (Math.abs(lx) < pad && Math.abs(ly) < pad) this.dragMode = 'tl';
      else if (Math.abs(lx - sw) < pad && Math.abs(ly) < pad) this.dragMode = 'tr';
      else if (Math.abs(lx) < pad && Math.abs(ly - sh) < pad) this.dragMode = 'bl';
      else if (Math.abs(lx - sw) < pad && Math.abs(ly - sh) < pad) this.dragMode = 'br';
      else if (Math.abs(lx - sw / 2) < pad && Math.abs(ly) < pad) this.dragMode = 'crop-t';
      else if (Math.abs(lx - sw / 2) < pad && Math.abs(ly - sh) < pad) this.dragMode = 'crop-b';
      else if (Math.abs(lx) < pad && Math.abs(ly - sh / 2) < pad) this.dragMode = 'crop-l';
      else if (Math.abs(lx - sw) < pad && Math.abs(ly - sh / 2) < pad) this.dragMode = 'crop-r';

      if (this.dragMode) {
        this.saveInitialState();
        return;
      }
    }

    this.dragMode = null;
    const shapeIndex = this.selectCtx ? this._getPixel(e.x, e.y, lc, this.selectCtx) : null;

    if (shapeIndex !== null && lc.shapes[shapeIndex]) {
      this.selectedShape = lc.shapes[shapeIndex] as Record<string, unknown>;
      lc.trigger('shapeSelected', { selectedShape: this.selectedShape });

      if (typeof this.selectedShape['getBoundingRect'] === 'function') {
        const br = (this.selectedShape['getBoundingRect'] as () => { x: number; y: number })();
        this.dragOffset = { x: e.x - br.x, y: e.y - br.y };
      }

      this.saveInitialState();

      if (this.selectedShape['className'] === 'Image') {
        const sw =
          ((this.selectedShape['cropWidth'] as number) ||
            (this.selectedShape['image'] as HTMLImageElement).width) *
          (this.selectedShape['scale'] as number);
        const sh =
          ((this.selectedShape['cropHeight'] as number) ||
            (this.selectedShape['image'] as HTMLImageElement).height) *
          (this.selectedShape['scale'] as number);
        const cx = (this.selectedShape['x'] as number) + sw / 2;
        const cy = (this.selectedShape['y'] as number) + sh / 2;
        this.dragOffset = { x: e.x - cx, y: e.y - cy };
      }
      this.dragMode = 'move';
      this.updateSelectionOverlay(lc);
    } else {
      this.selectedShape = null;
      lc.trigger('shapeSelected', { selectedShape: null });
      lc.setShapesInProgress([]);
      lc.repaintLayer('main');
    }
  }

  private saveInitialState(): void {
    if (!this.selectedShape) return;
    let x = 0,
      y = 0;
    if (typeof this.selectedShape['getBoundingRect'] === 'function') {
      const br = (this.selectedShape['getBoundingRect'] as () => { x: number; y: number })();
      x = br.x;
      y = br.y;
    } else if (this.selectedShape['x'] !== undefined) {
      x = this.selectedShape['x'] as number;
      y = this.selectedShape['y'] as number;
    }
    this.initialPosition = { x, y };
    this.initialScale = (this.selectedShape['scale'] as number) || 1;
    this.initialRotation = (this.selectedShape['rotation'] as number) || 0;
    this.initialCrop = {
      x: (this.selectedShape['cropX'] as number) || 0,
      y: (this.selectedShape['cropY'] as number) || 0,
      w:
        (this.selectedShape['cropWidth'] as number) ||
        (this.selectedShape['image'] ? (this.selectedShape['image'] as HTMLImageElement).width : 0),
      h:
        (this.selectedShape['cropHeight'] as number) ||
        (this.selectedShape['image']
          ? (this.selectedShape['image'] as HTMLImageElement).height
          : 0),
    };
  }

  private updateSelectionOverlay(lc: LCInstance): void {
    if (!this.selectedShape) {
      lc.setShapesInProgress([]);
    } else if (this.selectedShape['className'] === 'Image') {
      const LCglobal = (window as unknown as Record<string, unknown>)['LC'] as Record<
        string,
        unknown
      >;
      const overlay = (
        LCglobal['createShape'] as (n: string, a: Record<string, unknown>) => unknown
      )('ImageSelectionOverlay', {
        shape: this.selectedShape,
      });
      lc.setShapesInProgress([this.selectedShape, overlay]);
    } else {
      const LCglobal = (window as unknown as Record<string, unknown>)['LC'] as Record<
        string,
        unknown
      >;
      const overlay = (
        LCglobal['createShape'] as (n: string, a: Record<string, unknown>) => unknown
      )('SelectionBox', {
        shape: this.selectedShape,
        handleSize: 0,
      });
      lc.setShapesInProgress([this.selectedShape, overlay]);
    }
    lc.repaintLayer('main');
  }

  private onDrag(e: { x: number; y: number }, lc: LCInstance): void {
    if (!this.selectedShape || !this.dragMode) return;
    this.didDrag = true;

    if (this.dragMode === 'move') {
      if (this.selectedShape['className'] === 'Image') {
        const sw =
          ((this.selectedShape['cropWidth'] as number) ||
            (this.selectedShape['image'] as HTMLImageElement).width) *
          (this.selectedShape['scale'] as number);
        const sh =
          ((this.selectedShape['cropHeight'] as number) ||
            (this.selectedShape['image'] as HTMLImageElement).height) *
          (this.selectedShape['scale'] as number);
        this.selectedShape['x'] = e.x - this.dragOffset.x - sw / 2;
        this.selectedShape['y'] = e.y - this.dragOffset.y - sh / 2;
      } else {
        if (typeof this.selectedShape['setUpperLeft'] === 'function') {
          (this.selectedShape['setUpperLeft'] as (pos: { x: number; y: number }) => void).call(
            this.selectedShape,
            {
              x: e.x - this.dragOffset.x,
              y: e.y - this.dragOffset.y,
            },
          );
        } else {
          this.selectedShape['x'] = e.x - this.dragOffset.x;
          this.selectedShape['y'] = e.y - this.dragOffset.y;
        }
      }
    } else if (this.selectedShape['className'] === 'Image' && this.selectedShape['image']) {
      const baseW =
        (this.selectedShape['cropWidth'] as number) ||
        (this.selectedShape['image'] as HTMLImageElement).width;
      const baseH =
        (this.selectedShape['cropHeight'] as number) ||
        (this.selectedShape['image'] as HTMLImageElement).height;
      const cos = Math.cos(-(this.selectedShape['rotation'] as number) || 0);
      const sin = Math.sin(-(this.selectedShape['rotation'] as number) || 0);

      if (this.dragMode === 'rotate') {
        const anchorG = getGlobalPoint(this.selectedShape, 0.5, 0.5);
        const angle = Math.atan2(e.y - anchorG.y, e.x - anchorG.x);
        this.selectedShape['rotation'] = angle + Math.PI / 2;
        setGlobalPointAnchor(this.selectedShape, 0.5, 0.5, anchorG);
      } else if (this.dragMode === 'br') {
        const anchorG = getGlobalPoint(this.selectedShape, 0, 0);
        const dx = e.x - anchorG.x,
          dy = e.y - anchorG.y;
        const lx = dx * cos - dy * sin,
          ly = dx * sin + dy * cos;
        this.selectedShape['scale'] = Math.max(0.01, Math.max(lx / baseW, ly / baseH));
        setGlobalPointAnchor(this.selectedShape, 0, 0, anchorG);
      } else if (this.dragMode === 'tr') {
        const anchorG = getGlobalPoint(this.selectedShape, 0, 1);
        const dx = e.x - anchorG.x,
          dy = e.y - anchorG.y;
        const lx = dx * cos - dy * sin,
          ly = dx * sin + dy * cos;
        this.selectedShape['scale'] = Math.max(0.01, Math.max(lx / baseW, -ly / baseH));
        setGlobalPointAnchor(this.selectedShape, 0, 1, anchorG);
      } else if (this.dragMode === 'tl') {
        const anchorG = getGlobalPoint(this.selectedShape, 1, 1);
        const dx = e.x - anchorG.x,
          dy = e.y - anchorG.y;
        const lx = dx * cos - dy * sin,
          ly = dx * sin + dy * cos;
        this.selectedShape['scale'] = Math.max(0.01, Math.max(-lx / baseW, -ly / baseH));
        setGlobalPointAnchor(this.selectedShape, 1, 1, anchorG);
      } else if (this.dragMode === 'bl') {
        const anchorG = getGlobalPoint(this.selectedShape, 1, 0);
        const dx = e.x - anchorG.x,
          dy = e.y - anchorG.y;
        const lx = dx * cos - dy * sin,
          ly = dx * sin + dy * cos;
        this.selectedShape['scale'] = Math.max(0.01, Math.max(-lx / baseW, ly / baseH));
        setGlobalPointAnchor(this.selectedShape, 1, 0, anchorG);
      } else if (this.dragMode === 'crop-r') {
        const anchorG = getGlobalPoint(this.selectedShape, 0, 0.5);
        const dx = e.x - anchorG.x,
          dy = e.y - anchorG.y;
        const lx = dx * cos - dy * sin;
        let newCW = lx / (this.selectedShape['scale'] as number);
        newCW = Math.min(
          Math.max(1, newCW),
          (this.selectedShape['image'] as HTMLImageElement).width -
            (this.selectedShape['cropX'] as number),
        );
        this.selectedShape['cropWidth'] = newCW;
        setGlobalPointAnchor(this.selectedShape, 0, 0.5, anchorG);
      } else if (this.dragMode === 'crop-l') {
        const anchorG = getGlobalPoint(this.selectedShape, 1, 0.5);
        const dx = e.x - anchorG.x,
          dy = e.y - anchorG.y;
        const lx = dx * cos - dy * sin;
        const newCW = -lx / (this.selectedShape['scale'] as number);
        let deltaX = (this.selectedShape['cropWidth'] as number) - newCW;
        let newCX = (this.selectedShape['cropX'] as number) + deltaX;
        let resultCW = newCW;
        if (newCX < 0) {
          deltaX = -(this.selectedShape['cropX'] as number);
          newCX = 0;
          resultCW = (this.selectedShape['cropWidth'] as number) - deltaX;
        }
        if (resultCW < 1) {
          resultCW = 1;
          newCX = this.initialCrop.x + this.initialCrop.w - 1;
        }
        this.selectedShape['cropX'] = newCX;
        this.selectedShape['cropWidth'] = resultCW;
        setGlobalPointAnchor(this.selectedShape, 1, 0.5, anchorG);
      } else if (this.dragMode === 'crop-b') {
        const anchorG = getGlobalPoint(this.selectedShape, 0.5, 0);
        const dx = e.x - anchorG.x,
          dy = e.y - anchorG.y;
        const ly = dx * sin + dy * cos;
        let newCH = ly / (this.selectedShape['scale'] as number);
        newCH = Math.min(
          Math.max(1, newCH),
          (this.selectedShape['image'] as HTMLImageElement).height -
            (this.selectedShape['cropY'] as number),
        );
        this.selectedShape['cropHeight'] = newCH;
        setGlobalPointAnchor(this.selectedShape, 0.5, 0, anchorG);
      } else if (this.dragMode === 'crop-t') {
        const anchorG = getGlobalPoint(this.selectedShape, 0.5, 1);
        const dx = e.x - anchorG.x,
          dy = e.y - anchorG.y;
        const ly = dx * sin + dy * cos;
        const newCH = -ly / (this.selectedShape['scale'] as number);
        let deltaY = (this.selectedShape['cropHeight'] as number) - newCH;
        let newCY = (this.selectedShape['cropY'] as number) + deltaY;
        let resultCH = newCH;
        if (newCY < 0) {
          deltaY = -(this.selectedShape['cropY'] as number);
          newCY = 0;
          resultCH = (this.selectedShape['cropHeight'] as number) - deltaY;
        }
        if (resultCH < 1) {
          resultCH = 1;
          newCY = this.initialCrop.y + this.initialCrop.h - 1;
        }
        this.selectedShape['cropY'] = newCY;
        this.selectedShape['cropHeight'] = resultCH;
        setGlobalPointAnchor(this.selectedShape, 0.5, 1, anchorG);
      }
    }

    this.updateSelectionOverlay(lc);
  }

  private onUp(_: { x: number; y: number }, lc: LCInstance): void {
    if (this.didDrag && this.selectedShape) {
      this.didDrag = false;

      let finalPosition = {
        x: this.selectedShape['x'] as number,
        y: this.selectedShape['y'] as number,
      };
      if (typeof this.selectedShape['getBoundingRect'] === 'function') {
        const br = (this.selectedShape['getBoundingRect'] as () => { x: number; y: number })();
        finalPosition = { x: br.x, y: br.y };
      }
      const finalScale = (this.selectedShape['scale'] as number) || 1;
      const finalRot = (this.selectedShape['rotation'] as number) || 0;
      const finalCrop = {
        x: (this.selectedShape['cropX'] as number) || 0,
        y: (this.selectedShape['cropY'] as number) || 0,
        w: (this.selectedShape['cropWidth'] as number) || 0,
        h: (this.selectedShape['cropHeight'] as number) || 0,
      };

      if (
        finalPosition.x !== this.initialPosition.x ||
        finalPosition.y !== this.initialPosition.y ||
        finalScale !== this.initialScale ||
        finalRot !== this.initialRotation ||
        finalCrop.x !== this.initialCrop.x ||
        finalCrop.y !== this.initialCrop.y ||
        finalCrop.w !== this.initialCrop.w ||
        finalCrop.h !== this.initialCrop.h
      ) {
        const action = new TransformAction(
          lc,
          this.selectedShape,
          {
            x: this.initialPosition.x,
            y: this.initialPosition.y,
            scale: this.initialScale,
            rotation: this.initialRotation,
            cropX: this.initialCrop.x,
            cropY: this.initialCrop.y,
            cropWidth: this.initialCrop.w,
            cropHeight: this.initialCrop.h,
          },
          {
            x: finalPosition.x,
            y: finalPosition.y,
            scale: finalScale,
            rotation: finalRot,
            cropX: finalCrop.x,
            cropY: finalCrop.y,
            cropWidth: finalCrop.w,
            cropHeight: finalCrop.h,
          },
        );

        const activeLc = lc as unknown as Record<string, unknown>;
        if (typeof activeLc['execute'] === 'function') {
          (activeLc['execute'] as (a: unknown) => void)(action);
        } else {
          action.do();
        }

        lc.trigger('shapeMoved', { shape: this.selectedShape });
        lc.trigger('drawingChange', {});
      }

      lc.repaintLayer('main');
      this._drawSelectCanvas(lc);
    }
  }

  private _drawSelectCanvas(lc: LCInstance): void {
    if (!this.selectCtx) return;
    this.selectCanvas.width = lc.canvas.width;
    this.selectCanvas.height = lc.canvas.height;
    this.selectCtx.clearRect(0, 0, this.selectCanvas.width, this.selectCanvas.height);
    const shapes = lc.shapes.map((shape: unknown, index: number) => {
      const LCglobal = (window as unknown as Record<string, unknown>)['LC'] as Record<
        string,
        unknown
      >;
      const createShape = LCglobal['createShape'] as (
        n: string,
        a: Record<string, unknown>,
      ) => unknown;
      if (shape && (shape as Record<string, unknown>)['className'] === 'Image') {
        return createShape('ImageSelectionOverlay', {
          shape: shape,
          overrideBg: '#' + this._intToHex(index + 1),
        });
      }
      return createShape('SelectionBox', {
        shape: shape,
        handleSize: 0,
        backgroundColor: '#' + this._intToHex(index + 1),
      });
    });
    const activeLc = lc as unknown as Record<string, unknown>;
    if (typeof activeLc['draw'] === 'function') {
      (activeLc['draw'] as (s: unknown[], c: unknown) => void)(shapes, this.selectCtx);
    }
  }

  private _intToHex(i: number): string {
    return ('000000' + i.toString(16)).slice(-6);
  }

  private _getPixel(
    x: number,
    y: number,
    lc: LCInstance,
    ctx: CanvasRenderingContext2D,
  ): number | null {
    const activeLc = lc as unknown as Record<string, unknown>;
    const p =
      typeof activeLc['drawingCoordsToClientCoords'] === 'function'
        ? (
            activeLc['drawingCoordsToClientCoords'] as (
              x: number,
              y: number,
            ) => { x: number; y: number }
          )(x, y)
        : { x, y };

    if (p.x < 0 || p.x >= this.selectCanvas.width || p.y < 0 || p.y >= this.selectCanvas.height)
      return null;

    try {
      const pixel = ctx.getImageData(p.x, p.y, 1, 1).data;
      if (pixel[3]) {
        const index = parseInt(this._rgbToHex(pixel[0], pixel[1], pixel[2]), 16) - 1;
        return index >= 0 ? index : null;
      }
    } catch {
      // empty
    }
    return null;
  }

  private _componentToHex(c: number): string {
    return ('0' + c.toString(16)).slice(-2);
  }
  private _rgbToHex(r: number, g: number, b: number): string {
    return `${this._componentToHex(r)}${this._componentToHex(g)}${this._componentToHex(b)}`;
  }
}
