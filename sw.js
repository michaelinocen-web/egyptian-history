// Offline cache for Egypt Through Time. Bump VERSION when the page files change.
const VERSION = "egypt-history-v1";
const PHOTOS = "egypt-photos-v1"; // Wikimedia photos, kept across updates (same name as the Journey app's photo cache)
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  // Only tidy up this page's own old caches, never another app's.
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("egypt-history-") && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Thumbnails look like …/commons/thumb/a/ab/Name.jpg/960px-Name.jpg; the original is …/commons/a/ab/Name.jpg.
const fileOf = u => u.replace(/\/thumb(\/.+?)\/\d+px-[^/]+$/, "$1");
const widthOf = u => { const m = /\/(\d+)px-[^/]+$/.exec(u); return m ? +m[1] : 4000; };
// Offline (or throttled), answer with the saved size of the same photo that is closest to the size asked for.
async function nearest(cache, url) {
  const want = widthOf(url), file = fileOf(url);
  const same = (await cache.keys()).filter(r => fileOf(r.url) === file);
  if (!same.length) return null;
  same.sort((a, b) => Math.abs(widthOf(a.url) - want) - Math.abs(widthOf(b.url) - want));
  return cache.match(same[0], { ignoreVary: true });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Photos: cache first (they never change), filled as they're viewed or via "Save photos offline".
  if (url.hostname === "upload.wikimedia.org") {
    e.respondWith(caches.open(PHOTOS).then(async c => {
      const hit = await c.match(req, { ignoreVary: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) { c.put(req, res.clone()); return res; }
        return (await nearest(c, req.url)) || res;
      } catch (err) {
        const near = await nearest(c, req.url);
        if (near) return near;
        throw err;
      }
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Network first for the page (so updates arrive), cache fallback when offline.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put("./index.html", copy)); } return res; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
