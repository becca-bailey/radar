/*
 * Radar's service worker (RAD-25): offline reading.
 *
 * It never decides what to cache: src/scripts/offline.ts copies your recent
 * saves' reader pages into OFFLINE_CACHE while you're online. This file only
 * serves those copies when the network can't be reached, and keeps built
 * CSS and JS (/_astro/*) so the copies still look right.
 *
 * Everything else goes to the network untouched: form posts, API calls,
 * other sites (article images included). Online, pages always come fresh
 * from the server.
 *
 * Cache names must match src/lib/offline.ts.
 */
const OFFLINE_CACHE = 'radar-offline-v1';
const ASSET_CACHE = 'radar-assets-v1';
const OFFLINE_PAGE = '/offline';
const READER_PATH = /^\/saves\/[0-9a-f-]{36}$/i;
/** On a slow connection, show the saved copy of a page after this long. */
const NETWORK_TIMEOUT_MS = 6000;
/** Old builds' assets pile up across deploys; keep the newest this many. */
const MAX_ASSETS = 150;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions of this file.
      const keep = new Set([OFFLINE_CACHE, ASSET_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith('radar-') && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(builtAsset(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(page(request, url));
  }
});

/** Built files have content hashes in their names, so a cached copy is always right. */
async function builtAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(old);
  }
  return response;
}

/** Network first. When it fails, the saved copy of this page, else the offline page. */
async function page(request, url) {
  const cache = await caches.open(OFFLINE_CACHE);
  const isReader = READER_PATH.test(url.pathname);
  const saved = isReader ? await cache.match(url.pathname) : undefined;

  const network = fetch(request).then(async (response) => {
    if (isReader && saved) {
      // Keep the copy current, and drop it once the save is gone or you're
      // signed out (a redirect to /login).
      if (response.ok && response.type === 'basic') await cache.put(url.pathname, response.clone());
      else if (response.status === 404 || response.type === 'opaqueredirect') await cache.delete(url.pathname);
    }
    return response;
  });
  // If the timeout wins and the network then fails, that's already handled.
  network.catch(() => {});

  try {
    if (!saved) return await network;
    // A copy is on hand, so don't leave the reader waiting on a slow network.
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
    return (await Promise.race([network, timeout])) ?? saved;
  } catch {
    if (saved) return saved;
    const offline = await cache.match(OFFLINE_PAGE);
    return offline ?? Response.error();
  }
}
