import { Injectable, signal } from '@angular/core';
import { appSettings } from 'src/settings-loader';
import type { CustomThemeId, ThemeId } from '../shared/theme-types';
import { THEME_IDS } from '../shared/theme-types';

type Theme = ThemeId;
const VALID_THEME_IDS = new Set(THEME_IDS);

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly THEME_STORAGE_KEY = 'qb-theme';
  private mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private lastCustomThemeSent: CustomThemeId | null | undefined;

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

    const customTheme = source === 'system' ? null : (source as CustomThemeId);
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
    if (stored && VALID_THEME_IDS.has(stored)) {
      return stored as Theme;
    }
    return null;
  }
}
