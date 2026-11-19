/**
 * Reads the token names out of src/styles/global.css for the Storybook token
 * pages, so they list whatever the themes define instead of a hand-kept copy.
 *
 * - `themeVars`: custom properties set per theme and mode (palette and the
 *   shadcn colour tokens), in the order they're first declared. Their values
 *   are read live from the page, so they follow the toolbar.
 * - `inline`: the `@theme inline` tokens (fonts, radii, shadows, type sizes).
 *   Tailwind inlines these rather than emitting them as variables, so the
 *   pages apply the declared value directly; any var() inside it still
 *   resolves per theme.
 */
export interface Token {
  name: string;
  value: string;
  /** The comment after the declaration, if any. */
  note: string;
}

const DECL = /--([\w-]+)\s*:\s*([^;]+);[ \t]*(?:\/\*\s*([\s\S]*?)\s*\*\/)?/g;

function declarations(css: string): Token[] {
  return [...css.matchAll(DECL)].map(([, name, value, note]) => ({
    name: `--${name}`,
    value: value.trim(),
    note: (note ?? '').replace(/\s+/g, ' '),
  }));
}

/** The body of the first `@theme inline { … }` block, braces balanced. */
function themeInlineBlock(css: string): { body: string; start: number } | null {
  const start = css.indexOf('@theme inline');
  if (start === -1) return null;
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return { body: css.slice(open + 1, i), start };
  }
  return null;
}

export function parseTokens(css: string): { themeVars: Token[]; inline: Token[] } {
  const block = themeInlineBlock(css);
  const inline = block ? declarations(block.body) : [];
  // Everything before @theme inline is the per-theme blocks (and :root).
  // Prose comments can mention var(--x), but never `--x:`, so they don't match.
  const themed = block ? css.slice(0, block.start) : css;
  const seen = new Set<string>();
  const themeVars = declarations(themed).filter((t) => !seen.has(t.name) && seen.add(t.name));
  return { themeVars, inline };
}
