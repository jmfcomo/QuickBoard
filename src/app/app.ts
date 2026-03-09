import { Component, ElementRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CanvasComponent } from '../ui/canvas/canvas/canvas.component';
import { ScriptComponent } from '../ui/script/script/script.component';
import { TimelineComponent } from '../ui/timeline/timeline/timeline.component';
import { SbdService } from './app.sbd.service';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-root',
  imports: [CanvasComponent, ScriptComponent, TimelineComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('QuickBoard');
  private readonly sbd = inject(SbdService);
  private readonly el = inject(ElementRef);
  private removeRequestSaveListener?: () => void;
  private removeLoadDataListener?: () => void;
  private removeThemeListener?: () => void;
  private readonly themeService = inject(ThemeService);

  ngOnInit() {
    if (window.quickboard?.onRequestSave) {
      this.removeRequestSaveListener = window.quickboard.onRequestSave(async (payload) => {
        try {
          const zipData = await this.sbd.buildSbdZip();
          window.quickboard?.sendSaveBinary({ filePath: payload.filePath, data: zipData });
        } catch (err) {
          console.error('Failed to build .sbd file:', err);
        }
      });
    }

    if (window.quickboard?.onLoadData) {
      this.removeLoadDataListener = window.quickboard.onLoadData(async (payload) => {
        try {
          if (payload.isBinary) {
            await this.sbd.loadSbdZip(payload.content);
          } else {
            // Legacy plain-JSON fallback
            this.sbd.loadLegacyJson(payload.content);
          }
        } catch (err) {
          console.error('Failed to load data from file:', err);
          const message = err instanceof Error ? err.message : String(err);
          window.alert(`Failed to load file: ${message}`);
        }
      });
    }

    this.removeThemeListener = this.themeService.initTheme();
  }

  onResizeMouseDown(e: MouseEvent) {
    e.preventDefault();
    const host = this.el.nativeElement as HTMLElement;
    const editors = host.querySelector('.editors') as HTMLElement;
    const app = host.querySelector('.app') as HTMLElement;
    const startY = e.clientY;
    const startHeight = editors.getBoundingClientRect().height;
    const totalHeight = app.getBoundingClientRect().height;

    const onMove = (ev: MouseEvent) => {
      const newHeight = Math.min(Math.max(startHeight + ev.clientY - startY, 100), totalHeight - 100);
      host.style.setProperty('--editors-height', newHeight + 'px');
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  ngOnDestroy() {
    this.removeRequestSaveListener?.();
    this.removeLoadDataListener?.();
    this.removeThemeListener?.();
  }
}
