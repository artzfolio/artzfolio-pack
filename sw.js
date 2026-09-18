// ArtzFolio Scan-Pick-Pack - Service Worker
// Phase 4, Gap 2 - Offline mode / installable PWA.
//
// WHAT THIS DOES AND DOES NOT DO: this only caches the static app shell
// (this file's own origin - index.html, manifest.json, icon.svg) so the App
// can be installed and can at least LOAD its UI with no network at all.
// It deliberately does NOT cache or intercept any Supabase request
// (supabase.co) - live data is never served stale from a cache; every read
// still genuinely tries the network first and fails openly if there is
// none. Real offline WRITE support (queuing a MOVE action while offline,
// flushing it on reconnect) lives entirely in index.html's own JS
// (IndexedDB-backed write queue) - this service worker's only job is
// keeping the app shell itself loadable.
// v3 (2026-09-18): cache name bumped from v2 so that the 'activate' handler
// below deletes the old shell cache outright. Fetch here is already
// network-first, so an online phone picks up a deploy on its next load
// regardless. The bump matters for a phone that was OFFLINE across the
// deploy: without it, that phone could keep serving the previously cached
// App v83 shell - which has no two-factor sign-in step in it - until it
// happened to fetch index.html successfully again. Changing the name
// guarantees the old shell is discarded the moment this worker activates.
// v4 (2026-09-18): bumped again for App v85. Same reason as v3 - a phone that
// was offline across this deploy must not keep serving v84, which still has
// the broken Reverse authorisation in it.
const CACHE_NAME = 'artzfolio-oms-shell-v4';
const SHELL_FILES = ['./index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var url = event.request.url;
  // Never intercept Supabase (or any cross-origin) traffic - always real network.
  if (url.indexOf(location.origin) !== 0) return;
  if (url.indexOf('supabase.co') !== -1) return;

  // App shell: network-first (so a real deploy is picked up immediately on
  // the next successful load) with a cache fallback for genuinely offline.
  event.respondWith(
    fetch(event.request).then(function (resp) {
      var copy = resp.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
      return resp;
    }).catch(function () {
      return caches.match(event.request).then(function (cached) {
        return cached || caches.match('./index.html');
      });
    })
  );
});
