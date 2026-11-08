// FILE NAME: sw.js
// Lets BreakDecode open fast and work without a signal after the first visit.
// Change the number below whenever you upload a new version, so phones pick it up.
const V = "bd-v9";
const SHELL = ["./", "index.html", "js/styles.js", "js/judge.js", "js/pose.js", "js/result.js", "js/share.js", "js/app.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
const OUTSIDE = ["cdn.jsdelivr.net", "unpkg.com", "storage.googleapis.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // our own files: newest first, saved copy when there is no signal
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(req, c)); } return r; })
      .catch(() => caches.match(req).then(m => m || caches.match("index.html"))));
  } else if (OUTSIDE.includes(url.hostname)) {
    // the pose model and fonts: downloaded once, then kept on the phone
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => { if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(V).then(x => x.put(req, c)); } return r; })));
  }
});
