/**
 * What the service worker must hold to open offline (PW-A, C-6).
 *
 * A function over a directory rather than a block inside `build-web.mjs`, so
 * it can be tested without a real export. The first version of C-6's tests
 * asserted against `~/.jstack-dist` and went red on CI, where nothing builds
 * the web export — a unit test that needs a local build artefact is a unit
 * test that only passes on the machine it was written on.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

/** not exported: `fillServiceWorker` is the only thing that needs it, and
 * CT-06 refuses an export nothing imports. The tests pin the literal. */
const PRECACHE_MARKER = "[/* __JSTACK_BUILD_PRECACHE__ */]";

/**
 * @param out  the export directory
 * @param html the index.html that was just written into it
 * @returns the paths the worker precaches, in a stable order
 *
 * Three groups, and the third is the one audit A-1 was actually missing:
 *   - the scripts and stylesheets index.html asks for (the hashed entry)
 *   - the vendored faces in /fonts/, which the @font-face block paints with
 *   - the SAME faces again under /assets/, which `useFonts` loads and the
 *     splash waits on. Miss these and the shell boots into an empty #root:
 *     the bundle runs, `useAppFonts()` never resolves, RootLayout renders null.
 *
 * The third group is derived from the second rather than named again (rule 16).
 * The export carries 42 .ttf variants and the app uses five; precaching the
 * directory would add megabytes to an install that must survive a bad line.
 */
export function precacheList(out, html) {
  const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);

  const fontsDir = join(out, "fonts");
  const fonts = existsSync(fontsDir)
    ? readdirSync(fontsDir)
        .filter((f) => /\.(ttf|woff2?)$/.test(f))
        .sort()
        .map((f) => `/fonts/${f}`)
    : [];

  const faceNames = fonts.map((f) => f.split("/").pop().replace(/\.[^.]+$/, ""));
  const assetFonts = [];
  const assetsRoot = join(out, "assets");
  if (existsSync(assetsRoot)) {
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (faceNames.some((name) => entry.name.startsWith(`${name}.`))) {
          assetFonts.push("/" + p.slice(out.length + 1).split(sep).join("/"));
        }
      }
    };
    walk(assetsRoot);
  }

  return { paths: [...new Set([...assets, ...fonts, ...assetFonts])], assets, fonts, assetFonts };
}

/** Fill the marker in the exported worker. Throws rather than shipping a shell
 * with no code in it — a silent no-op here is audit A-1 all over again. */
export function fillServiceWorker(out, html) {
  const swPath = join(out, "sw.js");
  if (!existsSync(swPath)) return null;

  const list = precacheList(out, html);
  const sw = readFileSync(swPath, "utf8");
  if (!sw.includes(PRECACHE_MARKER)) {
    throw new Error("sw.js has no __JSTACK_BUILD_PRECACHE__ marker — the shell would precache no code (PW-A).");
  }
  writeFileSync(swPath, sw.replace(PRECACHE_MARKER, JSON.stringify(list.paths)));
  return list;
}
