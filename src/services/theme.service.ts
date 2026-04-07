import { Injectable } from '@angular/core';

type Theme = 'system' | 'light' | 'sepia' | 'dark' | 'black';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly THEME_STORAGE_KEY = 'qb-theme';

  initTheme(): () => void {
    window.quickboard
      ?.getThemeSource?.()
      .then((source: Theme) => this.applyTheme(source));

    let removeListener: (() => void) | undefined;
    if (window.quickboard?.onThemeChanged) {
      removeListener = window.quickboard.onThemeChanged((theme: Theme) =>
        this.applyTheme(theme),
      );
    }

    return () => {
      removeListener?.();
    };
  }

  applyTheme(source: Theme): void {
    const root = document.documentElement;
    // Store theme preference for persistence
    localStorage.setItem(this.THEME_STORAGE_KEY, source);

    // Sync custom theme to main process for menu state consistency
    if (source === 'sepia' || source === 'dark' || source === 'black') {
      window.quickboard?.setCustomTheme?.(source);
    } else {
      window.quickboard?.setCustomTheme?.(null);
    }

    if (source === 'system') {
      root.removeAttribute('data-theme');
    } else if (source === 'light') {
      root.removeAttribute('data-theme');
    } else {
      // Custom themes: sepia, dark, black
      root.setAttribute('data-theme', source);
    }
  }

  getStoredTheme(): Theme | null {
    const stored = localStorage.getItem(this.THEME_STORAGE_KEY);
    if (stored && ['system', 'light', 'sepia', 'dark', 'black'].includes(stored)) {
      return stored as Theme;
    }
    return null;
  }
}
