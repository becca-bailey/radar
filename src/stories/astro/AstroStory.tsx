import { useMemo } from 'react';
import type { StoryObj } from '@storybook/react-vite';
import { resolveTheme, type Theme } from '@/lib/theme';

/*
 * Shows an .astro component or page that scripts/storybook/render-astro.ts
 * prerendered (see ./renders.ts). The output is a generated, gitignored
 * file; the glob keeps typechecking working before it exists.
 */
interface Generated {
  /** Render id → theme → HTML. */
  renders: Record<string, Partial<Record<Theme, string>>>;
  /** The <style is:global> blocks from .astro files, which renders leave out. */
  styles: string;
}
const files = import.meta.glob<Generated>('./generated/astro.json', { eager: true, import: 'default' });
const GENERATED: Generated = Object.values(files)[0] ?? { renders: {}, styles: '' };

if (GENERATED.styles && !document.getElementById('astro-global-styles')) {
  const style = document.createElement('style');
  style.id = 'astro-global-styles';
  style.textContent = GENERATED.styles;
  document.head.append(style);
}

export function AstroHtml({ id, theme }: { id: string; theme: Theme }) {
  const html = GENERATED.renders[id]?.[theme];
  // A full page arrives as a whole document: show its <body>, keeping the
  // body's classes. <html>'s data-theme and data-mode come from the toolbar.
  const page = useMemo(() => {
    if (!html || !/<body[\s>]/i.test(html)) return null;
    const body = new DOMParser().parseFromString(html, 'text/html').body;
    return { className: body.className, html: body.innerHTML };
  }, [html]);

  if (!html) {
    return (
      <p role="alert">
        No prerendered HTML for “{id}” in the {theme} theme. Run <code>npm run storybook:astro</code>.
      </p>
    );
  }
  if (page) return <div className={page.className} dangerouslySetInnerHTML={{ __html: page.html }} />;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A story that shows one prerendered entry from ./renders.ts in the toolbar's theme. */
export function astroStory(id: string, story: Omit<StoryObj, 'render'> = {}): StoryObj {
  return {
    ...story,
    render: (_args, { globals }) => <AstroHtml id={id} theme={resolveTheme(globals.theme)} />,
  };
}
