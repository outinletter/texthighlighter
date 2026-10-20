const CACHE_NAME = 'notam-highlighter-v67';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './notamhighlighter.png',
  './css/style.css?v=61', './js/app.js?v=61', './js/pdf-engine.js?v=67',
  './js/flight-parser.js', './js/flight-notam.js', './js/flight-eet.js',
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
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)));
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match('./index.html')) || Response.error();
    }));
    return;
  }
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    return (await cache.match(event.request)) || fetch(event.request);
  }));
});
