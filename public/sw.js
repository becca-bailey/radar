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
const OFFLINE_INDEX_KEY = '/__radar/offline-index';
const READER_PATH = /^\/saves\/[0-9a-f-]{36}$/i;
/** On a slow connection, show the saved copy of a page after this long. */
const NETWORK_TIMEOUT_MS = 6000;

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
    event.respondWith(builtAsset(event));
  } else if (request.mode === 'navigate') {
    event.respondWith(page(event, url));
  }
});

/**
 * Built files have content hashes in their names, so a cached copy is always
 * right. The page script's sync prunes ones no cached page needs.
 */
async function builtAsset(event) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok) keepAlive(event, cache.put(event.request, response.clone()));
  return response;
}

/**
 * Finish cache work after responding. If the event is already over (the
 * network answered after the timeout served the copy), just let it run.
 */
function keepAlive(event, promise) {
  promise.catch(() => {});
  try {
    event.waitUntil(promise);
  } catch {}
}

/** Drop a save's copy and its line in the index, so /offline stops listing it. */
async function forget(cache, path) {
  await cache.delete(path);
  const res = await cache.match(OFFLINE_INDEX_KEY);
  if (!res) return;
  const index = await res.json();
  const id = path.slice('/saves/'.length);
  index.saves = index.saves.filter((s) => s.id !== id);
  await cache.put(
    OFFLINE_INDEX_KEY,
    new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } })
  );
}

/** Network first. When it fails, the saved copy of this page, else the offline page. */
async function page(event, url) {
  const request = event.request;
  const cache = await caches.open(OFFLINE_CACHE);
  const isReader = READER_PATH.test(url.pathname);
  const saved = isReader ? await cache.match(url.pathname) : undefined;

  const network = fetch(request).then((response) => {
    if (isReader && saved) {
      // Keep the copy current (only the plain page: ?error= and similar
      // views carry one-off notices), and drop it once the save is gone or
      // you're signed out (a redirect to /login).
      if (response.ok && response.type === 'basic') {
        if (!url.search) keepAlive(event, cache.put(url.pathname, response.clone()));
      } else if (response.status === 404 || response.type === 'opaqueredirect') {
        keepAlive(event, forget(cache, url.pathname));
      }
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
