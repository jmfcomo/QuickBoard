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
    const currentIndex = this.store
      .boards()
      .findIndex((board) => board.id === this.store.currentBoardId());
    const ranges = this.playback.getTimeRanges();

    // event.preventDefault();
    switch (key) {
      case '.': {
        const nextBoardIndex = Math.min(this.store.boards().length - 1, currentIndex + 1);
        const nextBoardID = this.store.boards()[nextBoardIndex].id;
        this.store.setCurrentBoard(nextBoardID);
        this.playback.seek(ranges[nextBoardIndex].startTime);
        break;
      }
      case ',': {
        const prevBoardIndex = Math.max(0, currentIndex - 1);
        const prevBoardID = this.store.boards()[prevBoardIndex].id;
        this.store.setCurrentBoard(prevBoardID);
        this.playback.seek(ranges[prevBoardIndex].startTime);
        break;
      }
      case 'arrowright': {
        event.preventDefault();
        if (shift) {
          const nextBoardIndex = Math.min(this.store.boards().length - 1, currentIndex + 1);
          this.store.reorderBoards(currentIndex, nextBoardIndex);
          this.playback.seek(ranges[currentIndex].endTime);
          this.store.setCurrentBoard(this.store.boards()[nextBoardIndex].id);
        } else {
          this.store.setCurrentTime(this.store.currentTime() + 1);
          this.playback.seek(this.store.currentTime());
        }
        break;
      }
      case 'arrowleft': {
        event.preventDefault();
        if (shift) {
          const prevBoardIndex = Math.max(0, currentIndex - 1);
          this.store.reorderBoards(currentIndex, prevBoardIndex);
          this.playback.seek(ranges[prevBoardIndex].startTime);
          this.store.setCurrentBoard(this.store.boards()[prevBoardIndex].id);
        } else {
          this.store.setCurrentTime(this.store.currentTime() - 1);
          this.playback.seek(this.store.currentTime());
        }
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
        if (shift) {
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
    }
  }

  onAltKeyShortcuts(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    const currentIndex = this.store
      .boards()
      .findIndex((board) => board.id === this.store.currentBoardId());
    const ranges = this.playback.getTimeRanges();

    if (key === 'arrowright') {
      this.store.updateBoardDuration(
        this.store.boards()[currentIndex]?.id,
        (ranges[currentIndex].endTime += 0.5)
      );
    } else if (key === 'arrowleft') {
      this.store.updateBoardDuration(
        this.store.boards()[currentIndex]?.id,
        Math.max(0.5, (ranges[currentIndex].endTime -= 0.5))
      );
    }
  }
}
