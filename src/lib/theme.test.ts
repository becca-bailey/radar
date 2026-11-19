import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/** The names of every theme block in global.css, with each block's start and end. */
function themeBlocks(): { theme: string; start: number; end: number }[] {
  return [...css.matchAll(/:root\[data-theme='([\w-]+)'\] \{/g)].map((m) => {
    const body = block(css, m.index!);
    const start = css.lastIndexOf('}', m.index!) + 1; // include a selector list like `:root:not(…),`
    return { theme: m[1], start, end: css.indexOf(body, m.index!) + body.length + 1 };
  });
}

/**
 * Palette colours: declared in a theme block but not exposed as a Tailwind
 * colour in @theme inline. Only that theme's block may name them.
 */
function paletteNames(): string[] {
  const inline = block(css, css.indexOf('@theme inline'));
  const exposed = new Set([...inline.matchAll(/--color-([\w-]+)\s*:/g)].map((m) => m[1]));
  const declared = new Set<string>();
  for (const theme of THEMES) {
    const { light, dark } = themeTokens(theme);
    for (const name of [...Object.keys(light), ...Object.keys(dark)]) declared.add(name.slice(2));
  }
  return [...declared].filter((name) => !exposed.has(name));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return /\/stories\/(tokens|astro\/generated)$/.test(path) ? [] : sourceFiles(path);
    return /\.(astro|tsx?|css|mdx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('palette colours', () => {
  const names = paletteNames();
  // var(--sage), bg-sage, [&_a:hover]:border-b-gold, bg-sage/50, tone="sage"
  const hue = new RegExp(`(?:--|(?<![\\w-])[a-z]+(?:-[a-z]+)*-|['"])(${names.join('|')})(?![\\w-])`, 'g');

  it('are found in global.css (gold, ink…) and roles are not', () => {
    expect(names).toEqual(expect.arrayContaining(['gold', 'sage', 'ink']));
    expect(names).not.toContain('primary');
    expect(names).not.toContain('success');
  });

  it('are never named outside the theme blocks', () => {
    const src = fileURLToPath(new URL('..', import.meta.url));
    const hits: string[] = [];
    for (const file of sourceFiles(src)) {
      let text = readFileSync(file, 'utf8');
      if (file.endsWith(join('styles', 'global.css'))) {
        // Blank out the theme blocks, keeping line numbers.
        for (const { start, end } of themeBlocks().reverse()) {
          text = text.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, ' ') + text.slice(end);
        }
      }
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(hue)) hits.push(`${relative(src, file)}:${i + 1}: ${m[0]}`);
      });
    }
    expect(hits, 'Use a role (bg-success, var(--primary)…), not a palette colour').toEqual([]);
  });
});

describe('the dark variant in global.css', () => {
  const variant = block(css, css.indexOf('@custom-variant dark'));

  it('covers a forced dark mode', () => {
    expect(variant).toContain("[data-mode='dark']");
  });

  it('covers "system" on a dark OS', () => {
    const media = variant.indexOf('@media (prefers-color-scheme: dark)');
    expect(media).toBeGreaterThan(-1);
    expect(block(variant, media)).toContain("[data-mode='system']");
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
