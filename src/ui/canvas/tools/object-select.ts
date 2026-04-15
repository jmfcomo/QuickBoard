import { LCInstance, LCTool } from '../literally-canvas-interfaces';
import { getResizeCursorForAngle, getRotateCursor } from './object-select/cursors';
import { getGlobalPoint, ptToLocal, setGlobalPointAnchor } from './object-select/geometry';
import { registerObjectSelectShapes } from './object-select/register-shapes';
import { TransformAction } from './object-select/transform-action';
import { ImageHandleMode } from './object-select/types';

export { registerObjectSelectShapes };

export class ObjectSelectShape implements LCTool {
  name = 'ObjectSelectShape';
  iconName = 'object-select';
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
  private dragMode: ImageHandleMode = null;
  private didDrag = false;
  private readonly handlePad = 18;
  private readonly onCanvasPointerMove = (event: PointerEvent) =>
    this.updateCursorFromPointer(event);

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
    const unsub4 = lc.on('drawingChange', () => this._drawSelectCanvas(lc));
    this._selectShapeUnsubscribe = () => {
      if (typeof unsub1 === 'function') (unsub1 as () => void)();
      if (typeof unsub2 === 'function') (unsub2 as () => void)();
      if (typeof unsub3 === 'function') (unsub3 as () => void)();
      if (typeof unsub4 === 'function') (unsub4 as () => void)();
      lc.canvas.removeEventListener('pointermove', this.onCanvasPointerMove);
    };
    lc.canvas.addEventListener('pointermove', this.onCanvasPointerMove);
    this.setCursor('default');
    this._drawSelectCanvas(lc);
  }

  willBecomeInactive(lc: LCInstance): void {
    if (this._selectShapeUnsubscribe) this._selectShapeUnsubscribe();
    lc.canvas.removeEventListener('pointermove', this.onCanvasPointerMove);
    this.setCursor('default');
    lc.setShapesInProgress([]);
    this.selectedShape = null;
  }

  didBecomeInactive(): void {
    // Empty
  }

  public clearSelection(lc: LCInstance): void {
    if (this.selectedShape) {
      this.selectedShape = null;
      this.dragMode = null;
      this.setCursor('default');
      lc.trigger('shapeSelected', { selectedShape: null });
      lc.setShapesInProgress([]);
      lc.repaintLayer('main');
    }
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

      this.dragMode = this.getImageHandleMode(lx, ly, sw, sh);

      if (this.dragMode) {
        this.saveInitialState();
        this.setCursor(this.getCursorForMode(this.dragMode, this.selectedShape));
        if (this.dragMode === 'move') {
          const cx = (this.selectedShape['x'] as number) + sw / 2;
          const cy = (this.selectedShape['y'] as number) + sh / 2;
          this.dragOffset = { x: e.x - cx, y: e.y - cy };
        }
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
      this.setCursor(this.getCursorForMode('move', this.selectedShape));
      this.updateSelectionOverlay(lc);
    } else {
      this.selectedShape = null;
      this.setCursor('default');
      lc.trigger('shapeSelected', { selectedShape: null });
      lc.setShapesInProgress([]);
      lc.repaintLayer('main');
    }
  }

  private saveInitialState(): void {
    if (!this.selectedShape) return;
    this.initialPosition = this.getShapePosition(this.selectedShape);
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
      lc.setShapesInProgress([overlay]);
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
      lc.setShapesInProgress([overlay]);
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

      const finalPosition = this.getShapePosition(this.selectedShape);
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
        const isImageShape = this.selectedShape['className'] === 'Image';
        const fromState: Record<string, unknown> = {
          x: this.initialPosition.x,
          y: this.initialPosition.y,
        };
        const toState: Record<string, unknown> = {
          x: finalPosition.x,
          y: finalPosition.y,
        };

        if (isImageShape) {
          fromState['scale'] = this.initialScale;
          fromState['rotation'] = this.initialRotation;
          fromState['cropX'] = this.initialCrop.x;
          fromState['cropY'] = this.initialCrop.y;
          fromState['cropWidth'] = this.initialCrop.w;
          fromState['cropHeight'] = this.initialCrop.h;

          toState['scale'] = finalScale;
          toState['rotation'] = finalRot;
          toState['cropX'] = finalCrop.x;
          toState['cropY'] = finalCrop.y;
          toState['cropWidth'] = finalCrop.w;
          toState['cropHeight'] = finalCrop.h;
        }

        const action = new TransformAction(lc, this.selectedShape, fromState, toState);

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

    this.dragMode = null;
    this.setCursor(
      this.getCursorForMode(this.getHoverModeAtPoint(_, this.selectedShape), this.selectedShape),
    );
  }

  private getImageHandleMode(lx: number, ly: number, sw: number, sh: number): ImageHandleMode {
    const pad = this.handlePad;
    if (Math.abs(lx - sw / 2) < pad && Math.abs(ly + 25) < pad) return 'rotate';
    if (Math.abs(lx) < pad && Math.abs(ly) < pad) return 'tl';
    if (Math.abs(lx - sw) < pad && Math.abs(ly) < pad) return 'tr';
    if (Math.abs(lx) < pad && Math.abs(ly - sh) < pad) return 'bl';
    if (Math.abs(lx - sw) < pad && Math.abs(ly - sh) < pad) return 'br';
    if (Math.abs(lx - sw / 2) < pad && Math.abs(ly) < pad) return 'crop-t';
    if (Math.abs(lx - sw / 2) < pad && Math.abs(ly - sh) < pad) return 'crop-b';
    if (Math.abs(lx) < pad && Math.abs(ly - sh / 2) < pad) return 'crop-l';
    if (Math.abs(lx - sw) < pad && Math.abs(ly - sh / 2) < pad) return 'crop-r';
    if (lx >= 0 && lx <= sw && ly >= 0 && ly <= sh) return 'move';
    return null;
  }

  private getHoverModeAtPoint(
    point: { x: number; y: number },
    shape: Record<string, unknown> | null,
  ): ImageHandleMode {
    if (!shape || shape['className'] !== 'Image' || !shape['image']) {
      return null;
    }

    const { lx, ly, sw, sh } = ptToLocal(point.x, point.y, shape);
    return this.getImageHandleMode(lx, ly, sw, sh);
  }

  private getCursorForMode(mode: ImageHandleMode, shape: Record<string, unknown> | null): string {
    if (!mode) return 'default';
    const rotation = shape ? (shape['rotation'] as number) || 0 : 0;

    if (mode === 'move') {
      return this.dragMode === 'move' ? 'grabbing' : 'grab';
    }

    if (mode === 'rotate') {
      return getRotateCursor();
    }

    if (mode === 'crop-l' || mode === 'crop-r') {
      return getResizeCursorForAngle(rotation);
    }

    if (mode === 'crop-t' || mode === 'crop-b') {
      return getResizeCursorForAngle(rotation + Math.PI / 2);
    }

    if (mode === 'tl' || mode === 'br') {
      return getResizeCursorForAngle(rotation + Math.PI / 4);
    }

    if (mode === 'tr' || mode === 'bl') {
      return getResizeCursorForAngle(rotation - Math.PI / 4);
    }

    return 'default';
  }

  private updateCursorFromPointer(event: PointerEvent): void {
    if (this.dragMode) {
      this.setCursor(this.getCursorForMode(this.dragMode, this.selectedShape));
      return;
    }

    const point = this.pointerEventToDrawingPoint(event);
    const mode = this.getHoverModeAtPoint(point, this.selectedShape);
    this.setCursor(this.getCursorForMode(mode, this.selectedShape));
  }

  private pointerEventToDrawingPoint(event: PointerEvent): { x: number; y: number } {
    const activeLc = this.lc as unknown as Record<string, unknown>;

    if (typeof activeLc['clientCoordsToDrawingCoords'] === 'function') {
      return (
        activeLc['clientCoordsToDrawingCoords'] as (
          x: number,
          y: number,
        ) => { x: number; y: number }
      )(event.clientX, event.clientY);
    }

    const rect = this.lc.canvas.getBoundingClientRect();
    const x =
      (event.clientX - rect.left - this.lc.position.x / (this.lc.backingScale || 1)) /
      this.lc.scale;
    const y =
      (event.clientY - rect.top - this.lc.position.y / (this.lc.backingScale || 1)) / this.lc.scale;
    return { x, y };
  }

  private setCursor(cursor: string): void {
    this.lc.canvas.style.cursor = cursor;
  }

  private getShapePosition(shape: Record<string, unknown>): { x: number; y: number } {
    // Image shapes store top-left directly in x/y; using rotated bounding-box coords causes jump.
    if (shape['className'] === 'Image' || (shape['x'] !== undefined && shape['y'] !== undefined)) {
      return {
        x: (shape['x'] as number) || 0,
        y: (shape['y'] as number) || 0,
      };
    }

    if (typeof shape['getBoundingRect'] === 'function') {
      const br = (shape['getBoundingRect'] as () => { x: number; y: number })();
      return { x: br.x, y: br.y };
    }

    return { x: 0, y: 0 };
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
