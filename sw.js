const CACHE_NAME = 'notam-highlighter-v96';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './notamhighlighter.png',
  './pdf-viewer.html', './pdf-viewer', './js/processed-pdf-store.js?v=1',
  './js/pdf-viewer.js?v=11', './css/style.css?v=84',
  './js/app.js?v=76', './js/pdf-engine.js?v=84',
  './js/flight-parser.js', './js/flight-notam.js?v=73', './js/flight-eet.js?v=73',
  './vendor/pdf.min.js', './vendor/pdf.worker.min.js', './vendor/pdf-lib.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Navigation unavailable');
      const copy = response.clone();
      const pathname = new URL(event.request.url).pathname;
      const cacheKey = pathname.endsWith('/pdf-viewer') || pathname.endsWith('/pdf-viewer.html')
        ? './pdf-viewer' : './index.html';
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, copy)));
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const route = new URL(event.request.url).pathname;
      const fallback = route.endsWith('/pdf-viewer.html') || route.endsWith('/pdf-viewer')
        ? './pdf-viewer' : './index.html';
      return (await cache.match(fallback)) || (fallback === './pdf-viewer' ? await cache.match('./pdf-viewer.html') : null) || Response.error();
    }));
    return;
  }
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    return (await cache.match(event.request)) || fetch(event.request);
  }));
});


