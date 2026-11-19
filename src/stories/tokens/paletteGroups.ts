/**
 * Groups the theme's colour tokens for the Storybook Palette page: each
 * colour once, with the tokens that point at it (`--primary: var(--gold)`)
 * listed under it, sorted into families by what the colour is for.
 *
 * Aliases come from global.css itself, so they stay right as tokens change.
 * The families are the one hand-kept part: a colour no family names still
 * shows, under "Other", so nothing silently drops off the page.
 */
import type { Token } from './parseTokens';

export interface Family {
  title: string;
  /** What the colours in this family are for. */
  blurb: string;
  /** The colours that hold a value of their own, in display order. */
  roots: string[];
}

export const FAMILIES: Family[] = [
  {
    title: 'Accents',
    blurb: 'Fills: actions, badges, panels, alerts and the background shapes. Text on any of them uses --on-fill.',
    roots: ['--gold', '--peach', '--blue', '--pink', '--rose', '--sage'],
  },
  {
    title: 'Surfaces',
    blurb: 'What content sits on: the page, cards and quiet panels.',
    roots: ['--background', '--card', '--muted'],
  },
  {
    title: 'Text',
    blurb: 'Body text, quieter text, text on accent fills, and links.',
    roots: ['--foreground', '--muted-foreground', '--on-fill', '--link'],
  },
  {
    title: 'Lines',
    blurb: 'Ink draws outlines and the sticker shadows; hairline is the soft rule.',
    roots: ['--ink', '--hairline'],
  },
  {
    title: 'Status',
    blurb: 'Errors and destructive actions.',
    roots: ['--destructive'],
  },
];

export interface Swatch {
  root: Token;
  /** Tokens declared as var() of this one, directly or through another alias. */
  aliases: Token[];
}

export interface Group {
  title: string;
  blurb: string;
  swatches: Swatch[];
}

const VAR = /^var\((--[\w-]+)\)$/;

/** The token a var() chain ends at, by first declarations: --popover → --card. */
function rootOf(name: string, declared: Map<string, string>, seen = new Set<string>()): string {
  const target = VAR.exec(declared.get(name) ?? '')?.[1];
  if (!target || !declared.has(target) || seen.has(name)) return name;
  seen.add(name);
  return rootOf(target, declared, seen);
}

/** `colours`: the theme's colour tokens, in declaration order (first declaration each). */
export function groupPalette(colours: Token[], families: Family[] = FAMILIES): Group[] {
  const declared = new Map(colours.map((t) => [t.name, t.value]));
  const byName = new Map(colours.map((t) => [t.name, t]));
  const aliases = new Map<string, Token[]>();
  const roots: Token[] = [];
  for (const t of colours) {
    const root = rootOf(t.name, declared);
    if (root === t.name) roots.push(t);
    else aliases.set(root, [...(aliases.get(root) ?? []), t]);
  }

  const swatch = (root: Token): Swatch => ({ root, aliases: aliases.get(root.name) ?? [] });
  const placed = new Set<string>();
  const groups: Group[] = families.map((f) => ({
    title: f.title,
    blurb: f.blurb,
    swatches: f.roots.flatMap((name) => {
      const t = byName.get(name);
      if (!t || !roots.includes(t)) return [];
      placed.add(name);
      return [swatch(t)];
    }),
  }));
  const rest = roots.filter((t) => !placed.has(t.name));
  if (rest.length) {
    groups.push({ title: 'Other', blurb: 'Colours no family names yet (see paletteGroups.ts).', swatches: rest.map(swatch) });
  }
  return groups.filter((g) => g.swatches.length);
}
