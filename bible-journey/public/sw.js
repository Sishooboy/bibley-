/*
 * Offline shell for Bibley.
 *
 * Hand written rather than generated, because the two ways a service worker
 * ruins an app are both avoidable by being explicit: serving a stale build
 * forever, and caching account data. So:
 *
 *   - navigations are network first, cache only as a fallback, which means a
 *     deploy is picked up the moment there is a connection;
 *   - same-origin static assets are cache first, safe because Vite fingerprints
 *     every filename, and a changed file is simply a different URL;
 *   - anything cross-origin is left alone entirely, so Supabase requests never
 *     touch the cache and a journal can never be served stale.
 *
 * Bump CACHE to retire every previous cache in one go.
 */
const CACHE = 'bibley-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // A missing shell file must not abort the install, or one bad path leaves
      // the app with no worker at all.
      .then((cache) => Promise.allSettled(SHELL.map((path) => cache.add(path))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    const cached = (await caches.match('/index.html')) ?? (await caches.match('/'));
    if (cached) return cached;
    throw new Error('offline and no cached shell');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Everything below is same-origin only. Supabase, and anything else off this
  // host, goes straight to the network as though no worker existed.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Scripture is immutable and fetched a book at a time, so every book you open
  // is a book you can still read on a plane. Not precached: 3.9 MB of text
  // nobody asked for is not a courtesy.
  if (url.pathname.startsWith('/bible/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (['script', 'style', 'font', 'image', 'manifest'].includes(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});
