import { Injectable, inject, signal } from '@angular/core';
import type { NewSettings } from 'src/ui/dialogs/settings-window/settings-inputs';
import { ThemeService, type Theme } from './theme.service';

@Injectable({ providedIn: 'root'})
export class SettingsService {
    private readonly themeService = inject(ThemeService);

    readonly theme = signal<Theme>('dark');
    readonly warning = signal<boolean>(true);
    readonly framerate = signal<'30' | '24' | '60'>('30');

    async onApplySettings(settings: NewSettings): Promise<void> {
      await this.setTheme(settings.theme);
      this.warning.set(settings.warning);
      this.framerate.set(settings.framerate);
    }

    private async setTheme(theme: Theme): Promise<void> {
        this.theme.set(theme);
        const newTheme = this.theme();
        this.themeService.applyTheme(newTheme);
    }
}