import { Injectable } from '@angular/core';

export interface CachedBoardData {
  shapes?: unknown[];
  backgroundShapes?: unknown[];
  snapshot: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root',
})
export class CanvasDataService {
  private readonly dataMap = new Map<string, CachedBoardData>();

  setCanvasData(boardId: string, data: Record<string, unknown> | CachedBoardData | null): void {
    if (!data) {
      this.dataMap.delete(boardId);
      return;
    }

    if ('snapshot' in data && data.snapshot && !Array.isArray(data.snapshot)) {
      this.dataMap.set(boardId, data as CachedBoardData);
    } else {
      this.dataMap.set(boardId, { snapshot: data as Record<string, unknown> });
    }
  }

  getCanvasData(boardId: string): Record<string, unknown> | null {
    return this.dataMap.get(boardId)?.snapshot || null;
  }

  getBoardCache(boardId: string): CachedBoardData | null {
    return this.dataMap.get(boardId) || null;
  }

  deleteCanvasData(boardId: string): void {
    this.dataMap.delete(boardId);
  }

  clear(): void {
    this.dataMap.clear();
  }
}
