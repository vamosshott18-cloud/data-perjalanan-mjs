// Service worker: aplikasi bisa dipasang ke layar utama & tetap terbuka saat sinyal hilang.
// Selalu ambil versi terbaru dari internet (lewati cache browser); cache hanya dipakai saat offline.
const CACHE = "mjs-perjalanan-v2";
const FILE = ["./", "index.html", "app.js", "api.js", "ekspor.js", "config.js", "manifest.webmanifest", "ikon-192.png", "ikon-512.png", "logo.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE.map(f => new Request(f, { cache: "reload" })))));
  self.skipWaiting();
});
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
