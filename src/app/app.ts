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
  private removeThemeListener?: () => void;

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

    this.initTheme();
  }

  ngOnDestroy() {
    this.removeRequestSaveListener?.();
    this.removeLoadDataListener?.();
    this.removeThemeListener?.();
  }

  private initTheme(): void {
    // Apply the initial theme from Electron (or fall back to system)
    window.quickboard?.getThemeSource?.().then((source) => this.applyTheme(source));

    if (window.quickboard?.onThemeChanged) {
      this.removeThemeListener = window.quickboard.onThemeChanged((theme) =>
        this.applyTheme(theme),
      );
    }
  }

  private applyTheme(source: 'system' | 'light' | 'dark'): void {
    const root = document.documentElement;
    if (source === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', source);
    }
  }
}
