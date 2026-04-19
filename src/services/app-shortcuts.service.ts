import { inject, Injectable } from '@angular/core';
import { AppStore } from 'src/data';
import { CanvasComponent } from 'src/ui';
import { PlaybackService } from 'src/services';
import { UndoRedoService } from 'src/services';
import { TimelineActions } from 'src/ui';
import { TimelineZoomService } from './timeline-zoom.service';

@Injectable({ providedIn: 'root' })
export class AppShortcutsService { 

    private readonly store = inject(AppStore);
    private readonly playback = inject(PlaybackService);
    private readonly undoRedo = inject(UndoRedoService);
    private readonly actions = inject(TimelineActions);
    private readonly timeZoom = inject(TimelineZoomService);

    onNotCtrlKeyShortcuts(event: KeyboardEvent, canvas: CanvasComponent, shift: boolean) {
        const key = event.key.toLowerCase();
        const currentIndex = this.store.boards().findIndex((board) => board.id === this.store.currentBoardId());
        const ranges = this.playback.getTimeRanges();

        // event.preventDefault();
        switch(key) {
          case 's':
            canvas.switchTools('select');
          break;
          case 'i': {
            canvas.switchTools('image');
            const input = canvas.document.createElement('input') as HTMLInputElement;
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e: Event) => {
              const target = e.target as HTMLInputElement;
              if (target.files && target.files.length > 0) {
                canvas.toolbar()?.imageSelected.emit(target.files[0]);
              }
            };
            input.click();
            break;
          }
          case 'd':
            canvas.switchTools('pencil');
            break;
          case 'h':
            canvas.switchTools('rectangle');
            break;
          case 'e':
            canvas.switchTools('eraser');
            break;
          case 'f':
            canvas.switchTools('bucket-fill');
            break;
          case 'n': {
            event.preventDefault();
            if(canvas.toolbar()?.isDrawToolActive()) {
              const option = canvas.toolbar()?.selectedDrawToolOption();
              if(option?.id === 'pencil') {
                canvas.switchTools('brush');
              } else {
                canvas.switchTools('pencil');
              }
            } else if (canvas.toolbar()?.isEditToolActive()) {
              const option = canvas.toolbar()?.selectedEditToolOption();
              if(option?.id === 'select') {
                canvas.switchTools('image');
                canvas.toolbar()?.onActiveSubmenuSelect('image');
              } else {
                canvas.switchTools('select');
              }
            } else if (canvas.toolbar()?.isShapeToolActive()) {
              const option = canvas.toolbar()?.selectedShapeTool();
              switch(option?.id) {
                case 'rectangle':
                  canvas.switchTools('circle');
                  break;
                case 'circle':
                  canvas.switchTools('polygon');
                  break;
                default:
                  canvas.switchTools('rectangle');
              }
            } else if (canvas.toolbar()?.isEraserToolActive()){
              const option = canvas.toolbar()?.selectedEraserToolOption();
              if(option?.id === 'eraser') {
                canvas.switchTools('object-eraser');
              } else {
                canvas.switchTools('eraser');
              }
            }
            break;
          }
          case 'b': {
            event.preventDefault();
            if(canvas.toolbar()?.isDrawToolActive()) {
              const option = canvas.toolbar()?.selectedDrawToolOption();
              if(option?.id === 'pencil') {
                canvas.switchTools('brush');
              } else {
                canvas.switchTools('pencil');
              }
            } else if (canvas.toolbar()?.isEditToolActive()) {
              const option = canvas.toolbar()?.selectedEditToolOption();
              if(option?.id === 'select') {
                canvas.switchTools('image');
                canvas.toolbar()?.onActiveSubmenuSelect('image');
              } else {
                canvas.switchTools('select');
              }
            } else if (canvas.toolbar()?.isShapeToolActive()) {
              const option = canvas.toolbar()?.selectedShapeTool();
              switch(option?.id) {
                case 'rectangle':
                  canvas.switchTools('polygon');
                  break;
                case 'circle':
                  canvas.switchTools('rectangle');
                  break;
                default:
                  canvas.switchTools('circle');
              }
            } else if (canvas.toolbar()?.isEraserToolActive()){
              const option = canvas.toolbar()?.selectedEraserToolOption();
              if(option?.id === 'eraser') {
                canvas.switchTools('object-eraser');
              } else {
                canvas.switchTools('eraser');
              }
            }
            break;
          }
          case 'enter': {
            if (canvas.activeTool() === 'zoom') {
              const zoomCenter = canvas.lc?.canvas?.getBoundingClientRect
                ? (() => {
                    const rect = canvas.lc!.canvas.getBoundingClientRect();
                    return { x: (rect as DOMRect).left + (rect as DOMRect).width / 2, y: (rect as DOMRect).top + (rect as DOMRect).height / 2 };
                  })()
                : { x: canvas.canvasContainer().nativeElement.offsetLeft as number + (canvas.canvasContainer().nativeElement.offsetWidth as number) / 2, 
                  y: canvas.canvasContainer().nativeElement.offsetTop as number + (canvas.canvasContainer().nativeElement.offsetHeight as number) / 2  };

              if (shift) {
                canvas.viewport.adjustZoomLevel(-(canvas.viewport.getClickZoomStep() as number), zoomCenter);
              } else {
                canvas.viewport.adjustZoomLevel(canvas.viewport.getClickZoomStep() as number, zoomCenter);
              }
            } else if (canvas.activeTool() === 'image') {
              const input = canvas.document.createElement('input') as HTMLInputElement;
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = (e: Event) => {
                const target = e.target as HTMLInputElement;
                if (target.files && target.files.length > 0) {
                  canvas.toolbar()?.imageSelected.emit(target.files[0]);
                }
              };
              input.click();
            }
            break;
          }
          case 'tab': {
            event.preventDefault();
            if(canvas.toolbar()?.isDrawToolActive()) {
              canvas.switchTools(canvas.toolbar()?.selectedShapeTool()?.id as string);
            } else if (canvas.toolbar()?.isShapeToolActive()) {
              canvas.switchTools(canvas.toolbar()?.selectedEraserToolOption()?.id as string);
            } else if (canvas.toolbar()?.isEraserToolActive()) {
              canvas.switchTools('bucket-fill');
            } else if (canvas.toolbar()?.isEditToolActive()) {
              canvas.switchTools(canvas.toolbar()?.selectedDrawToolOption()?.id as string);
            } else if (canvas.activeTool() === 'bucket-fill') {
              canvas.switchTools('zoom');
            } else if (canvas.activeTool() === 'zoom') {
              canvas.switchTools(canvas.toolbar()?.selectedEditToolOption()?.id as string); 
            }
            break;
          } 
          case '.': {
            const nextBoardIndex = Math.min(this.store.boards().length - 1,currentIndex + 1);
            const nextBoardID = this.store.boards()[nextBoardIndex].id;
            this.store.setCurrentBoard(nextBoardID);
            this.playback.seek(ranges[nextBoardIndex].startTime);
            break;
          }
          case ',': {
            const prevBoardIndex = Math.max(0,currentIndex - 1);
            const prevBoardID = this.store.boards()[prevBoardIndex].id;
            this.store.setCurrentBoard(prevBoardID);
            this.playback.seek(ranges[prevBoardIndex].startTime);
            break;
          }
          case 'arrowright': {
            event.preventDefault();
            // if(shift) {
            //   shiftBoardRight
            // } else {
            this.store.setCurrentTime(this.store.currentTime() + 1);
            this.playback.seek(this.store.currentTime());
            break;
          }
          case 'arrowleft': {
            event.preventDefault();
            // if(shift) {
            //   shiftBoardLeft
            // } else {
            this.store.setCurrentTime(this.store.currentTime() - 1);
            this.playback.seek(this.store.currentTime());            
            break;
          }
          case 'arrowup': {
            event.preventDefault();
            break;
          }
          case 'arrowdown': {
            event.preventDefault();
            break;
          }
          case '+': {
            this.timeZoom.zoomIn();
            break;
          }
          case '-': {
            this.timeZoom.zoomOut();
            break;
          }
          default:
            return;
          }
    }

    onCtrlKeyShortcuts(event: KeyboardEvent, canvas: CanvasComponent, shift: boolean) {
      // actions with ctrl/cmd key
      const key = event.key.toLowerCase();
      const ranges = this.playback.getTimeRanges();

      event.preventDefault();
      switch (key) {
        case 'z': {
          if(shift) {
            this.undoRedo.triggerRedo();
            break;
          } else {
            this.undoRedo.triggerUndo();          
            break;
          }
        }
        case 'y': {
          this.undoRedo.triggerRedo();
          break;
        }
        case 'n': {
          if (shift) {
            this.store.addAudioLane();
          } else {
            this.store.addBoard();
          }
          break;
        }
        case 'd': {
          const currentBoardId = this.store.currentBoardId();
          if (currentBoardId) {
            this.actions.duplicateBoard(currentBoardId);
          }
          break;
        }
        case 'backspace': {
          if (shift) {
            canvas.requestClearCanvas();
          } else {
            const currentBoardId = this.store.currentBoardId();
            if (currentBoardId) {
              this.actions.deleteBoard(currentBoardId);
            }
          }
          break;
        }
        case 's': {
          if (shift) {
            window.quickboard?.requestSaveAs();
          } else {
            window.quickboard?.requestSave();
          }
          break;
        }
        case 'o': 
          window.quickboard?.loadIn();
          break;
        case 'e':
          window.quickboard?.requestExport();
          break;
        case '.': {
            const lastBoard = this.store.boards()[this.store.boards().length - 1].id;
            this.store.setCurrentBoard(lastBoard);
            this.playback.seek(ranges[this.store.boards().length - 1].startTime);
            break;
          }
        case ',': {
            const firstBoard = this.store.boards()[0].id;
            this.store.setCurrentBoard(firstBoard);
            this.playback.seek(ranges[0].startTime);
            break;
        }
        default:
          return;
      };
    }
}