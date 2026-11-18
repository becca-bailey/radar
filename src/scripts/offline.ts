/**
 * Offline reading (RAD-25), the page side. On signed-in pages: register the
 * service worker and keep copies of your recent saves' reader pages in the
 * Cache API. On signed-out pages: delete those copies, since they hold your
 * archived text and notes. That covers signing out, deleting your account
 * and an expired session, which all land on a signed-out page.
 *
 * See src/lib/offline.ts for what's cached and public/sw.js for serving it.
 */
import {
  ASSET_CACHE,
  OFFLINE_CACHE,
  OFFLINE_INDEX_KEY,
  OFFLINE_PAGE,
  builtAssetPaths,
  planOfflineSync,
  readerPath,
  type OfflineIndex,
} from '../lib/offline';

/** Last sync, as "<user id>:<ms>", so page loads don't each refetch the list. */
const SYNCED_KEY = 'radar-offline-synced';
const SYNC_EVERY_MS = 5 * 60 * 1000;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

export async function clearOfflineCopies() {
  storageSet(SYNCED_KEY, null);
  if (!('caches' in window)) return;
  await Promise.all([caches.delete(OFFLINE_CACHE), caches.delete(ASSET_CACHE)]);
}

async function readIndex(cache: Cache): Promise<OfflineIndex | null> {
  try {
    const res = await cache.match(OFFLINE_INDEX_KEY);
    return res ? ((await res.json()) as OfflineIndex) : null;
  } catch {
    return null;
  }
}

/** Fetch a same-site page and cache it. False if it isn't a real page for this user. */
async function cachePage(cache: Cache, path: string): Promise<string | null> {
  const res = await fetch(path, { credentials: 'same-origin', redirect: 'follow' });
  // A redirect means signed out (to /login) or gone; neither is worth keeping.
  if (!res.ok || res.redirected || !(res.headers.get('Content-Type') ?? '').includes('text/html')) return null;
  const html = await res.clone().text();
  await cache.put(path, res);
  return html;
}

async function sync(userId: string) {
  const res = await fetch('/api/offline', { credentials: 'same-origin' });
  if (res.status === 401) return clearOfflineCopies();
  if (!res.ok) return;
  const wanted = (await res.json()) as OfflineIndex;
  if (wanted.userId !== userId) return;

  let cache = await caches.open(OFFLINE_CACHE);
  let cached = await readIndex(cache);
  if (cached && cached.userId !== userId) {
    // Another account's copies: remove them all before adding any of ours.
    await caches.delete(OFFLINE_CACHE);
    cache = await caches.open(OFFLINE_CACHE);
    cached = null;
  }
  const plan = planOfflineSync(cached, userId, wanted.saves);
  for (const id of plan.remove) await cache.delete(readerPath(id));

  // Keep what's still wanted and unchanged, then add what we fetch.
  const fetchIds = new Set(plan.fetch.map((s) => s.id));
  const kept = new Set((cached?.saves ?? []).map((s) => s.id).filter((id) => !fetchIds.has(id)));
  const assets = new Set<string>();
  const pages = [OFFLINE_PAGE, ...plan.fetch.map((s) => readerPath(s.id))];
  for (const path of pages) {
    try {
      const html = await cachePage(cache, path);
      if (html === null) continue;
      builtAssetPaths(html).forEach((a) => assets.add(a));
      const id = path.startsWith('/saves/') ? path.slice('/saves/'.length) : null;
      if (id) kept.add(id);
    } catch {
      // Offline mid-sync or a flaky connection: try again next time.
    }
  }

  const index: OfflineIndex = { userId, saves: wanted.saves.filter((s) => kept.has(s.id)) };
  await cache.put(
    OFFLINE_INDEX_KEY,
    new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } })
  );

  // Styles and scripts for the cached pages. Hashed names never change, so
  // anything already cached is current.
  const assetCache = await caches.open(ASSET_CACHE);
  for (const path of assets) {
    if (await assetCache.match(path)) continue;
    try {
      const asset = await fetch(path);
      if (asset.ok) await assetCache.put(path, asset);
    } catch {}
  }
  storageSet(SYNCED_KEY, `${userId}:${Date.now()}`);
}

export function startOffline(userId: string | null) {
  if (!('caches' in window)) return;
  if (!userId) {
    void clearOfflineCopies();
    return;
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('service worker:', err));
  }
  const last = storageGet(SYNCED_KEY)?.split(':');
  const recent = last?.[0] === userId && Date.now() - Number(last[1]) < SYNC_EVERY_MS;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (recent || saveData || !navigator.onLine) return;
  // After the page has loaded, so copying never competes with what you're reading.
  const run = () => sync(userId).catch((err) => console.warn('offline sync:', err));
  if (document.readyState === 'complete') setTimeout(run, 1000);
  else addEventListener('load', () => setTimeout(run, 1000), { once: true });
}
