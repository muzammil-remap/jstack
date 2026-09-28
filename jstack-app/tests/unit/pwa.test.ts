/**
 * P-1 — the PWA's configuration is real, consistent, and says what it means.
 *
 * The failure mode this guards is specific: a policy that is right on one
 * host and missing on the other. `_headers` (Netlify, Cloudflare) and
 * `vercel.json` describe the same site, are read by different platforms, and
 * nothing but a test can keep them saying the same thing. A header present in
 * one and absent in the other passes every spot check and protects nobody on
 * half the deployments.
 *
 * The icons are checked as PNGs rather than as bytes: asserting a hash would
 * mean regenerating the expectation from the generator, which proves only
 * that it is deterministic (hard rule 11).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const app = join(__dirname, "..", "..");
const repo = join(app, "..");

const headersText = () => readFileSync(join(app, "public", "_headers"), "utf8");
const vercel = () =>
  JSON.parse(readFileSync(join(app, "vercel.json"), "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
    rewrites: { source: string; destination: string }[];
  };
const appJson = () => JSON.parse(readFileSync(join(app, "app.json"), "utf8")) as { expo: { web: Record<string, string> } };

/** The `/*` block of `_headers`, as key to value. */
function globalHeaders(): Record<string, string> {
  const out: Record<string, string> = {};
  let inGlobal = false;
  for (const raw of headersText().split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("#") || line.trim() === "") continue;
    if (!line.startsWith(" ")) {
      inGlobal = line.trim() === "/*";
      continue;
    }
    if (!inGlobal) continue;
    const at = line.indexOf(":");
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

describe("P-1 / PW-04 · the two host configurations say the same thing", () => {
  it("every site-wide header in _headers is in vercel.json, with the same value", () => {
    const fromHeaders = globalHeaders();
    const fromVercel = Object.fromEntries((vercel().headers.find((h) => h.source === "/(.*)")?.headers ?? []).map((h) => [h.key, h.value]));
    expect(Object.keys(fromHeaders).length).toBeGreaterThan(5); // else this asserts nothing
    expect(fromVercel).toEqual(fromHeaders);
  });

  it("the headers that matter are actually there (SH-01)", () => {
    const h = globalHeaders();
    expect(h["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
  });

  it("the CSP allows no external origin — the fonts are bundled", () => {
    // SEC-09: an external origin in the policy is the whole difference between
    // "this app talks to its backend" and "this app talks to anyone"
    expect(globalHeaders()["Content-Security-Policy"]).not.toMatch(/https?:\/\//);
  });

  it("the worker and the manifest are uncached on both hosts", () => {
    // a cached service worker cannot replace itself, and the app would be
    // stuck on an old shell until someone cleared their browser
    expect(headersText()).toMatch(/\/sw\.js\s*\n\s*Cache-Control:\s*no-cache/);
    expect(vercel().headers.find((h) => h.source === "/sw.js")?.headers[0]).toEqual({ key: "Cache-Control", value: "no-cache" });
  });

  it("vercel.json rewrites everything that is not a real asset to the shell", () => {
    // without this, a refresh on /tasks is a 404: Expo Router routes
    // client-side and the server has never heard of the path
    const rewrite = vercel().rewrites[0];
    expect(rewrite.destination).toBe("/index.html");
    for (const real of ["_expo", "fonts", "icons", "sw", "manifest"]) expect(rewrite.source).toContain(real);
  });
});

describe("P-1 / PW-01 / PW-03 · the manifest is declared where a reader looks and shipped where it counts", () => {
  it("app.json carries the manifest's values", () => {
    const web = appJson().expo.web;
    expect(web.name).toBe("JSTACK");
    expect(web.display).toBe("standalone");
    expect(web.themeColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(web.themeColorDark).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(web.themeColor).not.toBe(web.themeColorDark);
  });

  it("there is no app/+html.tsx — Expo never reads one at output single", () => {
    // ADR-38 and B-08: a file that looks like configuration and is never read
    // is worse than no file, because the next person believes it
    expect(appJson().expo.web.output).toBe("single");
    expect(existsSync(join(app, "app", "+html.tsx"))).toBe(false);
  });

  it("tools/build-web.mjs is what actually emits the head and the manifest", () => {
    const build = readFileSync(join(app, "tools", "build-web.mjs"), "utf8");
    expect(build).toContain("manifest.webmanifest");
    expect(build).toContain("apple-touch-icon");
    expect(build).toContain("viewport-fit=cover");
    expect(build).toContain("theme-color");
  });

  /**
   * TE-01. Josh, on the iPhone: focusing a field zooms the page. Safari does
   * that whenever the focused input's font is under 16 px, and the pack's body
   * size is 12.5 — so the choice is a 16 px input that breaks the type scale
   * everywhere, or telling the page it may not scale on focus. E-1 takes the
   * second, in the head, where it costs the design nothing.
   *
   * The trade-off is real and recorded in design/DISCREPANCIES.md: on Android,
   * `maximum-scale=1` also disables pinch-zoom on the page. iOS Safari has
   * ignored `maximum-scale` for pinch since 10, so the iPhone keeps it.
   *
   * Asserted on the SOURCE of the tool that emits the head, not on a built
   * artefact: a unit test that reads ~/.jstack-dist passes here and fails on
   * CI, which never builds one.
   */
  it("TE-01 · the served viewport meta refuses the focus zoom", () => {
    const build = readFileSync(join(app, "tools", "build-web.mjs"), "utf8");
    expect(build).toContain("maximum-scale=1");
  });

  /**
   * TE-01, the mock's half (v2.21). `tools/build-mock.mjs` writes its own head,
   * so the packaged mock — the quickest walkthrough HANDOVER.md §1.1 offers —
   * kept a viewport without `maximum-scale=1` and zoomed on an iPhone where
   * DEVICE_RUNBOOK.md §2 says a zoom is wrong. Read from the committed mock
   * and from the tool that emits the web head, never from an export CI does
   * not build; the mock's name comes from the tool, as QA-06's does.
   */
  it("TE-01 · the packaged mock's viewport meta is the web build's", () => {
    const viewports = (text: string): string[] => [...text.matchAll(/<meta name="viewport" content="([^"]*)"/g)].map((m) => m[1]);
    const web = viewports(readFileSync(join(app, "tools", "build-web.mjs"), "utf8"));
    const version = /MOCK_VERSION = "(v\d+)"/.exec(readFileSync(join(app, "tools", "build-mock.mjs"), "utf8"))?.[1];
    const mock = viewports(readFileSync(join(repo, `jstack-mock-${version}.html`), "utf8"));
    expect(web).toHaveLength(1); // else the comparison below is against nothing
    // one meta, and the same one: a second viewport meta is the one obeyed
    expect({ mock }).toEqual({ mock: web });
  });

  /**
   * v2.3.2 WPR-4. Josh, 16 Sep, on his iPhone: the page did not share the screen with the keyboard, and stayed zoomed
   * and cropped after Enter. `interactive-widget=resizes-content` asks the browser to shrink the layout viewport for the
   * keyboard rather than scroll the page under it; `viewport-fit=cover` stays for the notch. The mock's head is held
   * to the same meta by the case above.
   */
  it("WPR-4 · the viewport meta resizes the content for the keyboard, and still covers the notch", () => {
    const build = readFileSync(join(app, "tools", "build-web.mjs"), "utf8");
    const meta = /<meta name="viewport" content="([^"]*)"/.exec(build)?.[1] ?? "";
    expect(meta).toContain("interactive-widget=resizes-content");
    expect(meta).toContain("viewport-fit=cover");
  });

  /**
   * UP-04, A4R9-03 (A-4 round 9). The share target offered to take FILES, and
   * the worker handed them to whatever page was already open before redirecting
   * to `/capture` as a fresh load — so no page ever listened, the file was
   * dropped, and a share of only a file said "Nothing shared". The target now
   * declares what the app receives: the title, the text and the link, POSTed so
   * the words never ride in a query string. A file reaches JSTACK through the
   * attach control or the Dropbox inbox.
   */
  it("UP-04 · the share target declares only what the app receives, and posts it", () => {
    const build = readFileSync(join(app, "tools", "build-web.mjs"), "utf8");
    const block = build.slice(build.indexOf("share_target: {"), build.indexOf("},", build.indexOf("params:")) + 2);
    expect(block).toContain('action: "/capture"');
    expect(block).toContain('method: "POST"');
    const params = block.slice(block.indexOf("params:")).split(/\r?\n/)[0];
    expect(params).toBe('params: { title: "title", text: "text", url: "url" },');
    // and the worker keeps no branch that posts files to a page nobody opened
    expect(readFileSync(join(app, "public", "sw.js"), "utf8")).not.toContain("share-files");
  });
});

describe("P-1 · the icons", () => {
  it("are real PNGs at the sizes the manifest claims", () => {
    for (const size of [192, 512]) {
      const file = join(app, "public", "icons", `icon-${size}.png`);
      const bytes = readFileSync(file);
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      // IHDR width and height, big-endian, at a fixed offset
      expect(bytes.readUInt32BE(16)).toBe(size);
      expect(bytes.readUInt32BE(20)).toBe(size);
      expect(statSync(file).size).toBeGreaterThan(100);
    }
  });

  it("regenerating them changes nothing — the encoder is deterministic", () => {
    const dir = mkdtempSync(join(tmpdir(), "jstack-icons-"));
    try {
      execFileSync(process.execPath, [join(app, "tools", "gen-app-icons.mjs"), "--out", dir], { cwd: app });
      for (const size of [192, 512]) {
        expect(readFileSync(join(dir, `icon-${size}.png`))).toEqual(readFileSync(join(app, "public", "icons", `icon-${size}.png`)));
      }
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // a leftover temp directory is harmless
      }
    }
  });
});

describe("P-1 / PW-02 · the service worker refuses to cache what it must not", () => {
  const sw = () => readFileSync(join(app, "public", "sw.js"), "utf8");

  it("never touches /api/", () => {
    // a cached answer to "what is on my plate today" is worse than no answer,
    // because it looks current
    expect(sw()).toContain('url.pathname.startsWith("/api/")');
  });

  it("refuses any response carrying the contract's sensitivity marker", () => {
    // money, health and journal text (CONTRACT §3) — the cache is unencrypted
    // storage that outlives the session
    expect(sw()).toContain('"sensitivity":"sens"');
    expect(sw()).toContain("carriesSensitive");
  });

  it("takes over on the next load rather than waiting for every tab to close", () => {
    expect(sw()).toContain("skipWaiting");
    expect(sw()).toContain("clients.claim");
  });

  it("has exactly one fetch listener", () => {
    // two handlers both calling respondWith on one event throws, and a
    // navigation to "/" matches both a static asset and a navigation
    expect([...sw().matchAll(/addEventListener\("fetch"/g)]).toHaveLength(1);
  });

  it("is registered only in a production web build", () => {
    const pwa = readFileSync(join(app, "lib", "pwa.ts"), "utf8");
    expect(pwa).toContain("IS_TEST_BUILD");
    expect(pwa).toContain('Platform.OS !== "web"');
  });
});

describe("P-1 / PW-05 · DEPLOY.md tells the truth about the two flavours", () => {
  it("says never to deploy the test flavour, and names the check that catches it", () => {
    const deploy = readFileSync(join(repo, "DEPLOY.md"), "utf8").replace(/\s+/g, " ");
    expect(deploy).toContain("Never deploy the test flavour");
    expect(deploy).toContain("SEC-01");
    expect(deploy).toContain("conformance.mjs");
  });
});

/**
 * QA-06 — the packaged mock was built from THIS source.
 *
 * AUDIT_v21.md A-3: the mock had been committed at 10:08 and the code moved
 * twenty-seven commits past it while QA-06 read PASS on the strength of
 * 'tools/build-mock.mjs' existing. The mock is the built app in one file; a
 * stale one is a screenshot of a different app.
 *
 * V2.1 answered that with commit times, and V2.2 row C-6 found both ends of
 * why that does not hold. A source change the packaged output does not embed —
 * C-6 changed 'public/sw.js', which a single-file mock has no use for — leaves
 * the mock byte-identical, so git has nothing to commit, so its last commit
 * stays behind source and the board goes red with no honest way to clear it.
 * And in the other direction, ANY commit that happens to touch the mock
 * satisfies a commit-time check whether or not it was rebuilt.
 *
 * So the mock carries a fingerprint of the source it was packaged from, and
 * this compares it with the source as it stands. That is the question the
 * guard was always asking.
 */
describe("QA-06 · the packaged mock was built from this source", () => {
  /**
   * The version is DERIVED from the build tool, never spelled here. A-6
   * renames the mock to v14 at the release, and a second copy of the number
   * would send this guard red for a rename that changed nothing about
   * freshness — the drift hard rule 16 is about. `MOCK_VERSION` in
   * `tools/build-mock.mjs` is the one declaration of what the file is called.
   */
  const mockVersion = /MOCK_VERSION = "(v\d+)"/.exec(readFileSync(join(app, "tools", "build-mock.mjs"), "utf8"))?.[1];
  const mockPath = join(app, "..", `jstack-mock-${mockVersion}.html`);

  it("the mock's name comes from the build tool, so a version bump cannot strand this guard", () => {
    expect(mockVersion).toMatch(/^v\d+$/);
    expect(existsSync(mockPath)).toBe(true);
  });

  /** the same hash the build stamps, recomputed here — a child process
   * because Jest's CommonJS transform will not take an ES module tool */
  function currentFingerprint(): { hash: string; files: number } {
    const url = pathToFileURL(join(app, "tools", "source-fingerprint.mjs")).href;
    const script = [
      "const M = await import(" + JSON.stringify(url) + ");",
      "console.log(JSON.stringify(M.sourceFingerprint(" + JSON.stringify(app) + ")));",
    ].join("");
    return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" }));
  }

  it("the mock carries a source fingerprint at all", () => {
    const stamp = /<!-- jstack-source: ([0-9a-f]{64}) \((\d+) files\) -->/.exec(readFileSync(mockPath, "utf8"));
    expect({ stamped: stamp != null }).toEqual({ stamped: true });
    expect(Number(stamp![2])).toBeGreaterThan(100);
  });

  it("that fingerprint is the source as it stands — a stale mock is a screenshot of a different app", () => {
    const stamp = /<!-- jstack-source: ([0-9a-f]{64}) \((\d+) files\) -->/.exec(readFileSync(mockPath, "utf8"));
    const now = currentFingerprint();
    expect({ mock: stamp?.[1], source: now.hash }).toEqual({ mock: now.hash, source: now.hash });
  });

  /**
   * B-07 — CRLF and LF are the same source.
   *
   * '.gitattributes' says 'eol=lf', but the build machine has
   * 'core.autocrlf=true' and a working tree full of CRLF anyway. A byte-for-byte
   * hash computed there never matches the same commit checked out on Linux, so
   * QA-06 was green locally and red on every CI run — a fingerprint that depends
   * on the checkout is not a fingerprint of the source.
   */
  it("the fingerprint ignores line endings, or it could never match a Linux checkout", () => {
    const url = pathToFileURL(join(app, "tools", "source-fingerprint.mjs")).href;
    const of = (dir: string): string => {
      const script = ["const M = await import(" + JSON.stringify(url) + ");", "console.log(M.sourceFingerprint(" + JSON.stringify(dir) + ").hash);"].join("");
      return execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" }).trim();
    };

    const lf = mkdtempSync(join(tmpdir(), "jstack-lf-"));
    const crlf = mkdtempSync(join(tmpdir(), "jstack-crlf-"));
    const body = "export const x = 1;\nexport const y = 2;\n";
    for (const [dir, text] of [
      [lf, body],
      [crlf, body.split("\n").join("\r\n")],
    ] as const) {
      mkdirSync(join(dir, "lib"), { recursive: true });
      writeFileSync(join(dir, "lib", "sample.ts"), text);
    }

    expect(of(lf)).toBe(of(crlf));

    // and it is not simply blind: different CONTENT still differs
    const other = mkdtempSync(join(tmpdir(), "jstack-other-"));
    mkdirSync(join(other, "lib"), { recursive: true });
    writeFileSync(join(other, "lib", "sample.ts"), "export const x = 2;\n");
    expect(of(other)).not.toBe(of(lf));

    for (const dir of [lf, crlf, other]) rmSync(dir, { recursive: true, force: true });
  });

  it("the fingerprint moves when source moves — otherwise it proves nothing", () => {
    // recomputing over a directory that is not the source must differ, or the
    // comparison above would pass against anything
    const url = pathToFileURL(join(app, "tools", "source-fingerprint.mjs")).href;
    const script = [
      "const M = await import(" + JSON.stringify(url) + ");",
      "console.log(JSON.stringify(M.sourceFingerprint(" + JSON.stringify(join(app, "tests")) + ")));",
    ].join("");
    const other = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" }));
    expect(other.hash).not.toBe(currentFingerprint().hash);
  });
});

/**
 * CD-11 / PW-A (audit A-1, MAJOR) — the shell that opens offline must contain
 * the app.
 *
 * The precache held five files: "/", index.html, the manifest and two icons.
 * None of them is the code. After ONE online load an offline reload rendered
 * an empty `#root` and no gate — the worker served a shell with nothing in it,
 * which is worse than no worker, because the page opens and shows nothing.
 * It worked on the SECOND online load only because the runtime `fetch` handler
 * had cached the bundle by then, which is exactly the kind of "works when you
 * test it twice" that a precache exists to remove.
 *
 * The entry bundle's name is hashed per build, so the list cannot be written by
 * hand: `tools/build-web.mjs` fills it at export time from the index.html it
 * has just rewritten, and these assert against the EXPORT rather than the
 * source, because the source cannot know the hash.
 */

/**
 * CD-11 / PW-A (audit A-1, MAJOR) — the shell that opens offline must contain
 * the app.
 *
 * The precache held five files: "/", index.html, the manifest and two icons.
 * None of them is the code. After ONE online load an offline reload rendered
 * an empty '#root' and no gate — the worker served a shell with nothing in it,
 * which is worse than no worker, because the page opens and shows nothing.
 *
 * Driven over a SYNTHETIC export in a temp directory, never '~/.jstack-dist'.
 * The first cut of these asserted against the real export and went red on CI,
 * where nothing builds one: a unit test that needs a local build artefact is a
 * unit test that only passes on the machine it was written on. The subject is
 * 'tools/sw-precache.mjs' — the code that decides the list — run in a child
 * process because Jest's CommonJS transform will not take an ES module tool
 * (the same reason workflows.test.ts spawns one).
 */
describe("CD-11 · the precache holds the entry bundle and the fonts (PW-A)", () => {
  const ENTRY = "/_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js";
  const FACES = ["InstrumentSans_400Regular", "SourceSerif4_400Regular"];
  const HTML = '<html><head><script src="' + ENTRY + '"></script><link href="/style.css"></head></html>';
  const MARKER = "[/* __JSTACK_BUILD_PRECACHE__ */]";

  type Precache = { paths: string[]; assets: string[]; fonts: string[]; assetFonts: string[] };

  function call(fn: "precacheList" | "fillServiceWorker", out: string): Precache {
    const url = pathToFileURL(join(app, "tools", "sw-precache.mjs")).href;
    const script = [
      "const M = await import(" + JSON.stringify(url) + ");",
      "const r = M." + fn + "(" + JSON.stringify(out) + ", " + JSON.stringify(HTML) + ");",
      "console.log(JSON.stringify(r));",
    ].join("");
    return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" }));
  }

  let out: string;

  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "jstack-dist-"));
    // the bundle and the stylesheet index.html names, written to disk so the
    // "every precached path exists" case is checking something real
    mkdirSync(join(out, "_expo", "static", "js", "web"), { recursive: true });
    writeFileSync(join(out, ENTRY.slice(1).split("/").join(require("node:path").sep)), "//");
    writeFileSync(join(out, "style.css"), "");
    mkdirSync(join(out, "fonts"), { recursive: true });
    for (const face of FACES) writeFileSync(join(out, "fonts", face + ".ttf"), "x");
    // the SECOND copy — hashed, under assets/, the one useFonts loads
    const assetDir = join(out, "assets", "node_modules", "@expo-google-fonts", "instrument-sans");
    mkdirSync(assetDir, { recursive: true });
    for (const face of FACES) writeFileSync(join(assetDir, face + ".deadbeefdeadbeefdeadbeefdeadbeef.ttf"), "x");
    // a variant the app does NOT load, which must stay out of the list
    writeFileSync(join(assetDir, "InstrumentSans_700Bold_Italic.cafebabecafebabecafebabecafebabe.ttf"), "x");
    writeFileSync(join(out, "sw.js"), "const BUILD_PRECACHE = " + MARKER + ";");
  });

  afterAll(() => {
    try {
      rmSync(out, { recursive: true, force: true });
    } catch {
      // a leftover temp dir is harmless
    }
  });

  it("the source worker carries the marker the build fills, and no hand-written bundle path", () => {
    const source = readFileSync(join(app, "public", "sw.js"), "utf8");
    expect(source).toContain("__JSTACK_BUILD_PRECACHE__");
    // a hash written by hand would be wrong on the very next build
    expect(source).not.toMatch(/entry-[0-9a-f]{8}/);
  });

  it("the list holds the hashed entry bundle index.html actually asks for", () => {
    expect(call("precacheList", out).paths).toContain(ENTRY);
  });

  it("it holds the vendored faces AND the hashed copies useFonts loads", () => {
    const list = call("precacheList", out);
    for (const face of FACES) {
      expect(list.paths).toContain("/fonts/" + face + ".ttf");
      expect(list.paths.some((p) => p.includes("/assets/") && p.includes(face))).toBe(true);
    }
    // B-04: the half that was still missing after the bundle was added, and the
    // half that kept #root empty — the app waits on these before it renders
    expect(list.assetFonts).toHaveLength(FACES.length);
  });

  it("it does NOT hold the variants the app never loads", () => {
    // 42 .ttf ship and five are used; precaching the directory would add
    // megabytes to an install that has to survive a bad connection
    expect(call("precacheList", out).paths.some((p) => p.includes("700Bold_Italic"))).toBe(false);
  });

  it("every precached path exists in the export — addAll fails the whole install on one 404", () => {
    const list = call("precacheList", out);
    expect(list.paths.length).toBeGreaterThan(0);
    const missing = list.paths.filter((p) => !existsSync(join(out, p.slice(1))));
    expect({ precachedButNotExported: missing }).toEqual({ precachedButNotExported: [] });
  });

  it("filling the worker replaces the marker, and refuses a worker that has none", () => {
    call("fillServiceWorker", out);
    const sw = readFileSync(join(out, "sw.js"), "utf8");
    expect(sw).not.toContain("__JSTACK_BUILD_PRECACHE__");
    expect(sw).toContain(ENTRY);

    // a worker with no marker must throw, not quietly ship an empty shell
    const bare = mkdtempSync(join(tmpdir(), "jstack-dist-bare-"));
    writeFileSync(join(bare, "sw.js"), "const BUILD_PRECACHE = [];");
    expect(() => call("fillServiceWorker", bare)).toThrow();
    rmSync(bare, { recursive: true, force: true });
  });
});

/**
 * A-6 (the planner's verification, 20:25 12 Sep) — the packaged mock may not
 * try to register a service worker.
 *
 * `jstack-mock-v15.html` is the whole app in one file and there is no
 * `/sw.js` beside it, wherever it is served. `lib/pwa.ts` swallows the
 * promise rejection, but the BROWSER logs the failed fetch itself — three
 * times, on every open — and that console is the first thing a REMAP engineer
 * sees in the artefact we hand them. The mock's shim hides the API instead, so
 * the app's own `nav?.serviceWorker == null` guard returns early.
 *
 * The web export is NOT touched by this and must keep registering: the cases
 * above still pin that.
 */
describe("A-6 · the packaged mock registers no service worker", () => {
  const mock = () => readFileSync(join(__dirname, "..", "..", "..", "jstack-mock-v15.html"), "utf8");

  it("the shim hides navigator.serviceWorker, and does it before the bundle runs", () => {
    const html = mock();
    const guard = html.indexOf('Object.defineProperty(navigator, "serviceWorker"');
    expect(guard).toBeGreaterThan(-1);
    // the bundle is the LAST script in the file; the shim must come first, or
    // the app would have registered before the API was hidden
    const bundleStart = html.lastIndexOf("<script>");
    expect(guard).toBeLessThan(bundleStart);
  });

  it("the registration call is still in the bundle — it is the API that is gone, not the code", () => {
    // said out loud so nobody "fixes" this by stripping the call out of the
    // production bundle the mock is built from: that bundle is the web
    // export's, and the export must go on registering
    expect(mock()).toContain('serviceWorker.register("/sw.js")');
  });
});
