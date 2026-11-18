/**
 * Offline reading (RAD-25): the browser keeps copies of your most recent
 * saves' reader pages (/saves/:id) so they open without a connection.
 *
 * The page script (src/scripts/offline.ts) does the copying with the Cache
 * API; the service worker (public/sw.js) only serves those copies when the
 * network fails. The cache names here must match the ones in public/sw.js.
 */

/** Reader pages, the offline page and the index of what's in it. */
export const OFFLINE_CACHE = 'radar-offline-v1';
/** Built CSS and JS (/_astro/*), so cached pages keep their styles. */
export const ASSET_CACHE = 'radar-assets-v1';
/** Where the index of cached saves is stored in OFFLINE_CACHE. Never a real route. */
export const OFFLINE_INDEX_KEY = '/__radar/offline-index';
/** The page shown when Radar can't be reached. */
export const OFFLINE_PAGE = '/offline';
/**
 * Clear-Site-Data value for sign-out and account deletion: drops the cached
 * pages, local storage and the service worker. Cookies are left to Supabase.
 */
export const CLEAR_OFFLINE_DATA = '"cache", "storage"';
/** How many recent saves with archived text to keep on the device. */
export const OFFLINE_LIMIT = 30;

/** One save available offline, as listed by GET /api/offline. */
export interface OfflineSave {
  id: string;
  /** Changes whenever the cached page would: a new note, a re-archive. */
  version: string;
  title: string;
  source: string | null;
  savedAt: string;
}

export interface OfflineIndex {
  userId: string;
  saves: OfflineSave[];
}

export interface OfflineRow {
  id: string;
  original_url: string;
  created_at: string;
  updated_at: string;
  links: {
    title: string | null;
    source: string | null;
    canonical_url: string;
    archived_at: string | null;
  } | null;
}

/** The list entry for a save row from the /api/offline query. */
export function offlineSave(row: OfflineRow): OfflineSave {
  const link = row.links;
  let title = link?.title ?? '';
  if (!title) {
    try {
      title = new URL(link?.canonical_url ?? row.original_url).hostname.replace(/^www\./, '');
    } catch {
      title = row.original_url;
    }
  }
  return {
    id: row.id,
    version: `${row.updated_at}|${link?.archived_at ?? ''}|${title}`,
    title,
    source: link?.source ?? null,
    savedAt: row.created_at,
  };
}

export interface SyncPlan {
  /** Saves to fetch: new, or changed since they were cached. */
  fetch: OfflineSave[];
  /** Cached copies to drop: deleted, or no longer among the recent ones. */
  remove: string[];
}

/**
 * What to change so the cache holds exactly `wanted`. A cache that belongs
 * to someone else (another account signed in on this device) is replaced
 * wholesale: the caller clears it, then fetches everything.
 */
export function planOfflineSync(cached: OfflineIndex | null, userId: string, wanted: OfflineSave[]): SyncPlan {
  const mine = cached && cached.userId === userId ? cached.saves : [];
  const have = new Map(mine.map((s) => [s.id, s.version]));
  const wantedIds = new Set(wanted.map((s) => s.id));
  return {
    fetch: wanted.filter((s) => have.get(s.id) !== s.version),
    remove: mine.filter((s) => !wantedIds.has(s.id)).map((s) => s.id),
  };
}

/**
 * Built assets a page needs (stylesheets, scripts, island components), so
 * they can be cached alongside it. Only same-site /_astro/ paths: the
 * article's own images stay on their sites and aren't fetched.
 */
export function builtAssetPaths(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/["'(](\/_astro\/[^"'()\s>]+)/g)) found.add(m[1]);
  return [...found];
}

export function readerPath(saveId: string): string {
  return `/saves/${saveId}`;
}
