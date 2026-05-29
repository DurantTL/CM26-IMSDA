const CACHE_NAME = 'cm26-checkin-v3';
// Local assets are required for offline use; a failure here should fail install.
const LOCAL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  '../shared/theme.css',
  './config.js',
  './app.js'
];
// CDN assets are best-effort: don't let a flaky CDN block the whole install.
const CDN_ASSETS = [
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(LOCAL_ASSETS).then(() =>
        Promise.all(CDN_ASSETS.map((url) => cache.add(url).catch(() => {})))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(caches.match(e.request).then((response) => response || fetch(e.request)));
});
