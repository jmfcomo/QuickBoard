import { inject, Injectable } from '@angular/core';
import { AppStore } from 'src/data';
import { CanvasComponent } from 'src/ui';
import { PlaybackService } from 'src/services';
import { UndoRedoService } from 'src/services';
import { TimelineActions } from 'src/ui';

@Injectable({ providedIn: 'root' })
export class AppShortcutsService { 

    private readonly store = inject(AppStore);
    private readonly playback = inject(PlaybackService);
    private readonly undoRedo = inject(UndoRedoService);
    private readonly actions = inject(TimelineActions);

    onNotCtrlKeyShortcuts(event: KeyboardEvent, canvas: CanvasComponent) {
        const key = event.key;
        const currentIndex = this.store.boards().findIndex((board) => board.id === this.store.currentBoardId());

        event.preventDefault();
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
          case 'Enter': {
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
            } else if (canvas.activeTool() === 'zoom') {
              const zoomCenter = canvas.lc?.canvas?.getBoundingClientRect
                ? (() => {
                    const rect = canvas.lc!.canvas.getBoundingClientRect();
                    return { x: (rect as DOMRect).left + (rect as DOMRect).width / 2, y: (rect as DOMRect).top + (rect as DOMRect).height / 2 };
                  })()
                : { x: canvas.canvasContainer().nativeElement.offsetLeft as number + (canvas.canvasContainer().nativeElement.offsetWidth as number) / 2, 
                  y: canvas.canvasContainer().nativeElement.offsetTop as number + (canvas.canvasContainer().nativeElement.offsetHeight as number) / 2  };

              if (event.shiftKey) {
                canvas.viewport.adjustZoomLevel(-(canvas.viewport.getClickZoomStep() as number), zoomCenter);
              } else {
                canvas.viewport.adjustZoomLevel(canvas.viewport.getClickZoomStep() as number, zoomCenter);
              }
            }
            break;
          }
          case 'Tab': {
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
              canvas.switchTools('select'); 
            }
            break;
          } 
          case '.': {
            const nextBoardIndex = Math.min(this.store.boards().length - 1,currentIndex + 1);
            const nextBoardID = this.store.boards()[nextBoardIndex].id;
            this.store.setCurrentBoard(nextBoardID);
            break;
          }
          case ',': {
            const prevBoardIndex = Math.max(0,currentIndex - 1);
            const prevBoardID = this.store.boards()[prevBoardIndex].id;
            this.store.setCurrentBoard(prevBoardID);
            break;
          }
          case 'ArrowRight': {
            event.preventDefault();
            this.store.setCurrentTime(this.store.currentTime() + 1);
            this.playback.seek(this.store.currentTime());
            break;
          }
          case 'ArrowLeft': {
            event.preventDefault();
            this.store.setCurrentTime(this.store.currentTime() - 1);
            this.playback.seek(this.store.currentTime());
            break;
          }
          default:
            return;
          }
    }

    onCtrlKeyShortcuts(event: KeyboardEvent, canvas: CanvasComponent) {
      // actions with ctrl/cmd key
      const key = event.key;
      event.preventDefault();
      switch (key) {
        case 'z': {
          if (event.shiftKey) {
            // Redo
            this.undoRedo.triggerRedo();
          } else {
            // Undo
            this.undoRedo.triggerUndo();
          }
          break;
        }
        case 'y': {
          this.undoRedo.triggerRedo();
          break;
        }
        case 'n': {
          if (event.shiftKey) {
            // Add Lane
            this.store.addAudioLane();
          } else {
            // Add Board
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
          if (event.shiftKey) {
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
          if (event.shiftKey) {
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
            break;
          }
        case ',': {
            const firstBoard = this.store.boards()[0].id;
            this.store.setCurrentBoard(firstBoard);
            break;
        }
        default:
          return;
      };
    }
}