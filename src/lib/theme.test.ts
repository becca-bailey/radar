import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES, THEME_COLORS, resolveMode, resolveTheme } from './theme';

const css = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');

/** The custom properties declared in the first rule whose selector is `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule for ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const [, name, value] of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

describe.each(THEMES)('the %s tokens in global.css', (theme) => {
  const light = tokens(`:root[data-theme='${theme}']`);
  const forcedDark = tokens(`:root[data-theme='${theme}'][data-mode='dark']`);
  const systemDark = tokens(`:root[data-theme='${theme}'][data-mode='system']`);

  it('has the same dark tokens forced and following the system', () => {
    expect(Object.keys(forcedDark).length).toBeGreaterThan(0);
    expect(systemDark).toEqual(forcedDark);
  });

  it('matches the theme-color values', () => {
    expect(light['--background']).toBe(THEME_COLORS[theme].light);
    expect(forcedDark['--background']).toBe(THEME_COLORS[theme].dark);
  });
});

describe('resolveTheme', () => {
  it('keeps a known theme', () => {
    expect(resolveTheme('playful')).toBe('playful');
  });

  it.each([undefined, '', 'Playful', 'nope', '"><script>', 42])('falls back to playful for %j', (value) => {
    expect(resolveTheme(value)).toBe('playful');
  });
});

describe('resolveMode', () => {
  it.each(['system', 'light', 'dark'])('keeps %s', (mode) => {
    expect(resolveMode(mode)).toBe(mode);
  });

  it.each([undefined, '', 'Dark', 'auto', '"><script>', null])('falls back to system for %j', (value) => {
    expect(resolveMode(value)).toBe('system');
  });
});
