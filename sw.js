const CACHE_NAME = "running-notebook-v4";
const SHARE_CACHE = "running-notebook-share-v1";
const ASSETS = ["./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== SHARE_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Android share sheet posts the shared file(s) here.
  if (req.method === "POST" && url.pathname.endsWith("/share-target.html")) {
    event.respondWith(handleShareTarget(req));
    return;
  }

  // manifest.json: always fresh from network (share_target etc. must never be stale).
  if (url.pathname.endsWith("/manifest.json")) {
    event.respondWith(
      fetch(req, { cache: "no-store" }).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Navigations (opening the app / index.html): network-first so edits show up
  // immediately, falling back to the cached shell only when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req, { cache: "no-store" }).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", resClone));
        return res;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Everything else (icons, fonts, etc.): cache-first, fine since they rarely change.
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      }).catch(() => cached);
    })
  );
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files");
    const contents = [];
    for (const file of files) {
      contents.push(await file.text());
    }
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      "shared-data",
      new Response(JSON.stringify(contents), { headers: { "Content-Type": "application/json" } })
    );
  } catch (e) {
    // fall through to redirect even if something went wrong; index.html will just find nothing
  }
  return Response.redirect("./index.html?shared=1", 303);
}
