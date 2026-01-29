import { Component, OnInit, OnDestroy, inject, PLATFORM_ID, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import EditorJS from '@editorjs/editorjs';
import type { OutputBlockData } from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Paragraph from '@editorjs/paragraph';
import { AppStore } from '../../../data/store/app.store';

@Component({
  selector: 'app-script',
  templateUrl: './script.component.html',
  styleUrls: ['./script.component.css'],
})
export class ScriptComponent implements OnInit, OnDestroy {
  private readonly store = inject(AppStore);
  private readonly platformId = inject(PLATFORM_ID);
  private editor: EditorJS | null = null;
  private saveInterval: ReturnType<typeof setInterval> | null = null;
  private isSaving = false;
  private currentBoardId: string | null = null;

  constructor() {
    // Watch for board changes and reload editor data
    effect(() => {
      const selectedBoardId = this.store.currentBoardId();
      if (this.editor && selectedBoardId && selectedBoardId !== this.currentBoardId) {
        // Save current board data before switching (use async to ensure completion)
        this.switchBoard(selectedBoardId);
      }
    });
  }

  ngOnInit() {
    // Ensure we are in the browser and not in SSR or test environment
    if (isPlatformBrowser(this.platformId)) {
      this.initializeEditor();
    }
  }

  ngOnDestroy() {
    // Clear the auto-save interval
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    // Perform final synchronous save before destruction
    this.saveEditorDataSync();

    // Clean up EditorJS instance
    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }
  }

  private initializeEditor() {
    // Get the current board or first board
    const boards = this.store.boards();
    const currentBoard = boards.find((b) => b.id === this.store.currentBoardId()) || boards[0];
    if (currentBoard) {
      this.currentBoardId = currentBoard.id;
    }

    this.editor = new EditorJS({
      holder: 'editorjs',
      autofocus: true,
      tools: {
        paragraph: Paragraph,
        header: Header,
        list: List,
      },
      placeholder: 'Start typing here...',
      data: currentBoard?.scriptData || {
        blocks: [],
        time: Date.now(),
        version: '2.28.0',
      },
      onReady: () => {
        // Start auto-save only after editor is fully initialized
        this.startAutoSave();
      },
    });
  }

  private async switchBoard(boardId: string) {
    if (!this.editor || this.isSaving) return;

    // First, save current board data
    if (this.currentBoardId) {
      try {
        this.isSaving = true;
        const data = await this.editor.save();

        // Only save if there's actual content (not just empty blocks)
        if (data.blocks && data.blocks.length > 0) {
          this.store.updateScriptData(this.currentBoardId, data);
        } else {
          // Save null instead of empty blocks to avoid validation issues
          this.store.updateScriptData(this.currentBoardId, {
            blocks: [],
            time: Date.now(),
            version: '2.28.0',
          });
        }
      } catch (error) {
        console.error('Failed to save before board switch:', error);
      } finally {
        this.isSaving = false;
      }
    }

    // Then load new board data
    await this.loadBoardData(boardId);
  }

  private async loadBoardData(boardId: string) {
    if (!this.editor) return;

    const boards = this.store.boards();
    const board = boards.find((b) => b.id === boardId);

    this.currentBoardId = boardId;

    // Prepare default empty data
    const emptyData = {
      blocks: [],
      time: Date.now(),
      version: '2.28.0',
    };

    let dataToRender = emptyData;

    if (board?.scriptData && board.scriptData.blocks && board.scriptData.blocks.length > 0) {
      // Deep clone to ensure data integrity
      dataToRender = JSON.parse(JSON.stringify(board.scriptData));

      // Validate and sanitize blocks
      dataToRender.blocks = dataToRender.blocks.filter(
        (block: OutputBlockData<string, { text?: string }> | null | undefined) => {
          // Ensure each block has required properties and valid data
          if (!block || !block.type || block.data === undefined) {
            return false;
          }
          // Ensure paragraph blocks have text property
          if (block.type === 'paragraph' && typeof block.data.text !== 'string') {
            block.data.text = '';
          }
          return true;
        },
      );

      // If all blocks were filtered out, use empty data
      if (dataToRender.blocks.length === 0) {
        dataToRender = emptyData;
      }
    }

    // Render new data
    try {
      await this.editor.render(dataToRender);
    } catch (error) {
      console.error('Failed to load board data:', error, 'Data:', dataToRender);
      // Fallback to completely empty editor
      try {
        await this.editor.render(emptyData);
      } catch (fallbackError) {
        console.error('Fallback render also failed:', fallbackError);
      }
    }
  }

  private startAutoSave() {
    // Auto-save every 5 seconds
    this.saveInterval = setInterval(() => {
      this.saveEditorData();
    }, 5000);
  }

  private async saveEditorData() {
    // Skip if already saving or no editor or no board
    if (this.isSaving || !this.editor || !this.currentBoardId) {
      return;
    }

    this.isSaving = true;
    const boardIdAtSaveStart = this.currentBoardId;

    try {
      const data = await this.editor.save();

      // Only save if we're still on the same board
      if (boardIdAtSaveStart !== this.currentBoardId) {
        return;
      }

      const boards = this.store.boards();
      const currentBoard = boards.find((b) => b.id === this.currentBoardId);

      // Normalize empty data
      const dataToSave =
        !data.blocks || data.blocks.length === 0
          ? { blocks: [], time: Date.now(), version: '2.28.0' }
          : data;

      // Only update if data has changed
      if (JSON.stringify(dataToSave) !== JSON.stringify(currentBoard?.scriptData)) {
        this.store.updateScriptData(this.currentBoardId, dataToSave);
      }
    } catch (error) {
      console.error('Failed to save editor data:', error);
    } finally {
      this.isSaving = false;
    }
  }

  private saveEditorDataSync() {
    // Synchronous save for component destruction to prevent data loss
    if (!this.editor || !this.currentBoardId) {
      return;
    }

    const boardId = this.currentBoardId;
    try {
      // Use the editor's save method but don't await it
      // Store the promise to potentially be handled elsewhere if needed
      this.editor
        .save()
        .then((data) => {
          const boards = this.store.boards();
          const currentBoard = boards.find((b) => b.id === boardId);
          if (JSON.stringify(data) !== JSON.stringify(currentBoard?.scriptData)) {
            this.store.updateScriptData(boardId, data);
          }
        })
        .catch((error) => {
          console.error('Failed to save editor data on destroy:', error);
        });
    } catch (error) {
      console.error('Failed to initiate save on destroy:', error);
    }
  }
}
