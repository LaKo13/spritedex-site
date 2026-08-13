// Offline support: precache the shell, cache sprites as they load. Bump VERSION on
// deploy (tools/deploy-web.sh stamps it) so clients pick up new releases.
const VERSION = "spritedex-202608131111-3dcc8b3";
const SHELL = [
  ".", "index.html", "css/app.css", "js/app.js", "js/engine.js", "js/store.js",
  "data/slots.json", "manifest.webmanifest", "assets/icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first: right for content-addressed sprite art and a versioned shell.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit ?? fetch(e.request).then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
