import { Injectable, signal } from '@angular/core';
import { appSettings } from 'src/settings-loader';

type Theme = 'system' | 'white' | 'light' | 'sepia' | 'dark' | 'black';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly THEME_STORAGE_KEY = 'qb-theme';
  private mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private lastCustomThemeSent: Theme | null | undefined;

  readonly currentTheme = signal<Theme>('system');

  initTheme(): () => void {
    const storedTheme = this.getStoredTheme();
    if (storedTheme) {
      this.applyTheme(storedTheme);
    } else {
      window.quickboard
        ?.getThemeSource?.()
        ?.then((source: Theme) => this.applyTheme(source as Theme));
    }

    let removeAppListener: (() => void) | undefined;
    if (window.quickboard?.onThemeChanged) {
      removeAppListener = window.quickboard.onThemeChanged((theme: string) =>
        this.applyTheme(theme as Theme),
      );
    }

    const osListener = () => {
      const stored = this.getStoredTheme() || 'system';
      if (stored === 'system') {
        this.applyTheme('system');
      }
    };
    this.mediaQuery.addEventListener('change', osListener);

    return () => {
      removeAppListener?.();
      this.mediaQuery.removeEventListener('change', osListener);
    };
  }

  applyTheme(source: Theme): void {
    const root = document.documentElement;
    localStorage.setItem(this.THEME_STORAGE_KEY, source);
    this.currentTheme.set(source);

    const customTheme = source === 'system' ? null : source;
    if (customTheme !== this.lastCustomThemeSent) {
      window.quickboard?.setCustomTheme?.(customTheme);
      this.lastCustomThemeSent = customTheme;
    }

    let activeTheme = source;
    if (source === 'system') {
      activeTheme = this.mediaQuery.matches
        ? (appSettings.theme.systemDarkTheme as Theme)
        : (appSettings.theme.systemLightTheme as Theme);
    }

    if (source === 'system' && activeTheme === 'white') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', activeTheme);
    }
  }

  getStoredTheme(): Theme | null {
    const stored = localStorage.getItem(this.THEME_STORAGE_KEY);
    if (stored && ['system', 'white', 'light', 'sepia', 'dark', 'black'].includes(stored)) {
      return stored as Theme;
    }
    return null;
  }
}
