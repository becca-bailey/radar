import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES, THEME_COLORS, resolveMode, resolveTheme } from './theme';

const css = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');

/** The body of the first `{ … }` block after `from`, braces balanced. */
function block(text: string, from: number): string {
  const open = text.indexOf('{', from);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error('unbalanced braces');
}

/** The custom properties declared directly in `body` (not in nested blocks). */
function declarations(body: string): Record<string, string> {
  let flat = body.replace(/\/\*[\s\S]*?\*\//g, '');
  while (/\{[^{}]*\}/.test(flat)) flat = flat.replace(/[^;{}]*\{[^{}]*\}/g, '');
  const out: Record<string, string> = {};
  for (const [, name, value] of flat.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

/** A theme's light tokens, and the ones its `@variant dark` block changes. */
function themeTokens(theme: string) {
  const start = css.indexOf(`:root[data-theme='${theme}'] {`);
  if (start === -1) throw new Error(`no block for the ${theme} theme`);
  const body = block(css, start);
  const variant = body.indexOf('@variant dark');
  if (variant === -1) throw new Error(`no @variant dark in the ${theme} theme`);
  return { light: declarations(body), dark: declarations(block(body, variant)) };
}

describe.each(THEMES)('the %s tokens in global.css', (theme) => {
  const { light, dark } = themeTokens(theme);

  it('only changes tokens in dark that light declares', () => {
    expect(Object.keys(dark).length).toBeGreaterThan(0);
    expect(Object.keys(dark).filter((name) => !(name in light))).toEqual([]);
  });

  it('matches the theme-color values', () => {
    expect(light['--background']).toBe(THEME_COLORS[theme].light);
    expect(dark['--background']).toBe(THEME_COLORS[theme].dark);
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
