/* Bizzle Command v4.20 service worker. CACHE changes on every build (scripts/bump-version.sh). */
var CACHE = 'bizzle-command-2026-10-15.2207';
var V = '?v=2026-10-15.2207';
var SHELL = ['./', 'index.html', 'css/app.css' + V, 'js/config.js' + V, 'js/ai.js' + V, 'js/core.js' + V, 'js/radar.js' + V, 'js/vault.js' + V, 'js/seo.js' + V, 'js/studio.js' + V, 'js/work.js' + V,
  'vendor/jszip.min.js?v=3.10.2', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('bizzle-command-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // AI, news and GitHub calls always go to the network
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put('index.html', cp); }); return r; }).catch(function () { return caches.match('index.html'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req).then(function (r) { if (r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); } return r; }); }));
});
