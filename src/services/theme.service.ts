import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  initTheme(): () => void {
    window.quickboard
      ?.getThemeSource?.()
      .then((source: 'system' | 'light' | 'dark') => this.applyTheme(source));

    let removeListener: (() => void) | undefined;
    if (window.quickboard?.onThemeChanged) {
      removeListener = window.quickboard.onThemeChanged((theme: 'system' | 'light' | 'dark') =>
        this.applyTheme(theme),
      );
    }

    return () => {
      removeListener?.();
    };
  }

  applyTheme(source: 'system' | 'light' | 'dark'): void {
    const root = document.documentElement;
    if (source === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', source);
    }
  }
}
