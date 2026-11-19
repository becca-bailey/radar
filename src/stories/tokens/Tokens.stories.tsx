import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import globalCss from '@/styles/global.css?raw';
import { parseTokens, type Token } from './parseTokens';
import { groupPalette } from './paletteGroups';

/**
 * The active theme's tokens, generated from src/styles/global.css: add a
 * token there and it shows up here. Colours are read live from the page, so
 * they follow the theme and mode in the toolbar.
 */
const meta = {
  title: 'Tokens',
  parameters: { layout: 'padded', a11y: { test: 'off' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const { themeVars, inline } = parseTokens(globalCss);
const byPrefix = (prefix: string) => inline.filter((t) => t.name.startsWith(prefix));

/** The theme variables' current values on <html>, re-read when the toolbar changes theme or mode. */
function useLiveThemeVars(theme: unknown, mode: unknown): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    setValues(Object.fromEntries(themeVars.map((t) => [t.name, style.getPropertyValue(t.name).trim()])));
  }, [theme, mode]);
  return values;
}

/**
 * Whether the first declaration is still the one in effect: the live value
 * matches it, or it points at another token (var(…)), which keeps its role.
 */
const sameColour = (live: string | undefined, declared: string) =>
  declared.startsWith('var(') || (!!live && live.toLowerCase() === declared.toLowerCase());

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-3 first:mt-0">{children}</h2>;
}

function Name({ token }: { token: Token }) {
  return (
    <div className="min-w-0">
      <code className="text-sm font-semibold">{token.name}</code>
      {token.note && <p className="m-0 text-sm text-muted-foreground">{token.note}</p>}
    </div>
  );
}

function ColourChip({ name, size }: { name: string; size: 'lg' | 'sm' }) {
  return (
    <span
      className={`shrink-0 border-2 border-border ${size === 'lg' ? 'size-12 rounded-md shadow-hard-xs' : 'size-5 rounded-sm'}`}
      style={{ background: `var(${name})` }}
      aria-hidden="true"
    />
  );
}

/**
 * Each colour once, grouped by what it's for (src/stories/tokens/paletteGroups.ts),
 * with the tokens that point at it listed underneath. A token that points at
 * a colour in light but has its own value in the current mode (borders in
 * dark) gets its own swatch, marked as such.
 */
export const Palette: Story = {
  render: (_args, { globals }) => {
    const live = useLiveThemeVars(globals.theme, globals.mode);
    const colours = themeVars.filter((t) => live[t.name] && CSS.supports('color', live[t.name]));
    const value = (name: string) => live[name]?.toLowerCase();
    return (
      <>
        {groupPalette(colours).map((group) => (
          <section key={group.title}>
            <Heading>{group.title}</Heading>
            <p className="mt-0 mb-4 text-sm text-muted-foreground">{group.blurb}</p>
            <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2">
              {group.swatches.map(({ root, aliases }) => {
                const same = aliases.filter((a) => value(a.name) === value(root.name));
                const own = aliases.filter((a) => value(a.name) !== value(root.name));
                return (
                  <li key={root.name} className="flex items-start gap-3">
                    <ColourChip name={root.name} size="lg" />
                    <div className="grid min-w-0 gap-1">
                      {/* Notes are written on the first (light) declaration and can
                          describe that value ("5.1:1 on cream"); show one only
                          while that's the value in effect. */}
                      <Name token={sameColour(live[root.name], root.value) ? root : { ...root, note: '' }} />
                      <code className="text-xs text-muted-foreground">{live[root.name]}</code>
                      {same.length > 0 && (
                        <p className="m-0 text-xs">
                          <span className="text-muted-foreground">Also as </span>
                          {same.map((a, i) => (
                            <span key={a.name}>
                              {i > 0 && ', '}
                              <code>{a.name}</code>
                            </span>
                          ))}
                        </p>
                      )}
                      {own.map((a) => (
                        <p key={a.name} className="m-0 flex items-center gap-1.5 text-xs">
                          <ColourChip name={a.name} size="sm" />
                          <code>{a.name}</code>
                          <span className="text-muted-foreground">
                            {live[a.name]}, its own colour in this mode
                          </span>
                        </p>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </>
    );
  },
};

const TYPE_SAMPLES: { label: string; el: React.ReactNode }[] = [
  { label: 'h1', el: <h1 className="m-0">Your archive</h1> },
  { label: 'h2', el: <h2 className="m-0">Recent saves</h2> },
  { label: 'h3', el: <h3 className="m-0">Made by you</h3> },
  { label: 'body', el: <p className="m-0">Save a link, Radar keeps the full text.</p> },
  { label: 'note', el: <p className="font-display m-0 text-[1.02rem] italic">The bit about anemones is lovely.</p> },
  { label: 'small', el: <p className="m-0 text-sm text-muted-foreground">Field Notes · Yesterday</p> },
];

export const Type: Story = {
  render: (_args, { globals }) => {
    const fonts = byPrefix('--font-');
    const sizes = byPrefix('--text-');
    const [measured, setMeasured] = useState<Record<string, string>>({});
    useEffect(() => {
      const out: Record<string, string> = {};
      document.querySelectorAll<HTMLElement>('[data-type-sample] > *').forEach((el) => {
        const s = getComputedStyle(el);
        out[el.parentElement!.dataset.typeSample!] = `${s.fontSize} / ${s.lineHeight} · ${s.fontWeight} · ${s.fontFamily.split(',')[0]}`;
      });
      setMeasured(out);
    }, [globals.theme, globals.mode]);
    return (
      <>
        <Heading>Fonts</Heading>
        <ul className="m-0 grid list-none gap-4 p-0">
          {fonts.map((t) => (
            <li key={t.name}>
              <Name token={t} />
              <p className="m-0 text-2xl" style={{ fontFamily: t.value }}>
                Radar keeps what you save.
              </p>
            </li>
          ))}
        </ul>
        <Heading>Type in use</Heading>
        <ul className="m-0 grid list-none gap-4 p-0">
          {TYPE_SAMPLES.map(({ label, el }) => (
            <li key={label} className="grid gap-1">
              <code className="text-xs text-muted-foreground">
                {label} · {measured[label]}
              </code>
              <div data-type-sample={label}>{el}</div>
            </li>
          ))}
        </ul>
        <Heading>Type scale tokens</Heading>
        {sizes.length ? (
          <ul className="m-0 grid list-none gap-3 p-0">
            {sizes.map((t) => (
              <li key={t.name}>
                <Name token={t} />
                <p className="m-0" style={{ fontSize: t.value }}>
                  Radar keeps what you save.
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            None yet: sizes are still written into each component. Named steps arrive with RAD-76 and will list here.
          </p>
        )}
      </>
    );
  },
};

export const RadiiAndShadows: Story = {
  name: 'Radii and shadows',
  render: () => (
    <>
      <Heading>Radii</Heading>
      <ul className="m-0 flex list-none flex-wrap gap-5 p-0">
        {byPrefix('--radius-').map((t) => (
          <li key={t.name} className="grid gap-2">
            <span className="block size-20 border-2 border-border bg-card" style={{ borderRadius: t.value }} />
            <Name token={t} />
            <code className="text-xs text-muted-foreground">{t.value}</code>
          </li>
        ))}
      </ul>
      <Heading>Shadows</Heading>
      <ul className="m-0 flex list-none flex-wrap gap-5 p-0">
        {byPrefix('--shadow-').map((t) => (
          <li key={t.name} className="grid gap-2">
            <span className="block size-20 rounded-lg border-2 border-border bg-card" style={{ boxShadow: t.value }} />
            <Name token={t} />
            <code className="text-xs text-muted-foreground">{t.value}</code>
          </li>
        ))}
      </ul>
    </>
  ),
};
