/**
 * Packages the built web export into ONE self-contained .html file — the
 * shareable interactive mock. It is not a drawing of the design: it is the
 * real app, running on its fixture data, with no server and no network.
 *
 *   pnpm build:web:prod       # produce ~/.jstack-dist-prod first
 *   node tools/build-mock.mjs # → ../jstack-mock-v15.html (repo root)
 *
 * It reads the PRODUCTION export, not the test one (B7-08). The default used
 * to be ~/.jstack-dist and the line above used to say `pnpm build:web`, so the
 * documented invocation embedded the whole test rig — __JSTACK__, the clock and
 * connectivity levers, the STT rig, unlockForCapture — in the one artifact that
 * gets handed to people. Every committed mock happened to be built with the env
 * override, so nothing shipped wrong; nothing stopped it either. Now the default
 * is the prod dist AND the rig markers are refused below, so the wrong bundle
 * cannot be written even deliberately.
 *
 * Three things have to be handled to make a single file work on a host that
 * serves exactly one path (see the shim below): fonts, the router's URL
 * writes, and the passkey gate.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { sourceFingerprint } from "./source-fingerprint.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { FACES, fontFaceCss, vendoredOf } from "./vendor-fonts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dist = process.env.JSTACK_DIST ?? join(homedir(), ".jstack-dist-prod");
/** ONE source for the version. The filename and the two on-screen strings
 * drifted apart in v1.2 — the file was renamed to v8 and both strings inside
 * it still said v7, so the artifact Josh is told to open first introduced
 * itself as the previous one (AUDIT R3-D5). Change this, not three places. */
const MOCK_VERSION = "v15";
const out = process.env.JSTACK_MOCK_OUT ?? join(here, "..", "..", `jstack-mock-${MOCK_VERSION}.html`);

const index = readFileSync(join(dist, "index.html"), "utf8");
const entry = index.match(/src="(\/_expo\/static\/js\/web\/entry-[^"]+\.js)"/)?.[1];
if (!entry) throw new Error(`no entry bundle in ${dist}/index.html — run pnpm build:web first`);

// An inline <script> ends at the first "</script" in the source, even inside a
// string literal, so neutralise the sequence before embedding.
const bundle = readFileSync(join(dist, entry.slice(1)), "utf8").replace(/<\/script/gi, "<\\/script");

// SEC-01, enforced where it can actually be violated (B7-08). This file is the
// one build output that leaves the machine as a file, so it refuses to package
// a bundle carrying the test rig rather than trusting whoever ran it to have
// pointed at the right dist.
// Every marker here was counted in both bundles before it was trusted: each
// is 0 in ~/.jstack-dist-prod and 1 in ~/.jstack-dist. Two candidates were
// dropped for failing that test rather than kept for looking right —
// `installTestHook` (the call site survives minification in both flavours, so
// it is present in the PROD bundle twice and means nothing) and
// `biometric.approve` (0 in both; the property access is minified away).
const RIG_MARKERS = ["__JSTACK__", "unlockForCapture", "setAutoLockMs"];
const rigFound = RIG_MARKERS.filter((m) => bundle.includes(m));
if (rigFound.length > 0) {
  throw new Error(
    `refusing to write the mock: ${dist} is a TEST build — its bundle contains ${rigFound.join(", ")}. ` +
      "Run pnpm build:web:prod and build the mock from ~/.jstack-dist-prod (SEC-01).",
  );
}

/** S-4: the faces come from `public/fonts/` — the committed, reviewed bytes
 *  `tools/vendor-fonts.mjs` puts there — rather than out of the export's copy
 *  of node_modules. One source of truth, and it is the one in the diff.
 *
 *  A single-file mock has no `/fonts/` path to serve, so everything is a data:
 *  URI here. TWO sets of rules are needed and both matter:
 *
 *  1. The PACK names ('Instrument Sans', 'Source Serif 4'), which is what
 *     `theme/tokens.ts`'s stacks actually ask for. `build-web.mjs` injects
 *     these into the export's index.html; the mock writes its own <head>, so
 *     it builds the same block through the same `fontFaceCss()`. Before S-4
 *     `lib/webFonts.ts` did it at runtime by aliasing; that file is gone.
 *  2. The IMPORT KEYS (`InstrumentSans_400Regular`, …), which is what
 *     `useFonts()` registers and what the shim matches on. Still needed: the
 *     app waits on `useFonts` before it renders. */
const dataUri = (file) => "data:font/ttf;base64," + readFileSync(vendoredOf({ file })).toString("base64");

const FONT_FACE_CSS = fontFaceCss((f) => dataUri(f.file));

const FONTS = Object.fromEntries(FACES.map((f) => [f.file.replace(/\.ttf$/, ""), dataUri(f.file)]));

const shim = `
(function () {
  var FONTS = __FONTS__;

  // 1. FONTS. expo-font registers faces pointing at /assets/… paths that do
  //    not exist on a single-file host. It builds each @font-face rule and
  //    inserts it with document.createTextNode, then immediately awaits
  //    document.fonts.load() — so the substitution has to happen at insertion
  //    time. Patching the rule after the fact loses the race and the app
  //    never finishes booting (it waits on useFonts forever).
  var realCreateTextNode = document.createTextNode.bind(document);
  document.createTextNode = function (text) {
    if (typeof text === "string" && text.indexOf("@font-face") !== -1 && text.indexOf("/assets/") !== -1) {
      for (var fam in FONTS) {
        if (text.indexOf(fam) !== -1) {
          return realCreateTextNode('@font-face{font-family:"' + fam + '";src:url("' + FONTS[fam] + '");font-display:auto}');
        }
      }
    }
    return realCreateTextNode(text);
  };

  // Belt-and-braces for any face registered through the FontFace API instead.
  var RealFontFace = window.FontFace;
  window.FontFace = function (family, source, descriptors) {
    if (typeof source === "string") {
      for (var fam in FONTS) {
        if (source.indexOf(fam) !== -1 || family === fam) {
          source = 'url("' + FONTS[fam] + '")';
          break;
        }
      }
    }
    return new RealFontFace(family, source, descriptors);
  };
  window.FontFace.prototype = RealFontFace.prototype;

  // 1b. NO SERVICE WORKER. This file is the whole app; there is no /sw.js
  //     beside it, wherever it is served from. The app's own registration in
  //     lib/pwa.ts already swallows the promise rejection, but the BROWSER
  //     logs the failed fetch itself — "An unknown error occurred when
  //     fetching the script", three times — and that console is the first
  //     thing a developer sees in the artefact we hand them, on Josh's phone
  //     and in REMAP's browser alike (the planner's 20:25 check of v14).
  //     Hiding the API is what lib/pwa.ts already tests for: it returns early
  //     when navigator.serviceWorker is null. So the app skips registration
  //     HERE and keeps it everywhere else — the web export registers exactly
  //     as it did, and pwa.test.ts is untouched.
  //     (No backticks in this comment: it lives inside the shim's own
  //     template literal, and one of them ends the string.)
  try {
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, get: function () { return undefined; } });
  } catch (e) {
    /* a browser that refuses the redefinition still only logs the fetch */
  }

  // 2. ROUTING. Keep the address bar constant: expo-router drives navigation
  //    from its own state, and a single-path host would 404 on refresh if the
  //    URL had moved to /tasks.
  var push = history.pushState.bind(history);
  var replace = history.replaceState.bind(history);
  history.pushState = function (s, t) { try { push(s, t, location.pathname + location.search); } catch (e) {} };
  history.replaceState = function (s, t) { try { replace(s, t, location.pathname + location.search); } catch (e) {} };

  // 3. THE GATE IS REAL (B7-05). An earlier version of this shim polled the
  //    test build's unlock lever 300 times, but the mock is built from the
  //    PRODUCTION export, which strips the whole test hook (SEC-01), so the
  //    lever was never there to find. Nothing in this shim opens the gate.
  //    Served over https or localhost, the file unlocks with the viewer's own
  //    passkey. Opened straight from disk, where no browser will run a
  //    passkey ceremony, the APP offers its own way in: Gate.tsx shows the
  //    mock sign-in only while it runs on its in-process mock, and a build
  //    pointed at a server never renders it (v2.3.1 WPN-1; Josh, 15 Sep:
  //    "It's a mock"). The file-open cases in e2e/core/mockfile.spec.ts
  //    hold it.

  window.addEventListener("DOMContentLoaded", function () {
    var chip = document.getElementById("mock-chip");
    if (!chip) return;
    chip.addEventListener("click", function () { chip.remove(); });

    // TE-04: no banner under 768. The chip is pinned top-right and on a phone
    // it lands on the header's own controls — it is a note to whoever opens
    // the file on a desktop, and the phone is the width Josh actually reviews.
    //
    // NO BACKTICKS ANYWHERE IN THIS BLOCK: it lives inside a template literal,
    // so one backtick in a comment ends the string and the tool dies at parse
    // with a SyntaxError pointing at the next word. It did exactly that once.
    //
    // matchMedia rather than a CSS media query so the element is genuinely not
    // there: a hidden button still takes hit-testing in some engines, and the
    // acceptance asks whether the mock RENDERS one.
    var narrow = window.matchMedia("(max-width: 767px)");

    // TE-03: and it gets out of the way while a field is the expanded editor,
    // whatever the width. The app sets data-editor-expanded on <body> — this
    // file is a built artefact and knows nothing about React, so an attribute
    // is the whole interface between them.
    function apply() {
      var expanded = document.body.hasAttribute("data-editor-expanded");
      chip.style.display = narrow.matches || expanded ? "none" : "";
    }
    apply();
    // addListener as well: older WebKit on an iPad has no addEventListener on
    // a MediaQueryList, and this file is opened on whatever is to hand.
    if (narrow.addEventListener) narrow.addEventListener("change", apply);
    else if (narrow.addListener) narrow.addListener(apply);
    new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ["data-editor-expanded"] });
  });
})();
`.replace("__FONTS__", JSON.stringify(FONTS));

/**
 * QA-06 (V2.2 C-6): stamp the source this mock was packaged from.
 *
 * The guard used to compare COMMIT times, and that had two failure modes
 * pointing opposite ways. A source change that does not alter the packaged
 * output — C-6 changed only `sw.js`, which the single-file mock does not
 * embed — leaves the mock byte-identical, so git has nothing to commit, so its
 * last commit stays behind source and the board goes red with no way to fix it
 * but an empty commit. And a commit that touches the mock for any reason at
 * all satisfies the guard whether or not the mock was rebuilt.
 *
 * A fingerprint answers the question the guard is actually asking: was this
 * file built from this source?
 */
const fingerprint = sourceFingerprint(join(here, ".."));

/**
 * TE-01 (v2.21): the viewport is the web build's, character for character.
 * `maximum-scale=1` is what stops iOS Safari zooming the page when a field
 * under 16px takes focus, and `tools/build-web.mjs` says why at length. The
 * value is copied rather than imported because that tool builds when it is
 * loaded; "the packaged mock's viewport meta is the web build's" in
 * `tests/unit/pwa.test.ts` keeps the two equal.
 */
const html = `<!DOCTYPE html>
<html lang="en">
<!-- jstack-source: ${fingerprint.hash} (${fingerprint.files} files) -->
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
<title>JSTACK Mock ${MOCK_VERSION}</title>
<style id="expo-reset">
  html, body { height: 100%; }
  body { overflow: hidden; margin: 0; background: #F4F3EE; }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<style id="jstack-fonts">
${FONT_FACE_CSS}
</style>
<style id="mock-chip-style">
  #mock-chip { position: fixed; right: 10px; top: 10px; z-index: 99999; font: 600 10.5px/1 ui-monospace, Menlo, Consolas, monospace;
    letter-spacing: .4px; color: #EDEFE7; background: rgba(27,31,23,.82); border: 1px solid rgba(255,255,255,.22);
    padding: 6px 9px; border-radius: 8px; cursor: pointer; backdrop-filter: blur(6px); }
  #mock-chip:hover { background: rgba(27,31,23,.95); }
</style>
</head>
<body>
<div id="root"></div>
<button id="mock-chip" title="Click to hide">JSTACK · mock ${MOCK_VERSION} · resize for tablet and desktop</button>
<script>${shim}</script>
<script>${bundle}</script>
</body>
</html>`;

writeFileSync(out, html);
console.log(`mock written: ${out} (${(html.length / 1048576).toFixed(2)} MB)`);
