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
// v5 (2026-09-18): bumped for App v86. An offline phone must not keep serving
// v85, which still has the bin-field bug and the staff-visible 2FA panel.
// v6 (2026-09-18): bumped for App v87.
// v7 (2026-09-18): bumped for App v88. An offline phone must not keep
// serving v87, which has no camera scan on the Live Stock filter and no
// visible drop-down arrow on the Product Type box.
// v8 (2026-09-18): bumped for App v89. An offline phone must not keep
// serving v88, which says nothing when an Admin closes or reverses the
// batch the operator is working in.
// v10 (2026-09-18): bumped for App v91. An offline phone must not keep
// serving v90, whose self-service two-factor screens read a wrong PIN as a
// thrown error rather than the plain refusal the database now sends, and
// which does not say who is asking on the four administrative calls.
// v9 (2026-09-18): bumped for App v90. An offline phone must not keep
// serving v89, which does not send its device code at sign-in and so
// would not be stopped by a block.
// v11 (2026-09-19): bumped for App v92. An offline phone must not keep
// serving v91, which has no Transfer action and still calls its own MOVE
// tab "MOVE" rather than "Actions".
// v12 (2026-09-19): bumped for App v93. An offline phone must not keep
// serving v92, whose Transfer From-Bin field offered every warehouse bin
// instead of only the ones the scanned SKU actually has stock in.
// v13 (2026-09-24): bumped for App v94. An offline phone must not keep
// serving v93, which lets switched-off SKUs be scanned in, forgets the screen
// when Android kills the app in the background, and types the Live Stock
// search in lower case.
// v14 (2026-09-24): bumped for App v95 (Manage Listings for Admin/Supervisor,
// PIN-checked listing on/off and add; staff told to ask an Admin). v13 / App v94
// were built and tested but never deployed - v95 supersedes them.
// v15 (2026-09-26): bumped for App v96 (DATABASE tab, product card on every scan,
// bin pick lists, PICK that can deduct only once, stock reservations and the bulk
// pick sheet). An offline phone must not keep serving v95, whose PICK screen can
// take the same slip out of stock twice.
// v18 (2026-09-28): bumped for App v99 (sales channel required on Dispatch Out,
// Amazon dispatch checked against the printed order, bulk pick template).
// v19 (2026-09-28): bumped for App v100 (plus / minus buttons on quantity boxes).
// v20 (2026-09-28): bumped for App v101 (scanner overhaul). Also keeps the
// WebAssembly barcode decoder (zxing_reader_3.1.4.js / .wasm) for offline
// use - best effort: a missing file never stops the app shell installing.
// v21 (2026-09-29): bumped for App v102 (pick flow, Held stock in plain words).
// v22 (2026-09-29): bumped for App v103 (Reserved stock tile and screen).
// v23 (2026-09-29): bumped for App v104 (Reserved stock released in one database call).
// v24 (2026-09-29): bumped for App v105 (v104 with both answer shapes of the one-call release).
// v25 (2026-10-02): bumped for App v106 (suggestions, auto bin lookup, stock history filters, void).
// v26 (2026-10-02): bumped for App v107 (Void everywhere + PICK > Reserved & held stock).
// v27 (2026-10-03): bumped for App v108 (inner lists scroll both ways; pull-to-refresh made reliable).
// v29 (2026-10-03): bumped for App v110 (Stock Search, held-unit lock, one-sheet Void, clearer log, double-scan guard, release reason, stock health check).
// v30 (2026-10-03): bumped for App v111 (review fixes: bin-search names/ASIN, plain held-check messages, double-scan 15 s + remember, health card 'current', safer buttons and CSV).
// v36 (2026-10-12): bumped for App v117 (Quick Add pricing, Fix-It Centre, bulk GST, tax panel).
// v38 (2026-10-13): cache name bumped for App v121 (CRM, production, raw materials); nothing else changed.
// v37 (2026-10-12): bumped for App v118 (Raw Materials tab, database step M15).
// v35 (2026-10-12): bumped for App v116 (Database search suggestions, % display, 3-minute listing hold, copy buttons, refreshed Guide).
// v33 (2026-10-08): bumped for App v114 (smart search, narrow-down buttons, clearer DASH screens).
// v32 (2026-10-07): bumped for App v113 (review fixes: SKU link double-fire, stable export columns, Back button closes the SKU page, no units_2025 dependency, stable sales paging).
// v31 (2026-10-07): bumped for App v112 (DASH analytics: Sales / Inventory / Forecast / Production, SKU page, richer inventory export).
// v56 (2026-10-18): cache name bumped for App v139.
// v56 (2026-10-18, service-worker test lane, proven by sw_test.mjs against a GitHub-Pages-like host that sends
// Cache-Control: max-age=600): five fixes, cache name unchanged.
//  1. Shell fetches now revalidate (cache:'no-cache'). Before, fetch(event.request) was answered from the browser's
//     HTTP cache for up to 10 minutes, so "network-first" still showed the PREVIOUS deploy after a normal visit.
//  2. Install pre-cache uses cache:'reload' for the same reason - addAll() could store the previous deploy's index.html
//     in the brand-new cache.
//  3. Only a 200 'basic' response is stored. A 503/404 from the host during a deploy used to overwrite the good shell
//     and then be served offline.
//  4. A request carrying an Authorization header, or a PostgREST/auth/functions/storage path, is never touched.
//  5. cache.put is kept alive with waitUntil and its failure is swallowed.
// v57 (2026-10-19): cache name bumped because App v139 now carries the Content-Security-Policy meta (v56 was never deployed; same logic as v56).
// v57 (2026-10-20, review F-07): only the shell files and the optional zxing files are stored, each under its exact path with no query string; lookups ignore the query string.
// Before, every distinct URL (each ?rm=...&id=N or ?crm=...&id=N link opened online) stored another full copy of the 2.2 MB page and the cache had no cap.
// v58 (2026-10-23): cache name bumped for App v145 (new bottom menu, one sign-in PIN, guide fixes).
// v59 (2026-10-31): cache name bumped for App v183 / Admin Panel v2.51; nothing else changed.
const CACHE_NAME = 'artzfolio-oms-shell-v59';
const OPTIONAL_FILES = ['./zxing_reader_3.1.4.js', './zxing_reader_3.1.4.wasm'];
const SHELL_FILES = ['./index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(SHELL_FILES.map(function (f) {
        return fetch(new Request(f, { cache: 'reload' })).then(function (r) { if (!r.ok) throw new Error('shell file ' + f + ' ' + r.status); return cache.put(f, r); });
      })).then(function () {
        return Promise.all(OPTIONAL_FILES.map(function (f) {
          return fetch(new Request(f, { cache: 'reload' })).then(function (r) { if (r.ok) return cache.put(f, r); }).catch(function () {});
        }));
      });
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

// The cache key for a URL, or null when it is not one of the files this worker keeps. The app page itself (the folder root or index.html, with or without a query) is kept as './index.html'.
function cacheKeyFor(url) {
  var p;
  try { p = new URL(url).pathname; } catch (e) { return null; }
  var scopePath = new URL('./', self.location.href).pathname;
  if (p === scopePath || p === scopePath + 'index.html') return './index.html';
  var all = SHELL_FILES.concat(OPTIONAL_FILES);
  for (var i = 0; i < all.length; i++) { if (new URL(all[i], self.location.href).pathname === p) return all[i]; }
  return null;
}

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;   // v51: only reads are kept in the cache
  var url = event.request.url;
  // Never intercept Supabase (or any cross-origin) traffic - always real network.
  if (url.indexOf(location.origin) !== 0) return;
  if (url.indexOf('supabase.co') !== -1) return;
  if (event.request.headers.has('authorization')) return;   // 2026-10-18: never touch an authenticated request
  if (/\/(rest|auth|functions|storage|realtime)\/v1\//.test(url)) return;

  // App shell: network-first (so a real deploy is picked up immediately on
  // the next successful load) with a cache fallback for genuinely offline.
  event.respondWith(
    fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (resp) {
      var key = cacheKeyFor(url);
      if (key && resp && resp.status === 200 && resp.type === 'basic') {
        var copy = resp.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.put(key, copy); }).catch(function () {}));
      }
      return resp;
    }).catch(function () {
      var key2 = cacheKeyFor(url);
      return caches.match(key2 || event.request, { ignoreSearch: true }).then(function (cached) {
        if (cached) return cached;
        // v20: only pages fall back to the app shell - a missing script or
        // .wasm must fail plainly, never come back as the HTML page.
        if (/\.(js|wasm)(\?|$)/.test(url)) return Response.error();
        return caches.match('./index.html', { ignoreSearch: true });
      });
    })
  );
});
