import { Component, input, output, signal } from '@angular/core';
export { ThemeService } from 'src/services';
import { appSettings } from 'src/settings-loader';
import { NewSettings } from './settings-inputs';

@Component({
  selector: 'app-settings-window',
  standalone: true,
  templateUrl: './settings-window.component.html',
  styleUrl: './settings-window.component.css',
})
export class SettingsWindowComponent {
  warning = input<boolean>(appSettings.export.showClearCanvasWarning);
  theme = input<'system' | 'white' | 'black' | 'light' | 'sepia' | 'dark'>('system');
  framerate = input<'30' | '24' | '60'>('24');
  volume = input<number>(appSettings.audio.defaultVolume);
  newSettings = output<NewSettings>();

  protected clearCanvas = signal(this.warning());
  protected setTheme = signal(this.theme());
  protected setFramerate = signal(this.framerate());
  protected setVolume = signal(this.volume());

  protected onWarningChange(event: Event): void {
    const warn = (event.target as HTMLInputElement).checked
    this.clearCanvas.set(warn);
  }

  protected onFPSChange(event: Event): void {
    const newFPS = (event.target as HTMLSelectElement).value;
    switch (newFPS) {
      case '30':
        this.setFramerate.set(newFPS);
        break;
      case '24':
        this.setFramerate.set(newFPS);
        break;
      case '60':
        this.setFramerate.set(newFPS);
        break;
      default:
        this.setFramerate.set('30');
        break;
    }
  }

  protected onThemeChange(theme: Event): void {
    const newTheme = (theme.target as HTMLSelectElement).value;
    switch (newTheme) {
      case 'system':
        this.setTheme.set(newTheme);
        break;
      case 'white':
        this.setTheme.set(newTheme);
        break;
      case 'light':
        this.setTheme.set(newTheme);
        break;        
      case 'black':
        this.setTheme.set(newTheme);
        break;
      case 'sepia':
        this.setTheme.set(newTheme);
        break;
      case 'dark':
        this.setTheme.set(newTheme);
        break;
      default:
        this.setTheme.set('system');
        break;
    }
  }

  protected onVolumeChange(event: Event): void {
    const newVolume = parseInt((event.target as HTMLInputElement).value, 10);
    if(isNaN(newVolume)) {
      this.setVolume.set(newVolume);
    }
    else {
      this.setVolume.set(1);
    }
  }

  protected applyChanges(): void {
    this.newSettings.emit({
      warning: this.warning(),
      theme: this.theme(),
      framerate: this.framerate(),
      volume: this.setVolume()
    })
    
  }
}
