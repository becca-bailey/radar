import { describe, expect, it } from 'vitest';
import { builtAssetPaths, offlineSave, planOfflineSync, type OfflineSave } from './offline';

const save = (id: string, version = 'v1'): OfflineSave => ({
  id,
  version,
  title: id,
  source: null,
  savedAt: '2026-11-01T00:00:00Z',
});

describe('offlineSave', () => {
  const row = {
    id: 's1',
    original_url: 'https://www.example.com/a',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-02T00:00:00Z',
    links: { title: 'A story', source: 'Example', canonical_url: 'https://www.example.com/a', archived_at: '2026-11-01T01:00:00Z' },
  };

  it('lists the title, source and saved date', () => {
    expect(offlineSave(row)).toMatchObject({ id: 's1', title: 'A story', source: 'Example', savedAt: row.created_at });
  });

  it('falls back to the host when there is no title', () => {
    expect(offlineSave({ ...row, links: { ...row.links, title: null } }).title).toBe('example.com');
  });

  it('changes version when the note changes (updated_at) or the page is re-archived', () => {
    const v = offlineSave(row).version;
    expect(offlineSave({ ...row, updated_at: '2026-11-03T00:00:00Z' }).version).not.toBe(v);
    expect(offlineSave({ ...row, links: { ...row.links, archived_at: '2026-11-04T00:00:00Z' } }).version).not.toBe(v);
  });
});

describe('planOfflineSync', () => {
  it('fetches everything into an empty cache', () => {
    expect(planOfflineSync(null, 'u1', [save('a'), save('b')])).toEqual({
      fetch: [save('a'), save('b')],
      remove: [],
    });
  });

  it('fetches new and changed saves, and removes ones no longer wanted', () => {
    const cached = { userId: 'u1', saves: [save('a'), save('b'), save('c')] };
    expect(planOfflineSync(cached, 'u1', [save('a'), save('b', 'v2'), save('d')])).toEqual({
      fetch: [save('b', 'v2'), save('d')],
      remove: ['c'],
    });
  });

  it("refetches everything when the cache is another account's", () => {
    const cached = { userId: 'someone-else', saves: [save('a')] };
    expect(planOfflineSync(cached, 'u1', [save('a')])).toEqual({ fetch: [save('a')], remove: [] });
  });
});

describe('builtAssetPaths', () => {
  it('finds stylesheets, scripts and island components, once each', () => {
    const html = `
      <link rel="stylesheet" href="/_astro/index.Ab12.css">
      <script type="module" src="/_astro/page.Cd34.js"></script>
      <astro-island component-url="/_astro/SaveMenu.Ef56.js" renderer-url="/_astro/client.Gh78.js"></astro-island>
      <link rel="stylesheet" href="/_astro/index.Ab12.css">`;
    expect(builtAssetPaths(html)).toEqual([
      '/_astro/index.Ab12.css',
      '/_astro/page.Cd34.js',
      '/_astro/SaveMenu.Ef56.js',
      '/_astro/client.Gh78.js',
    ]);
  });

  it('ignores article images and other sites', () => {
    expect(builtAssetPaths('<img src="https://example.com/_astro/x.png"><img src="/images/a.png">')).toEqual([]);
  });
});
