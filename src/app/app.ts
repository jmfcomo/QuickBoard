import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CanvasComponent } from '../ui/canvas/canvas/canvas.component';
import { ScriptComponent } from '../ui/script/script/script.component';
import { TimelineComponent } from '../ui/timeline/timeline/timeline.component';
import { AppStore } from '../data/store/app.store';

@Component({
  selector: 'app-root',
  imports: [CanvasComponent, ScriptComponent, TimelineComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('QuickBoard');
  private readonly store = inject(AppStore);
  private removeRequestSaveListener?: () => void;
  private removeLoadDataListener?: () => void;

  ngOnInit() {
    if (window.quickboard?.onRequestSave) {
      this.removeRequestSaveListener = window.quickboard.onRequestSave((payload) => {
        const data = this.store.exportAsJson();
        window.quickboard?.sendSaveData({ filePath: payload.filePath, data });
      });
    }

    if (window.quickboard?.onLoadData) {
      this.removeLoadDataListener = window.quickboard.onLoadData((payload) => {
        try {
          this.store.loadFromJson(payload.content);
        } catch (err) {
          console.error('Failed to load data from file:', err);
          const message = err instanceof Error ? err.message : String(err);
          window.alert(`Failed to load file: ${message}`);
        }
      });
    }
  }

  ngOnDestroy() {
    this.removeRequestSaveListener?.();
    this.removeLoadDataListener?.();
  }
}
