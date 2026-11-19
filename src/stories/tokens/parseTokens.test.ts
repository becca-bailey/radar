import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTokens } from './parseTokens';

describe('parseTokens', () => {
  const css = `
/* Header that mentions var(--peach) in prose. */
:root { --radius: 14px; }
:root, :root[data-theme='a'] {
  --ink: #111; /* stone brown */
  --background: #fff;
}
:root[data-theme='a'][data-mode='dark'] {
  --ink: #000;
}
@theme inline {
  --font-sans: 'Work Sans', sans-serif;
  /* the hard offset "sticker" shadows */
  --shadow-hard: 3px 3px 0 var(--ink);
}
@layer base { body { color: red; } }
`;

  it('lists each theme variable once, in first-declared order, with its comment', () => {
    expect(parseTokens(css).themeVars).toEqual([
      { name: '--radius', value: '14px', note: '' },
      { name: '--ink', value: '#111', note: 'stone brown' },
      { name: '--background', value: '#fff', note: '' },
    ]);
  });

  it('reads the @theme inline tokens with their declared values', () => {
    expect(parseTokens(css).inline).toEqual([
      { name: '--font-sans', value: "'Work Sans', sans-serif", note: '' },
      { name: '--shadow-hard', value: '3px 3px 0 var(--ink)', note: '' },
    ]);
  });

  it('finds the palette, radii and shadows in the real global.css', () => {
    const real = parseTokens(readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8'));
    const names = (list: { name: string }[]) => list.map((t) => t.name);
    expect(names(real.themeVars)).toEqual(expect.arrayContaining(['--ink', '--gold', '--background', '--primary']));
    expect(names(real.inline)).toEqual(expect.arrayContaining(['--font-display', '--radius-lg', '--shadow-hard']));
  });
});
