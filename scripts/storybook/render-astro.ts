/**
 * Prerenders the .astro components and pages in src/stories/astro/renders.ts
 * to HTML for Storybook, once per theme, into
 * src/stories/astro/generated/astro.json (gitignored).
 *
 * Runs under vitest with Astro's Vite config (vitest.storybook.config.ts),
 * which is what Astro's Container API needs. `npm run storybook` and
 * `npm run build-storybook` run it first; run it alone with
 * `npm run storybook:astro` after changing an .astro file.
 */
import { test, vi } from 'vitest';
import { glob, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { getContainerRenderer } from '@astrojs/react/container-renderer';
import { THEMES, THEME_COOKIE } from '../../src/lib/theme';
import { RENDERS, type AstroRender } from '../../src/stories/astro/renders';
import { fakeSupabase } from '../../src/stories/astro/fakeSupabase';
import { SAMPLE_USER } from '../../src/stories/astro/screens';
import { TIME_ZONE } from '../../src/stories/fixtures';

const OUT = fileURLToPath(new URL('../../src/stories/astro/generated/astro.json', import.meta.url));

// Sample content only: nothing in a story may reach Supabase or the network.
// Components get a client that refuses every call; pages get the fake one
// with their sample data, for both the per-request and the service client.
const noSupabase = new Proxy(
  {},
  {
    get(_, prop) {
      throw new Error(`Storybook renders use sample data only; something called supabase.${String(prop)}.`);
    },
  }
) as SupabaseClient;
const clients = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../src/lib/supabase', () => ({
  createServiceClient: () => clients.current,
  createRequestClient: () => clients.current,
}));

/**
 * The Container API leaves out styles written in .astro files. Collect the
 * <style is:global> blocks so stories can load them. Scoped <style> blocks
 * would need Astro's scoping, which Storybook can't do; fail on one so it
 * gets handled (move it to is:global or Tailwind) rather than missed.
 */
async function globalStyles(): Promise<string> {
  const css: string[] = [];
  const src = fileURLToPath(new URL('../../src', import.meta.url));
  for await (const file of glob('**/*.astro', { cwd: src })) {
    const source = await readFile(`${src}/${file}`, 'utf8');
    for (const [, attrs, body] of source.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/g)) {
      if (!/\bis:global\b/.test(attrs)) {
        throw new Error(`src/${file} has a scoped <style>, which Storybook can't show. See render-astro.ts.`);
      }
      css.push(`/* src/${file} */\n${body}`);
    }
  }
  return css.join('\n');
}

test('prerender .astro stories', async () => {
  globalThis.fetch = () => {
    throw new Error('Storybook renders use sample data only; something tried to fetch().');
  };
  const renderers = await loadRenderers([getContainerRenderer()]);
  const container = await AstroContainer.create({ renderers });

  const out: Record<string, Record<string, string>> = {};
  for (const [id, render] of Object.entries(RENDERS) as [string, AstroRender][]) {
    out[id] = {};
    const supabase = render.page ? fakeSupabase(render.page.data) : noSupabase;
    clients.current = supabase;
    for (const theme of THEMES) {
      // The theme cookie, as a browser would send it, so anything that
      // differs by theme on the server (Layout, theme slot components)
      // renders as it would in the app.
      const request = new Request(`http://localhost:4321${render.page?.path ?? '/'}`, {
        headers: { cookie: `${THEME_COOKIE}=${theme}` },
      });
      const html = await container.renderToString(render.component, {
        props: render.props,
        slots: render.slot ? { default: render.slot } : undefined,
        params: render.page?.params,
        partial: !render.page,
        request,
        locals: { supabase, user: render.page ? SAMPLE_USER : null, timeZone: TIME_ZONE },
      });
      // Stories insert this as inert HTML, where scripts never run; drop them.
      out[id][theme] = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    }
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ renders: out, styles: await globalStyles() }, null, 1));
}, 120_000);
