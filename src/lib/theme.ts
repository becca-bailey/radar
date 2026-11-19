/**
 * Which theme and mode a page renders in. Layout.astro reads them from
 * cookies and writes them onto <html> as data-theme and data-mode, so the
 * server sends the right colours and the page never flashes the default.
 * The tokens for each theme live in src/styles/global.css.
 *
 * Mode "system" follows the browser's light/dark setting; "light" and
 * "dark" force one regardless of it.
 */

export const THEME_COOKIE = 'theme';
export const MODE_COOKIE = 'mode';

export const THEMES = ['playful'] as const;
export const MODES = ['system', 'light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];
export type Mode = (typeof MODES)[number];

export const DEFAULT_THEME: Theme = 'playful';
export const DEFAULT_MODE: Mode = 'system';

/**
 * Each theme's page background, light and dark, for the browser chrome
 * (<meta name="theme-color">). Keep in step with --background in global.css.
 */
export const THEME_COLORS: Record<Theme, { light: string; dark: string }> = {
  playful: { light: '#fbf9f8', dark: '#2a2622' },
};

/**
 * Each theme's web fonts, as a Google Fonts stylesheet URL. Only the active
 * theme's fonts load: Layout.astro links this, and so does Storybook's
 * preview (.storybook/preview.tsx), so the two always match.
 */
export const THEME_FONTS: Record<Theme, string> = {
  playful:
    'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,400..900,0..100,0..1;1,9..144,400..900,0..100,0..1&family=Work+Sans:wght@400;600;700&display=swap',
};

/** The cookie's theme if it's one we have, else the default. */
export function resolveTheme(value: unknown): Theme {
  return THEMES.find((t) => t === value) ?? DEFAULT_THEME;
}

/** The cookie's mode if it's a known one, else "system". */
export function resolveMode(value: unknown): Mode {
  return MODES.find((m) => m === value) ?? DEFAULT_MODE;
}
