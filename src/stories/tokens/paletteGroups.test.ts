import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupPalette } from './paletteGroups';
import { parseTokens, type Token } from './parseTokens';

const t = (name: string, value: string): Token => ({ name, value, note: '' });
const names = (list: Token[]) => list.map((x) => x.name);

describe('groupPalette', () => {
  const colours = [
    t('--gold', '#cfaf36'),
    t('--card', '#fff'),
    t('--primary', 'var(--gold)'),
    t('--popover', 'var(--card)'),
    t('--ring', 'var(--primary)'),
    t('--mystery', '#123456'),
  ];
  const families = [
    { title: 'Accents', blurb: '', roots: ['--gold'] },
    { title: 'Surfaces', blurb: '', roots: ['--card', '--missing'] },
    { title: 'Empty', blurb: '', roots: ['--nope'] },
  ];
  const groups = groupPalette(colours, families);

  it('lists each colour once, with the tokens that point at it, following chains', () => {
    const accents = groups.find((g) => g.title === 'Accents')!;
    expect(accents.swatches.map((s) => s.root.name)).toEqual(['--gold']);
    expect(names(accents.swatches[0].aliases)).toEqual(['--primary', '--ring']);
  });

  it('skips names a family lists but the theme lacks, and drops empty families', () => {
    expect(groups.find((g) => g.title === 'Surfaces')!.swatches.map((s) => s.root.name)).toEqual(['--card']);
    expect(groups.find((g) => g.title === 'Empty')).toBeUndefined();
  });

  it('puts colours no family names under Other', () => {
    expect(groups.at(-1)!.title).toBe('Other');
    expect(groups.at(-1)!.swatches.map((s) => s.root.name)).toEqual(['--mystery']);
  });

  it('places every colour in the real global.css in a named family', () => {
    const { themeVars } = parseTokens(readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8'));
    const colours = themeVars.filter((x) => /^(#|var\()/.test(x.value));
    const real = groupPalette(colours);
    expect(real.map((g) => g.title)).not.toContain('Other');
    const shown = real.flatMap((g) => g.swatches.flatMap((s) => [s.root, ...s.aliases]));
    expect(names(shown).sort()).toEqual(names(colours).sort());
  });
});
