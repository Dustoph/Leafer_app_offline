/* LeafCare service worker — full offline after first load. */
const CACHE = 'leafcare-v4';
const ASSETS = [
  './', './index.html', './css/main.css',
  './js/utils/dom.js', './js/utils/format.js', './js/utils/image.js',
  './js/logic.js',
  './js/db/storage.js', './js/db/profiles.js', './js/db/history.js',
  './js/middleware/guards.js',
  './js/model/loader.js', './js/model/infer.js',
  './js/routes/router.js', './js/routes/scan.js', './js/routes/history.js', './js/routes/profile.js',
  './js/app.js',
  './pages/scan.html', './pages/history.html', './pages/profile.html',
  './data/labels.json', './data/advice.json',
  './manifest.webmanifest', './icon.svg',
  './vendor/tf.min.js', './vendor/tf-tflite.min.js',
  './vendor/tflite_web_api_cc.js',
  './vendor/tflite_web_api_cc.wasm',
  './vendor/tflite_web_api_cc_simd.js',
  './vendor/tflite_web_api_cc_simd.wasm',
  './vendor/tflite_web_api_client.js',
  './vendor/wasm/tflite_web_api_cc.js',
  './vendor/wasm/tflite_web_api_cc.wasm',
  './vendor/wasm/tflite_web_api_cc_simd.js',
  './vendor/wasm/tflite_web_api_cc_simd.wasm',
  './vendor/wasm/tflite_web_api_client.js',
  './model/plant_model.tflite'
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
