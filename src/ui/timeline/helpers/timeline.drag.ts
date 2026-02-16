import { Injectable, inject, signal } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';

@Injectable({ providedIn: 'root' })
export class TimelineDrag {
  private readonly store = inject(AppStore);

  draggingBoardId = signal<string | null>(null);
  dragOverBoardId = signal<string | null>(null);
  dragInsertIndex = signal<number>(-1);
  private dragStartIndex = -1;

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
      }
    }

    this.resetDragState();
  }

  handleDragEnd(event: DragEvent): void {
    event.preventDefault();
    this.resetDragState();
  }

  private resetDragState(): void {
    this.draggingBoardId.set(null);
    this.dragOverBoardId.set(null);
    this.dragInsertIndex.set(-1);
    this.dragStartIndex = -1;
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
