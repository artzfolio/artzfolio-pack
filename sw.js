/* Redirect-stub service worker (oms.artzfolio.com). It REPLACES the old app service worker on phones that
   still have it, then removes itself. No fetch handler: every request goes straight to the network. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    try {
      var wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      wins.forEach(function (c) { try { c.navigate(c.url); } catch (e) {} });   // reload -> stub index.html -> new address
    } catch (e) {}
  })());
});
