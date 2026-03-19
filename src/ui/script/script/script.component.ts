import { Component, OnInit, OnDestroy, inject, PLATFORM_ID, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import EditorJS from '@editorjs/editorjs';
import type { OutputData, OutputBlockData } from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Paragraph from '@editorjs/paragraph';
import { AppStore } from '../../../data/store/app.store';
import { UndoRedoService, UndoReservation } from '../../../services/undo-redo.service';

@Component({
  selector: 'app-script',
  templateUrl: './script.component.html',
  styleUrls: ['./script.component.css'],
})
export class ScriptComponent implements OnInit, OnDestroy {
  private readonly store = inject(AppStore);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly undoRedo = inject(UndoRedoService);
  private editor: EditorJS | null = null;
  private saveInterval: ReturnType<typeof setInterval> | null = null;
  private isSaving = false;
  private currentBoardId: string | null = null;
  /** Snapshot of the script data at the start of the current editing session. */
  private _scriptBaseline: OutputData | null = null;
  /** True while we are restoring script data from an undo/redo command. */
  private _suppressScriptHistory = false;
  /** Debounce timer for capturing the editor's latest content. */
  private _changeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _editingSession: {
    reservation: UndoReservation;
    afterData: OutputData;
    boardId: string;
  } | null = null;
  /** Bound focusout listener so we can remove it on destroy. */
  private _focusoutHandler: ((e: FocusEvent) => void) | null = null;

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
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    if (this._changeDebounceTimer) {
      clearTimeout(this._changeDebounceTimer);
      this._changeDebounceTimer = null;
    }

    // Remove focusout listener
    if (this._focusoutHandler) {
      document.getElementById('editorjs')?.removeEventListener('focusout', this._focusoutHandler);
      this._focusoutHandler = null;
    }

    if (this._editingSession) {
      if (this.blocksKey(this._editingSession.afterData) !== this.blocksKey(this._scriptBaseline)) {
        this.commitEditingSession(this._editingSession);
      } else {
        this._editingSession.reservation.cancel();
      }
      this._editingSession = null;
    }

    // Perform final save before destruction
    this.saveEditorDataSync();

    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }
  }

  private initializeEditor() {
    const boards = this.store.boards();
    const currentBoard = boards.find((b) => b.id === this.store.currentBoardId()) || boards[0];
    if (currentBoard) {
      this.currentBoardId = currentBoard.id;
    }

    const initialData = currentBoard?.scriptData || {
      blocks: [],
      time: Date.now(),
      version: '2.28.0',
    };
    this._scriptBaseline = JSON.parse(JSON.stringify(initialData));

    this.editor = new EditorJS({
      holder: 'editorjs',
      autofocus: true,
      tools: {
        paragraph: Paragraph,
        header: Header,
        list: List,
      },
      placeholder: 'Start typing here...',
      data: initialData,
      onChange: () => {
        this.handleEditorChange();
      },
      onReady: () => {
        this.startAutoSave();
        this.installFocusOutListener();
      },
    });
  }

  private installFocusOutListener() {
    const editorEl = document.getElementById('editorjs');
    if (!editorEl) return;
    this._focusoutHandler = (e: FocusEvent) => {
      // Only finalize when focus moves OUTSIDE the editor's DOM tree.
      if (e.relatedTarget && editorEl.contains(e.relatedTarget as Node)) return;
      this.finalizeEditingSession();
    };
    editorEl.addEventListener('focusout', this._focusoutHandler);
  }

  private handleEditorChange() {
    if (this._suppressScriptHistory || !this.currentBoardId) return;

    // Start a new editing session if none is active.
    if (!this._editingSession) {
      const boardId = this.currentBoardId;
      const oldData: OutputData = JSON.parse(JSON.stringify(this._scriptBaseline));
      const reservation = this.undoRedo.reserve();
      this._editingSession = {
        reservation,
        afterData: JSON.parse(JSON.stringify(oldData)),
        boardId,
      };
    }

    // Debounce the async save so we capture the latest content without
    // hammering editor.save() on every keystroke.
    if (this._changeDebounceTimer) {
      clearTimeout(this._changeDebounceTimer);
    }
    this._changeDebounceTimer = setTimeout(() => {
      this._changeDebounceTimer = null;
      this.captureSessionData();
    }, 500);
  }

  private async switchBoard(boardId: string) {
    if (!this.editor || this.isSaving) return;

    this.isSaving = true;
    try {
      // Finalize any active editing session (captures latest data + commits undo)
      await this.finalizeEditingSession();

      // Persist latest editor content for the current board
      if (this.currentBoardId) {
        const data = await this.editor.save();
        const dataToSave =
          data.blocks && data.blocks.length > 0
            ? data
            : { blocks: [] as OutputBlockData[], time: Date.now(), version: '2.28.0' };
        this.store.updateScriptData(this.currentBoardId, dataToSave);
      }
    } catch (error) {
      console.error('Failed to save before board switch:', error);
    } finally {
      this.isSaving = false;
    }

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

    // Snapshot the data we just loaded as the baseline for undo tracking
    this._scriptBaseline = JSON.parse(JSON.stringify(dataToRender));
    // Release any suppression held by undo/redo-triggered board switches.
    this._suppressScriptHistory = false;
  }

  private startAutoSave() {
    // Auto-save every 5 seconds
    this.saveInterval = setInterval(() => {
      this.saveEditorData();
    }, 5000);
  }

  private async saveEditorData() {
    if (this.isSaving || !this.editor || !this.currentBoardId) return;

    this.isSaving = true;
    const boardIdAtSaveStart = this.currentBoardId;

    try {
      const data = await this.editor.save();

      if (boardIdAtSaveStart !== this.currentBoardId) return;

      const dataToSave =
        !data.blocks || data.blocks.length === 0
          ? { blocks: [] as OutputBlockData[], time: Date.now(), version: '2.28.0' }
          : data;

      const boards = this.store.boards();
      const currentBoard = boards.find((b) => b.id === this.currentBoardId);
      if (this.blocksKey(dataToSave) !== this.blocksKey(currentBoard?.scriptData ?? null)) {
        this.store.updateScriptData(this.currentBoardId, dataToSave);
      }

      // Keep the editing session's afterData up to date.
      if (this._editingSession && this._editingSession.boardId === this.currentBoardId) {
        this._editingSession.afterData = JSON.parse(JSON.stringify(dataToSave));
      }
    } catch (error) {
      console.error('Failed to save editor data:', error);
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Async save that updates both the store and the active editing session's
   * `afterData`.  Called from the onChange debounce.
   */
  private async captureSessionData() {
    if (!this.editor || !this.currentBoardId) return;

    // Delegate to the shared save logic which already updates the session.
    await this.saveEditorData();
  }

  private async finalizeEditingSession() {
    if (!this._editingSession) return;

    // Cancel pending debounce — we're about to capture now.
    if (this._changeDebounceTimer) {
      clearTimeout(this._changeDebounceTimer);
      this._changeDebounceTimer = null;
    }

    // Capture latest editor content into the session.
    await this.captureSessionData();

    const session = this._editingSession;
    this._editingSession = null;

    if (this.blocksKey(session.afterData) !== this.blocksKey(this._scriptBaseline)) {
      this.commitEditingSession(session);
      this._scriptBaseline = JSON.parse(JSON.stringify(session.afterData));
    } else {
      // No net content change — remove the reserved slot.
      session.reservation.cancel();
    }
  }

  /**
   * Fill in the undo/redo logic for a reserved slot.
   */
  private commitEditingSession(session: {
    reservation: UndoReservation;
    afterData: OutputData;
    boardId: string;
  }) {
    const oldData: OutputData = JSON.parse(JSON.stringify(this._scriptBaseline));
    const newData: OutputData = JSON.parse(JSON.stringify(session.afterData));
    const boardId = session.boardId;

    session.reservation.commit({
      undo: () => {
        this.discardEditingSession();
        this._suppressScriptHistory = true;
        this.store.updateScriptData(boardId, oldData);
        if (this.editor && this.currentBoardId === boardId) {
          this.editor
            .render(oldData)
            .catch((e) => console.error('undo render failed', e))
            .finally(() => {
              this._scriptBaseline = JSON.parse(JSON.stringify(oldData));
              this._suppressScriptHistory = false;
            });
        } else {
          this.store.setCurrentBoard(boardId);
        }
      },
      redo: () => {
        this.discardEditingSession();
        this._suppressScriptHistory = true;
        this.store.updateScriptData(boardId, newData);
        if (this.editor && this.currentBoardId === boardId) {
          this.editor
            .render(newData)
            .catch((e) => console.error('redo render failed', e))
            .finally(() => {
              this._scriptBaseline = JSON.parse(JSON.stringify(newData));
              this._suppressScriptHistory = false;
            });
        } else {
          this.store.setCurrentBoard(boardId);
        }
      },
    });
  }

  private discardEditingSession() {
    if (!this._editingSession) return;
    if (this._changeDebounceTimer) {
      clearTimeout(this._changeDebounceTimer);
      this._changeDebounceTimer = null;
    }
    this._editingSession.reservation.cancel();
    this._editingSession = null;
  }

  private blocksKey(data: OutputData | null): string {
    return JSON.stringify(data?.blocks ?? []);
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
