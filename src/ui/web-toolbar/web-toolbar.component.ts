import { Component, HostListener, inject, signal } from '@angular/core';
import { SbdService } from '../../app/app.sbd.service';
import { UndoRedoService } from '../../services/undo-redo.service';
import { ExportIpcService } from '../../services/export-ipc.service';
import { ThemeService } from '../../services/theme.service';
import { SaveService } from '../../services/save.service';

@Component({
  standalone: true,
  selector: 'app-web-toolbar',
  imports: [],
  templateUrl: './web-toolbar.component.html',
  styleUrl: './web-toolbar.component.css',
})
export class WebToolbarComponent {
  private readonly sbd = inject(SbdService);
  private readonly undoRedo = inject(UndoRedoService);
  private readonly exportIpc = inject(ExportIpcService);
  private readonly themeService = inject(ThemeService);
  private readonly saveService = inject(SaveService);

  readonly activeMenu = signal<string | null>(null);
  readonly isElectron = !!window.quickboard;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.menu-dropdown-container')) {
      this.closeMenu();
    }
  }

  toggleMenu(menu: string, event: MouseEvent): void {
    event.stopPropagation();
    this.activeMenu.set(this.activeMenu() === menu ? null : menu);
  }

  closeMenu(): void {
    this.activeMenu.set(null);
  }

  async triggerMobileSaveAs(): Promise<void> {
    const newName = window.prompt(
      'Enter file name without extension:',
      this.exportIpc.defaultPrefix() || 'project',
    );
    if (newName) {
      this.exportIpc.setProjectName(newName);
      await this.triggerMobileSave();
    }
  }

  triggerUndo(): void {
    this.undoRedo.triggerUndo();
  }

  triggerRedo(): void {
    this.undoRedo.triggerRedo();
  }

  setTheme(theme: 'system' | 'white' | 'light' | 'sepia' | 'dark' | 'black'): void {
    this.themeService.applyTheme(theme);
  }

  triggerMobileAbout(): void {
    window.alert(
      'QuickBoard\nA simple, web-based digital whiteboard for rough animation and sketching.',
    );
  }

  async triggerMobileSave(): Promise<void> {
    try {
      const zipData = await this.sbd.buildSbdZip();
      const blob = new Blob([new Uint8Array(zipData)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (this.exportIpc.defaultPrefix() || 'project') + '.sbd';
      a.click();
      URL.revokeObjectURL(url);
      this.saveService.saveStatus.set('Saved!');
      setTimeout(() => {
        if (this.saveService.saveStatus() === 'Saved!') {
          this.saveService.saveStatus.set(null);
        }
      }, 2000);
    } catch (e) {
      console.error('Save failed', e);
      window.alert('Failed to save file: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Failed to read file as base64.'));
          return;
        }

        const commaIndex = reader.result.indexOf(',');
        if (commaIndex === -1) {
          reject(new Error('Invalid file data.'));
          return;
        }

        resolve(reader.result.slice(commaIndex + 1));
      };

      reader.onerror = () => {
        reject(reader.error ?? new Error('Failed to read file.'));
      };

      reader.readAsDataURL(file);
    });
  }

  async triggerMobileLoad(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const base64 = await this.readFileAsBase64(file);
      await this.sbd.loadSbdZip(base64);
      this.undoRedo.clear();
      const stem = file.name.replace(/\.[^.]+$/, '');
      if (stem) this.exportIpc.setProjectName(stem);
    } catch (e) {
      console.error('Load failed', e);
      window.alert('Failed to load file: ' + (e instanceof Error ? e.message : String(e)));
    }
    input.value = '';
  }

  triggerMobileExport(): void {
    const list = this.sbd['store'].boards();
    this.exportIpc.settingsBoardCount.set(list.length);
    this.exportIpc.settingsVisible.set(true);
  }
}
