/**
 * JSTACK's service worker (P-1).
 *
 * It exists for one reason: the app shell must open when the connection does
 * not. The outbox (O-1) keeps what Josh captures; this keeps the thing he
 * captures it INTO. Without it, an offline capture is a promise the app
 * cannot even display.
 *
 * What it will not do is as important:
 *
 *   /api/ is NETWORK-ONLY. Never cached, never served stale. A cached answer
 *   to "what is on my plate today" is worse than no answer, because it looks
 *   current.
 *
 *   A response whose body contains `"sensitivity":"sens"` is never written to
 *   the cache, whatever its URL. That marker is the contract's own flag for
 *   money, health and journal text (CONTRACT §3), and the cache is
 *   unencrypted storage that outlives the session. This is a second lock on a
 *   door the rule above already closes — because the cost of being wrong once
 *   is Josh's financial position sitting in a browser cache.
 *
 *   `skipWaiting` + `clients.claim`, so a new version takes over on the next
 *   load rather than waiting for every tab to close. A stale shell talking to
 *   a current API is a bug factory.
 *
 * The cache name carries a version. Changing it is how a release drops the
 * old one: `activate` deletes every cache that is not the current name.
 */

const VERSION = "jstack-v1";

/** The paths that do not change between builds. */
const STATIC_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

/**
 * The paths that DO change: the hashed entry bundle and the vendored fonts.
 * `tools/build-web.mjs` replaces the marker below at export time, reading the
 * list off the index.html it has just rewritten.
 *
 * PW-A (audit A-1): the precache used to be `STATIC_SHELL` alone — five files,
 * none of them the code. After one online load an offline reload rendered an
 * empty `#root` and no gate: the worker served a shell with nothing in it,
 * which is worse than having no worker at all, because the page opens and
 * shows a blank. It appeared to work on a SECOND online load only because the
 * runtime `fetch` handler had cached the bundle by then — a shell that works
 * when you test it twice is the thing a precache exists to remove.
 *
 * It cannot be written by hand: the entry filename carries a content hash, so
 * any literal here would be wrong on the next build. An unfilled marker leaves
 * an empty array, and `tests/unit/pwa.test.ts` fails on the marker surviving
 * into the export.
 */
const BUILD_PRECACHE = [/* __JSTACK_BUILD_PRECACHE__ */];

const SHELL = [...STATIC_SHELL, ...BUILD_PRECACHE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // addAll is atomic and fails the whole install on one 404; the shell
      // list is small and every entry must be there for the shell to open
      cache.addAll(SHELL).catch(() => undefined),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Money, health and journal text carry this in the body (CONTRACT §3). */
async function carriesSensitive(response) {
  try {
    const text = await response.clone().text();
    return text.includes('"sensitivity":"sens"') || text.includes('"sensitivity": "sens"');
  } catch {
    // unreadable means not cacheable — the safe direction
    return true;
  }
}

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname === "/" ||
      url.pathname.startsWith("/fonts/") ||
      url.pathname.startsWith("/icons/") ||
      /\.(js|css|png|svg|ttf|woff2?|webmanifest|html)$/.test(url.pathname))
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // W-1 / UP-04: the PWA share target POSTS to /capture (the Web Share Target
  // spec allows GET for text only; files need POST). The worker takes that
  // POST, keeps the parts, and REDIRECTS to the route as a plain navigation —
  // so the app itself is only ever loaded by a GET and never has to know it
  // was reached from a share sheet.
  //
  // The text parts go on the FRAGMENT of the redirect, which is the same
  // channel the iOS Shortcut uses and for the same reason: everything after
  // `#` is never sent to a server, never logged by a proxy, and never in a
  // Referer (SEC-11's one stated exception, ADR-64). The target takes no files
  // (A4R9-03): they were posted to whatever page was open before this redirect
  // loaded a fresh one, so nothing ever received them — a file reaches JSTACK
  // through the attach control or the Dropbox inbox.
  if (event.request.method === "POST" && url.pathname === "/capture") {
    event.respondWith(
      (async () => {
        const form = await event.request.formData().catch(() => null);
        const part = (k) => {
          const v = form?.get(k);
          return typeof v === "string" && v.trim() !== "" ? v : "";
        };
        const q = new URLSearchParams();
        for (const k of ["title", "text", "url"]) {
          const v = part(k);
          if (v !== "") q.set(k, v);
        }
        return Response.redirect(`/capture#${q.toString()}`, 303);
      })(),
    );
    return;
  }

  // Never the API, and never anything but a GET. Returning without calling
  // respondWith lets the request go to the network untouched.
  if (url.pathname.startsWith("/api/") || event.request.method !== "GET") return;

  // ONE listener, because two handlers each calling respondWith on the same
  // event throws — and a navigation to "/" matches both a static asset and a
  // navigation, so two listeners would have collided on the app's own opening
  // request every time.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        // the network is gone entirely: serve the shell rather than the
        // browser's error page. This is the whole reason the worker exists.
        caches.match("/index.html").then((hit) => hit ?? caches.match("/").then((root) => root ?? Response.error())),
      ),
    );
    return;
  }

  if (!isStaticAsset(url)) return;

  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then(async (response) => {
        if (!response.ok || response.type === "opaque") return response;
        if (await carriesSensitive(response)) return response;
        const copy = response.clone();
        void caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        return response;
      });
    }),
  );
});

// ─── push (U-1, PU-01..05) ───────────────────────────────────────────────
//
// Two handlers, and the second is the one that matters. A notification that
// opens the app at the top is a notification that made the person do the
// finding themselves; `tab` and `ref` in the payload say where it came from,
// and the click goes there.

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // an unparseable push is still a push — show something rather than
    // nothing, because the browser will show its own generic notification if
    // this handler does not
  }
  const title = payload.title || "JSTACK";
  const options = {
    body: payload.body || "",
    // the tag collapses repeats of the same thing rather than stacking six
    // notifications about one decision
    tag: payload.tag || payload.ref || "jstack",
    data: { tab: payload.tab || "today", ref: payload.ref || null },
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  };
  // PU-04: tell the open pages what was asked for. The DISPLAY is the
  // browser's — a headless one refuses the permission outright — so this is
  // the only part of the handler a test can hear, and it is the part that is
  // the handler's. The app ignores the message.
  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true })
      .then((clients) => clients.forEach((c) => c.postMessage({ __jstackShown: { title, options } })))
      .catch(() => undefined),
  );
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.ref ? `/${data.tab}?ref=${encodeURIComponent(data.ref)}` : `/${data.tab}`;

  event.waitUntil(
    // Focus an open tab rather than opening a second one. Two copies of the
    // app in two tabs is how a person ends up answering the same card twice.
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          void client.focus();
          void client.navigate?.(target);
          return;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

/**
 * The rig's delivery path (U-1). Playwright can grant permission and register
 * a worker; it cannot make a real push service send anything. This takes the
 * payload the push service WOULD have delivered and runs the same handler, so
 * the thing under test is the handler rather than a second copy of it.
 *
 * Guarded by the marker so an unrelated postMessage cannot raise a
 * notification.
 */
self.addEventListener("message", (event) => {
  const payload = event.data && event.data.__jstackPush;
  if (payload == null) return;
  self.dispatchEvent(
    Object.assign(new Event("push"), {
      data: { json: () => payload },
      waitUntil: (p) => p,
    }),
  );
});
