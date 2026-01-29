import { Component, OnInit, OnDestroy, inject, PLATFORM_ID, effect } from '@angular/core';
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
  private currentFrameId: string | null = null;

  constructor() {
    // Watch for frame changes and reload editor data
    effect(() => {
      const selectedFrameId = this.store.currentFrameId();
      if (this.editor && selectedFrameId && selectedFrameId !== this.currentFrameId) {
        // Save current frame data before switching (use async to ensure completion)
        this.switchFrame(selectedFrameId);
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
    // Get the current frame or first frame
    const frames = this.store.frames();
    const currentFrame = frames.find((f) => f.id === this.store.currentFrameId()) || frames[0];
    if (currentFrame) {
      this.currentFrameId = currentFrame.id;
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
      data: currentFrame?.scriptData || {
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

  private async switchFrame(frameId: string) {
    if (!this.editor || this.isSaving) return;

    // First, save current frame data
    if (this.currentFrameId) {
      try {
        this.isSaving = true;
        const data = await this.editor.save();

        // Only save if there's actual content (not just empty blocks)
        if (data.blocks && data.blocks.length > 0) {
          this.store.updateScriptData(this.currentFrameId, data);
        } else {
          // Save null instead of empty blocks to avoid validation issues
          this.store.updateScriptData(this.currentFrameId, {
            blocks: [],
            time: Date.now(),
            version: '2.28.0',
          });
        }
      } catch (error) {
        console.error('Failed to save before frame switch:', error);
      } finally {
        this.isSaving = false;
      }
    }

    // Then load new frame data
    await this.loadFrameData(frameId);
  }

  private async loadFrameData(frameId: string) {
    if (!this.editor) return;

    const frames = this.store.frames();
    const frame = frames.find((f) => f.id === frameId);

    this.currentFrameId = frameId;

    // Prepare default empty data
    const emptyData = {
      blocks: [],
      time: Date.now(),
      version: '2.28.0',
    };

    let dataToRender = emptyData;

    if (frame?.scriptData && frame.scriptData.blocks && frame.scriptData.blocks.length > 0) {
      // Deep clone to ensure data integrity
      dataToRender = JSON.parse(JSON.stringify(frame.scriptData));

      // Validate and sanitize blocks
      dataToRender.blocks = dataToRender.blocks.filter((block: any) => {
        // Ensure each block has required properties and valid data
        if (!block || !block.type || block.data === undefined) {
          return false;
        }
        // Ensure paragraph blocks have text property
        if (block.type === 'paragraph' && typeof block.data.text !== 'string') {
          block.data.text = '';
        }
        return true;
      });

      // If all blocks were filtered out, use empty data
      if (dataToRender.blocks.length === 0) {
        dataToRender = emptyData;
      }
    }

    // Render new data
    try {
      await this.editor.render(dataToRender);
    } catch (error) {
      console.error('Failed to load frame data:', error, 'Data:', dataToRender);
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
    // Skip if already saving or no editor or no frame
    if (this.isSaving || !this.editor || !this.currentFrameId) {
      return;
    }

    this.isSaving = true;
    const frameIdAtSaveStart = this.currentFrameId;

    try {
      const data = await this.editor.save();

      // Only save if we're still on the same frame
      if (frameIdAtSaveStart !== this.currentFrameId) {
        return;
      }

      const frames = this.store.frames();
      const currentFrame = frames.find((f) => f.id === this.currentFrameId);

      // Normalize empty data
      const dataToSave =
        !data.blocks || data.blocks.length === 0
          ? { blocks: [], time: Date.now(), version: '2.28.0' }
          : data;

      // Only update if data has changed
      if (JSON.stringify(dataToSave) !== JSON.stringify(currentFrame?.scriptData)) {
        this.store.updateScriptData(this.currentFrameId, dataToSave);
      }
    } catch (error) {
      console.error('Failed to save editor data:', error);
    } finally {
      this.isSaving = false;
    }
  }

  private saveEditorDataSync() {
    // Synchronous save for component destruction to prevent data loss
    if (!this.editor || !this.currentFrameId) {
      return;
    }

    const frameId = this.currentFrameId;
    try {
      // Use the editor's save method but don't await it
      // Store the promise to potentially be handled elsewhere if needed
      this.editor
        .save()
        .then((data) => {
          const frames = this.store.frames();
          const currentFrame = frames.find((f) => f.id === frameId);
          if (JSON.stringify(data) !== JSON.stringify(currentFrame?.scriptData)) {
            this.store.updateScriptData(frameId, data);
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
