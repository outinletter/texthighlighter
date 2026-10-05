const CACHE_NAME = 'notam-highlighter-v11';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './notamhighlighter.png',
  './css/style.css', './js/app.js', './js/pdf-engine.js',
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
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
