import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import { AppStore } from '../../../data/store/app.store';

@Component({
  selector: 'app-script',
  templateUrl: './script.component.html',
  styleUrls: ['./script.component.css'],
})
export class ScriptComponent implements OnInit, OnDestroy {
  private readonly store = inject(AppStore);
  editor: EditorJS | null = null;
  private saveInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.initializeEditor();
    this.startAutoSave();
  }

  ngOnDestroy() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    this.saveEditorData();
  }

  private initializeEditor() {
    // Load existing data from store if available
    const savedData = this.store.scriptData();

    this.editor = new EditorJS({
      holder: 'editorjs',
      autofocus: true,
      tools: {
        header: Header,
        list: List,
      },
      placeholder: 'Start typing here...',
      data: savedData || {
        blocks: [],
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
    if (this.editor) {
      try {
        const data = await this.editor.save();
        const currentData = this.store.scriptData();

        // Only update if data has changed
        if (JSON.stringify(data) !== JSON.stringify(currentData)) {
          this.store.updateScriptData(data);
        }
      } catch (error) {
        console.error('Failed to save editor data:', error);
      }
    }
  }
}
