import { Component, OnInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import EditorJS from '@editorjs/editorjs';
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
    // Load existing data from store if available
    const savedData = this.store.scriptData();

    this.editor = new EditorJS({
      holder: 'editorjs',
      autofocus: true,
      tools: {
        paragraph: Paragraph,
        header: Header,
        list: List,
      },
      placeholder: 'Start typing here...',
      data: savedData || {
        blocks: [],
      },
      onReady: () => {
        // Start auto-save only after editor is fully initialized
        this.startAutoSave();
      },
    });
  }

  private startAutoSave() {
    // Auto-save every 5 seconds
    this.saveInterval = setInterval(() => {
      this.saveEditorData();
    }, 5000);
  }

  private async saveEditorData() {
    // Skip if already saving or no editor
    if (this.isSaving || !this.editor) {
      return;
    }

    this.isSaving = true;
    try {
      const data = await this.editor.save();
      const currentData = this.store.scriptData();

      // Only update if data has changed
      if (JSON.stringify(data) !== JSON.stringify(currentData)) {
        this.store.updateScriptData(data);
      }
    } catch (error) {
      console.error('Failed to save editor data:', error);
    } finally {
      this.isSaving = false;
    }
  }

  private saveEditorDataSync() {
    // Synchronous save for component destruction to prevent data loss
    if (!this.editor) {
      return;
    }

    try {
      // Use the editor's save method but don't await it
      // Store the promise to potentially be handled elsewhere if needed
      this.editor
        .save()
        .then((data) => {
          const currentData = this.store.scriptData();
          if (JSON.stringify(data) !== JSON.stringify(currentData)) {
            this.store.updateScriptData(data);
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
