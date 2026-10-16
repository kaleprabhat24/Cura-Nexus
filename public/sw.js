/* Cura Nexus service worker: offline after first load.
   - Navigations: network first, fall back to the cached app shell (SPA).
   - Same-origin static assets: cache first, populated on demand.
   Cross-origin requests (LLM providers, Supabase) are never cached. */
const CACHE = 'cura-nexus-v1';
const scope = self.registration.scope;
const SHELL = [scope, scope + 'index.html', scope + 'manifest.webmanifest', scope + 'icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(scope + 'index.html', copy));
          return res;
        })
        .catch(() => caches.match(scope + 'index.html').then((r) => r || caches.match(scope))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/samples/') || url.pathname.includes('/icons/'))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
