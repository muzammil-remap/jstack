/**
 * Web export wrapper — outputs OUTSIDE the Dropbox tree (~/.jstack-dist).
 * Dropbox sync locks freshly written files and races expo's dist/ rebuild
 * (EBUSY, partial exports) — BUGLOG B-7. serve-web.mjs serves the same path.
 *
 * Flavours (SEC-01/TM-01):
 *   node tools/build-web.mjs          → test-instrumented build (__JSTACK__ +
 *                                       Test mode present) → ~/.jstack-dist
 *   node tools/build-web.mjs --prod   → production build (test modules swapped
 *                                       out by metro) → ~/.jstack-dist-prod
 *   node tools/build-web.mjs --swap   → test build wired to the reference
 *                                       server (BS-05): API adapter on,
 *                                       base http://localhost:8787
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fontFaceCss } from "./vendor-fonts.mjs";
import { metaCsp, servedCsp } from "./csp.mjs";
import { sourceFingerprint } from "./source-fingerprint.mjs";
import { fillServiceWorker } from "./sw-precache.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = process.env.JSTACK_DIST ?? join(homedir(), ".jstack-dist");
const PROD_DIST = process.env.JSTACK_PROD_DIST ?? join(homedir(), ".jstack-dist-prod");

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  const prod = process.argv.includes("--prod");
  const out = prod ? PROD_DIST : DIST;
  const env = { ...process.env };
  if (prod) {
    delete env.EXPO_PUBLIC_JSTACK_TEST;
    env.NODE_ENV = "production";
  } else {
    env.EXPO_PUBLIC_JSTACK_TEST = "1";
    if (process.argv.includes("--swap")) {
      // BS-05 swap proof: the SAME test build, pointed at the reference server
      env.EXPO_PUBLIC_API_BASE_URL = process.env.JSTACK_SWAP_API ?? "http://localhost:8787/api/v1";
      env.EXPO_PUBLIC_USE_API_ADAPTER = "1";
    }
  }
  rmSync(out, { recursive: true, force: true });
  const res = spawnSync("npx", ["expo", "export", "--platform", "web", "--output-dir", out], {
    stdio: "inherit",
    shell: true,
    env,
  });
  if ((res.status ?? 1) === 0) {
    // §14.9 SEC-09, SH-08: the meta CSP is the SERVED one (public/_headers),
    // less what a <meta> cannot carry, plus loopback connect in the test
    // flavour — derived by tools/csp.mjs, never a second string (R-13).
    const csp = metaCsp(servedCsp(readFileSync(join(root, "public", "_headers"), "utf8")), { prod });
    const indexPath = join(out, "index.html");
    let html = readFileSync(indexPath, "utf8");
    html = html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);

    // P-1 (ADR-38): the manifest, the head tags a PWA needs, and the icons.
    // All of it here rather than in `app/+html.tsx`, which Expo Router reads
    // only for `output: "static"` — see the font note below and B-08. The
    // manifest's VALUES come from app.json's `expo.web`, so they are declared
    // where a reader looks for them and written where they actually ship.
    const web = JSON.parse(readFileSync(join(root, "app.json"), "utf8")).expo.web;
    const manifest = {
      name: web.name,
      short_name: web.shortName,
      description: web.description,
      start_url: web.startUrl,
      scope: web.scope,
      display: web.display,
      theme_color: web.themeColor,
      background_color: web.backgroundColor,
      icons: [192, 512].map((size) => ({ src: `/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any maskable" })),
      // W-1 / UP-04 (ADR-64): the PWA share target. Android's share sheet and
      // a desktop PWA can hand a title, text and a link straight to `/capture`
      // — not files, which nothing received (A4R9-03).
      //
      // `method: "POST"` keeps the words out of a query string: the browser
      // posts the form to the route and the service worker's fetch handler turns
      // it back into a navigation with the words on the FRAGMENT
      // (`public/sw.js`). Text and links that arrive WITHOUT files still reach
      // the same route through the iOS Shortcut's URL FRAGMENT, which is the
      // half that never touches a server log (SEC-11's stated exception).
      //
      // iOS cannot put a web app in the share sheet's icon row at all — that
      // needs a native share extension, which is the first item of the native
      // track (contract §8 Q22). The Shortcut in HANDOVER.md is what carries
      // iOS until then, and it is a recipe rather than a promise.
      share_target: {
        action: "/capture",
        method: "POST",
        enctype: "multipart/form-data",
        // A4R9-03: what the app RECEIVES — nothing listened for the files this
        // once declared, so a shared file was dropped; POST keeps the words out of
        // a query string (the worker moves them to the fragment)
        params: { title: "title", text: "text", url: "url" },
      },
    };
    writeFileSync(join(out, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
    // E-1 / TE-01: Expo emits its own viewport meta ("…, shrink-to-fit=no")
    // further down the head. Injecting ours after <head> put TWO in the
    // document, and the LAST one wins — so `maximum-scale=1` was in the file,
    // greppable, and completely inert. A unit test on this tool's source said
    // the string was there; the browser said the page still zoomed. Drop
    // Expo's before adding ours, and TE-01 counts the metas in the served head
    // rather than trusting that one of them is the one being obeyed.
    html = html.replace(/[ \t]*<meta[^>]*name=["']viewport["'][^>]*>\s*/gi, "");
    html = html.replace(
      "<head>",
      [
        "<head>",
        '<link rel="manifest" href="/manifest.webmanifest">',
        // per scheme: the browser chrome should match the ground the app is
        // actually painting, not one of the two
        `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${web.themeColor}">`,
        `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${web.themeColorDark}">`,
        '<link rel="apple-touch-icon" href="/icons/icon-192.png">',
        '<meta name="apple-mobile-web-app-capable" content="yes">',
        // E-1 / TE-01: `maximum-scale=1` is what stops iOS Safari zooming the
        // page when a field takes focus. Safari zooms whenever the focused
        // input's font is under 16px, and the pack's body size is 12.5 — so
        // the alternative was a 16px input, which would have put one control
        // off the type scale on every screen to fix a browser behaviour.
        //
        // The cost, recorded in design/DISCREPANCIES.md: on Android this also
        // disables pinch-zoom of the page. iOS Safari has ignored
        // `maximum-scale` for pinch since iOS 10, so Josh's iPhone keeps it.
        '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content">',
        // F-2: preload the two faces the first screen paints with. The
        // @font-face block below tells the browser they exist; a preload
        // starts the fetch before the CSS is parsed.
        //
        // Kept WITHOUT a measurement behind it, which is the exception to
        // F-1's rule and is stated rather than hidden: four runs with and
        // four without differ by less than the run-to-run variance, because
        // `tools/serve-web.mjs` is loopback and a preload can only buy
        // latency it does not have. The mechanism is not in doubt — a
        // render-blocking font on a real connection is exactly what preload
        // is for — but this harness cannot see it, and DEVICE_RUNBOOK_v21.md
        // step 1 is where it would show. Only the two REGULAR weights:
        // preloading all five would compete with the bundle for the same
        // connection (B-26).
        '<link rel="preload" as="font" type="font/ttf" href="/fonts/InstrumentSans_400Regular.ttf" crossorigin="anonymous">',
        '<link rel="preload" as="font" type="font/ttf" href="/fonts/SourceSerif4_400Regular.ttf" crossorigin="anonymous">',
      ].join(""),
    );
    // S-4 (SM-06): the pack's two typefaces, declared against the files
    // `tools/vendor-fonts.mjs` vendored into `public/fonts/`. This is done
    // here rather than in `app/+html.tsx` because Expo Router only uses that
    // file for `output: "static"`; with `output: "single"` (app.json) it is
    // never read, and a version of this that lived there shipped nothing —
    // proved with a marker meta tag that never reached the export. See
    // BUGLOG_v21.md B-08.
    html = html.replace("<head>", `<head><style id="jstack-fonts">${fontFaceCss((f) => `/fonts/${f.file}`)}</style>`);
    // §14.9 SRI (AUDIT D-29): every referenced script/stylesheet gets an
    // integrity hash so a tampered asset never executes, even same-origin
    let sriCount = 0;
    html = html.replace(/<(script[^>]*\ssrc|link[^>]*\shref)="(\/[^"]+\.(?:js|css))"/g, (m, attr, path) => {
      const digest = createHash("sha384").update(readFileSync(join(out, path))).digest("base64");
      sriCount++;
      return `${m.slice(0, 1)}${attr}="${path}" integrity="sha384-${digest}" crossorigin="anonymous"`;
    });
    writeFileSync(indexPath, html);
    console.log(`CSP + SRI on ${sriCount} asset(s) injected (${prod ? "production" : "test"} flavour)`);

    // B-03: stamp the export with a fingerprint of the source it came from, so
    // `e2e/assert-fresh-build.ts` can refuse a suite run against a bundle that
    // is not this tree. Content, not mtimes — see tools/source-fingerprint.mjs.
    const fingerprint = sourceFingerprint(root);
    writeFileSync(join(out, ".jstack-source.json"), JSON.stringify({ ...fingerprint, at: new Date().toISOString() }, null, 2) + "\n");
    console.log(`source fingerprint ${fingerprint.hash.slice(0, 12)} over ${fingerprint.files} files`);

    // PW-A / C-6: fill the service worker's precache list. The entry bundle's
    // name carries a content hash, so this is the only place that can know it
    // — and a shell precache without the code is a page that opens blank
    // offline (audit A-1). Read off the index.html just written, so the list
    // is exactly what the page asks for rather than a second guess at it.
    const filled = fillServiceWorker(out, html);
    if (filled != null) {
      console.log(`service worker precaches ${filled.paths.length} build asset(s): ${filled.assets.length} script/style, ${filled.fonts.length} vendored font(s), ${filled.assetFonts.length} bundled face(s)`);
    }
  }
  process.exit(res.status ?? 1);
}
