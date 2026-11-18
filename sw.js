// Service worker for v2: virker uten nett etter første besøk.
// Cache-navnene har eget prefiks, så v1 og v2 ikke sletter hverandres filer.
const PREFIX = 'kh2-';
const CACHE = PREFIX + 'v28';
const FONTS = PREFIX + 'fonts';
const COVERS = PREFIX + 'covers';
const COVER_HOSTS = ['covers.openlibrary.org', 'books.google.com', 'books.googleusercontent.com'];
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'parsers.js', 'kindle-sync.js', 'sample-clippings.txt', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE && k !== FONTS && k !== COVERS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts og bokomslag: hurtigbuffer først (filene endrer seg aldri).
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isCover = COVER_HOSTS.includes(url.hostname);
  if (isFont || isCover) {
    e.respondWith(
      caches.open(isFont ? FONTS : COVERS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
