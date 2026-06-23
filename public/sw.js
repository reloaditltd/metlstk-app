const CACHE = "metlstk-sf-v2"
const SHELL = ["/", "/src/main.tsx"]

self.addEventListener("install", e => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})))
})

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return
  if (e.request.url.includes("/api/")) return  // never cache API calls
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
