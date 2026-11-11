/* LeafCare service worker — full offline after first load. */
const CACHE = 'leafcare-v11';
const ASSETS = [
  './', './index.html', './css/main.css',
  './js/utils/dom.js', './js/utils/format.js', './js/utils/image.js',
  './js/logic.js',
  './js/db/storage.js', './js/db/profiles.js', './js/db/history.js',
  './js/middleware/guards.js',
  './js/model/loader.js', './js/model/infer.js', './js/model/preprocess.js',
  './js/routes/router.js', './js/routes/scan.js', './js/routes/history.js', './js/routes/profile.js',
  './js/app.js',
  './pages/scan.html', './pages/history.html', './pages/profile.html',
  './data/labels.json', './data/advice.json',
  './manifest.webmanifest', './icon.svg',
  './vendor/tf.min.js',
  './model/tfjs/model.json',
  './model/tfjs/group1-shard1of4.bin', './model/tfjs/group1-shard2of4.bin',
  './model/tfjs/group1-shard3of4.bin', './model/tfjs/group1-shard4of4.bin'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res.ok && new URL(e.request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
