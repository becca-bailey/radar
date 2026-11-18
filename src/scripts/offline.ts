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
  OFFLINE_PAGE,
  builtAssetPaths,
  planOfflineSync,
  readOfflineIndex,
  readerPath,
  writeOfflineIndex,
  type OfflineIndex,
  type OfflineSave,
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

/** Fetch a same-site page and cache it. Null if it isn't a real page for this user. */
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
  let cached = await readOfflineIndex(cache);
  if (cached && cached.userId !== userId) {
    // Another account's copies: remove them all before adding any of ours.
    await caches.delete(OFFLINE_CACHE);
    cache = await caches.open(OFFLINE_CACHE);
    cached = null;
  }
  const plan = planOfflineSync(cached, userId, wanted.saves);
  for (const id of plan.remove) await cache.delete(readerPath(id));

  const previous = new Map((cached?.saves ?? []).map((s) => [s.id, s]));
  const fetched = new Map<string, OfflineSave | null>();
  try {
    await cachePage(cache, OFFLINE_PAGE);
  } catch {}
  for (const save of plan.fetch) {
    try {
      fetched.set(save.id, (await cachePage(cache, readerPath(save.id))) === null ? null : save);
    } catch {
      // Offline mid-sync or a flaky connection: keep any older copy and try
      // again next time (its old version doesn't match, so it's refetched).
    }
  }

  const saves: OfflineSave[] = [];
  for (const save of wanted.saves) {
    if (!fetched.has(save.id)) {
      // Unchanged, or the fetch failed: whatever copy we had stays.
      const had = previous.get(save.id);
      if (had) saves.push(had);
    } else if (fetched.get(save.id)) {
      saves.push(save);
    } else {
      // Gone or not readable any more: drop the old copy too.
      await cache.delete(readerPath(save.id));
    }
  }
  await writeOfflineIndex(cache, { userId, saves });
  await syncAssets(cache, [OFFLINE_PAGE, ...saves.map((s) => readerPath(s.id))]);
  storageSet(SYNCED_KEY, `${userId}:${Date.now()}`);
}

/**
 * Keep exactly the styles and scripts the cached pages link to. The service
 * worker adds assets as you browse; this is where old builds' files go.
 */
async function syncAssets(cache: Cache, paths: string[]) {
  const needed = new Set<string>();
  for (const path of paths) {
    const page = await cache.match(path);
    if (page) builtAssetPaths(await page.text()).forEach((a) => needed.add(a));
  }
  const assetCache = await caches.open(ASSET_CACHE);
  for (const req of await assetCache.keys()) {
    if (!needed.has(new URL(req.url).pathname)) await assetCache.delete(req);
  }
  // Hashed names never change, so anything already cached is current.
  for (const path of needed) {
    if (await assetCache.match(path)) continue;
    try {
      const asset = await fetch(path);
      if (asset.ok) await assetCache.put(path, asset);
    } catch {}
  }
}

export function startOffline(userId: string | null) {
  if (!('caches' in window)) return;
  if (!userId) {
    void clearOfflineCopies();
    // The worker goes too, so nothing is cached while signed out.
    navigator.serviceWorker
      ?.getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
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
