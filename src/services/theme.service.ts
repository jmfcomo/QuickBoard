import { Injectable } from '@angular/core';
import appSettings from '@econfig/appsettings.json';

type Theme = 'system' | 'white' | 'light' | 'sepia' | 'dark' | 'black';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly THEME_STORAGE_KEY = 'qb-theme';
  private mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  initTheme(): () => void {
    window.quickboard
      ?.getThemeSource?.()
      .then((source: Theme) => this.applyTheme(source as Theme));

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

    if (source === 'system') {
      window.quickboard?.setCustomTheme?.(null);
    } else {
      window.quickboard?.setCustomTheme?.(source);
    }

    let activeTheme = source;
    if (source === 'system') {
      activeTheme = this.mediaQuery.matches 
        ? (appSettings.theme.systemDarkTheme as Theme)
        : (appSettings.theme.systemLightTheme as Theme);
    }

    if (activeTheme === 'white') {
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
