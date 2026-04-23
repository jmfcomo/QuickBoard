import themes from './themes.json';

export type ThemeId = (typeof themes)[number]['id'];
export type CustomThemeId = Exclude<ThemeId, 'system'>;

export const THEME_IDS = themes.map((theme) => theme.id);