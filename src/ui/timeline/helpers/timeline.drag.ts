import { Injectable, inject, signal } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { TimelineActions } from './timeline.actions';

@Injectable({ providedIn: 'root' })
export class TimelineDrag {
  private readonly store = inject(AppStore);
  private readonly actions = inject(TimelineActions);

  draggingBoardId = signal<string | null>(null);
  dragOverBoardId = signal<string | null>(null);
  dragInsertIndex = signal<number>(-1);
  private dragStartIndex = -1;

  private touchStartX = 0;
  private touchStartY = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private isLongPressActivated = false;
  readonly longPressDuration = 500;

  private readonly GAP_SIZE = 20; // pixels

  startDrag(event: DragEvent, boardId: string, boardIndex: number): void {
    event.stopPropagation();
    this.draggingBoardId.set(boardId);
    this.dragStartIndex = boardIndex;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', boardId);
    }
  }

  handleDragOver(event: DragEvent, boardId: string): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.draggingBoardId() || this.draggingBoardId() === boardId) {
      return;
    }

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const mouseX = event.clientX;
    const boardCenterX = rect.left + rect.width / 2;

    const boards = this.store.boards();
    const targetIndex = boards.findIndex((b) => b.id === boardId);

    if (targetIndex !== -1) {
      let newInsertIndex: number;
      if (mouseX < boardCenterX) {
        newInsertIndex = targetIndex;
      } else {
        newInsertIndex = targetIndex + 1;
      }

      if (this.dragInsertIndex() !== newInsertIndex) {
        this.dragInsertIndex.set(newInsertIndex);
        this.dragOverBoardId.set(boardId);
      }
    }
  }

  handleDragLeave(event: DragEvent): void {
    event.preventDefault();
  }

  handleTrackDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.draggingBoardId() && event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  handleTrackDrop(event: DragEvent): void {
    this.handleDrop(event);
  }

  handleDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.applyDropFromCurrentState();
  }

  isTouchDragInProgress(): boolean {
    return this.longPressTimer !== null || this.isLongPressActivated || !!this.draggingBoardId();
  }

  handleDragEnd(event: DragEvent): void {
    event.preventDefault();
    this.resetDragState();
  }

  // --- Touch specific implementation ---
  startTouchDrag(event: TouchEvent, boardId: string, boardIndex: number): void {
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.dragStartIndex = boardIndex;
    this.isLongPressActivated = false;

    this.longPressTimer = setTimeout(() => {
      this.isLongPressActivated = true;
      this.draggingBoardId.set(boardId);
      this.dragStartIndex = boardIndex;
    }, this.longPressDuration);
  }

  handleTouchMove(event: TouchEvent): void {
    if (!this.isLongPressActivated && this.longPressTimer !== null) {
      const touch = event.touches[0];
      const deltaX = Math.abs(touch.clientX - this.touchStartX);
      const deltaY = Math.abs(touch.clientY - this.touchStartY);
      if (deltaX > 20 || deltaY > 20) {
        if (this.longPressTimer !== null) {
          clearTimeout(this.longPressTimer);
        }
        this.longPressTimer = null;
        this.resetDragState();
      }
      return;
    }

    if (!this.isLongPressActivated) return;

    if (event.cancelable) event.preventDefault();

    const touch = event.touches[0];
    const draggedBoardId = this.draggingBoardId();
    if (!draggedBoardId) return;

    const boards = document.querySelectorAll('.timeline-board');
    for (const board of Array.from(boards)) {
      const rect = board.getBoundingClientRect();
      if (touch.clientX >= rect.left && touch.clientX <= rect.right) {
        const boardId = board.getAttribute('data-board-id');
        if (boardId && boardId !== draggedBoardId) {
          const boardCenterX = rect.left + rect.width / 2;
          const targetIndex = this.store.boards().findIndex((b) => b.id === boardId);

          if (targetIndex !== -1) {
            const newInsertIndex = touch.clientX < boardCenterX ? targetIndex : targetIndex + 1;
            if (this.dragInsertIndex() !== newInsertIndex) {
              this.dragInsertIndex.set(newInsertIndex);
              this.dragOverBoardId.set(boardId);
            }
          }
        }
        break;
      }
    }
  }

  handleTouchEnd(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
    }
    this.longPressTimer = null;

    if (this.isLongPressActivated && this.draggingBoardId()) {
      this.applyDropFromCurrentState();
    } else {
      this.resetDragState();
    }

    this.isLongPressActivated = false;
  }

  private resetDragState(): void {
    this.draggingBoardId.set(null);
    this.dragOverBoardId.set(null);
    this.dragInsertIndex.set(-1);
    this.dragStartIndex = -1;
  }

  private applyDropFromCurrentState(): void {
    const draggedBoardId = this.draggingBoardId();
    if (!draggedBoardId) {
      this.resetDragState();
      return;
    }

    const insertIndex = this.dragInsertIndex();
    const startIndex = this.dragStartIndex;

    if (insertIndex !== -1 && startIndex !== -1) {
      let targetIndex = insertIndex;

      if (startIndex < insertIndex) {
        targetIndex = insertIndex - 1;
      }

      if (targetIndex !== startIndex) {
        this.store.reorderBoards(startIndex, targetIndex);
        this.actions.recordReorder(startIndex, targetIndex);
      }
    }

    this.resetDragState();
  }

  shouldShowSpaceBefore(boardIndex: number): boolean {
    const insertIndex = this.dragInsertIndex();
    const draggingIndex = this.dragStartIndex;

    if (insertIndex === -1 || draggingIndex === -1) {
      return false;
    }

    return (
      boardIndex === insertIndex && boardIndex !== draggingIndex && boardIndex !== draggingIndex + 1
    );
  }

  getBoardDragOffset(boardIndex: number): number {
    const insertIndex = this.dragInsertIndex();
    const draggingIndex = this.dragStartIndex;

    if (insertIndex === -1 || draggingIndex === -1) {
      return 0;
    }

    if (boardIndex === draggingIndex) {
      return 0;
    }

    // drag right
    if (draggingIndex < insertIndex) {
      if (boardIndex === insertIndex) {
        return this.GAP_SIZE;
      }
    }
    // drag left
    else if (draggingIndex > insertIndex) {
      if (boardIndex >= insertIndex && boardIndex < draggingIndex) {
        return this.GAP_SIZE;
      }
    }

    return 0;
  }
}
