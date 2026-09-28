/**
 * SM-06 / SEC-09 / DS-03 — the vendored typefaces.
 *
 * S-4 committed five `.ttf` files into `public/fonts/` so the web export
 * serves them from this origin (SEC-09: no third-party origin serves this
 * app anything). Committed binaries rot silently: a package bump changes
 * the upstream file and the app keeps shipping last month's glyphs, with
 * nothing to notice. So every file here is compared byte-for-byte with its
 * `@expo-google-fonts` original.
 *
 * The second half guards a subtler failure. The faces are named in one
 * place — `tools/vendor-fonts.mjs` — and consumed by two builders, the web
 * export (`build-web.mjs`) and the single-file mock (`build-mock.mjs`). If
 * a builder stops going through `fontFaceCss()` and hand-rolls its own
 * rules, the two drift, the app renders in a fallback font, and every other
 * test still passes because nothing else looks. So this asserts both call
 * sites, by reading the real source files.
 *
 * `app/+html.tsx` is deliberately absent: Expo Router only reads it for
 * `output: "static"`, and this app is `output: "single"` (app.json), so a
 * version of S-4 that put the rules there shipped an export with no
 * `@font-face` at all. BUGLOG_v21.md B-08.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");

/** The five faces the pack uses, written out. Not derived from any of the
 * three sources under test — that is the point (hard rule 11). */
const EXPECTED = [
  { pkg: "instrument-sans", dir: "400Regular", file: "InstrumentSans_400Regular.ttf", family: "Instrument Sans", weight: 400 },
  { pkg: "instrument-sans", dir: "500Medium", file: "InstrumentSans_500Medium.ttf", family: "Instrument Sans", weight: 500 },
  { pkg: "instrument-sans", dir: "600SemiBold", file: "InstrumentSans_600SemiBold.ttf", family: "Instrument Sans", weight: 600 },
  { pkg: "source-serif-4", dir: "400Regular", file: "SourceSerif4_400Regular.ttf", family: "Source Serif 4", weight: 400 },
  { pkg: "source-serif-4", dir: "500Medium", file: "SourceSerif4_500Medium.ttf", family: "Source Serif 4", weight: 500 },
];

const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("SM-06 · vendored fonts", () => {
  it("public/fonts holds exactly the five faces, and nothing else", () => {
    const found = readdirSync(join(root, "public", "fonts"))
      .filter((f) => f.endsWith(".ttf"))
      .sort();
    expect(found).toEqual(EXPECTED.map((f) => f.file).sort());
  });

  it("each committed file is byte-identical to its package original", () => {
    for (const f of EXPECTED) {
      const src = join(root, "node_modules", "@expo-google-fonts", f.pkg, f.dir, f.file);
      // if the package layout ever changes this should fail loudly, not skip
      expect(existsSync(src)).toBe(true);
      const vendored = readFileSync(join(root, "public", "fonts", f.file));
      expect(vendored.equals(readFileSync(src))).toBe(true);
    }
  });

  it("vendor-fonts.mjs copies exactly these five, with these weights", () => {
    const src = read("tools/vendor-fonts.mjs");
    for (const f of EXPECTED) {
      expect(src).toContain(`file: "${f.file}"`);
      expect(src).toContain(`family: "${f.family}", weight: ${f.weight}`);
    }
    // no sixth entry sneaking in
    expect((src.match(/\{ pkg: "/g) ?? []).length).toBe(EXPECTED.length);
  });

  it("fontFaceCss emits one rule per face, at the right weight, and swaps", () => {
    const src = read("tools/vendor-fonts.mjs");
    expect(src).toContain("font-display:swap");
    expect(src).toContain("html,body{font-family:${BODY_STACK}}");
    // SEC-09: no third-party origin anywhere in the font path
    expect(src).not.toMatch(/https?:\/\/(?!\S*expo-google-fonts)/);
  });

  it("the web export's builder injects those rules against /fonts/ URLs", () => {
    const web = read("tools/build-web.mjs");
    expect(web).toContain('import { fontFaceCss } from "./vendor-fonts.mjs"');
    expect(web).toContain("`/fonts/${f.file}`");
    expect(web).toContain('id="jstack-fonts"');
  });

  it("app/+html.tsx does not exist — output:single never reads it (B-08)", () => {
    expect(existsSync(join(root, "app", "+html.tsx"))).toBe(false);
    const appJson = JSON.parse(read("app.json"));
    expect(appJson.expo.web.output).toBe("single");
  });

  it("nothing imports the deleted runtime font shim", () => {
    expect(existsSync(join(root, "lib", "webFonts.ts"))).toBe(false);
    for (const rel of ["lib/boot.ts", "app/_layout.tsx"]) {
      expect(read(rel)).not.toMatch(/from "@\/lib\/webFonts"/);
    }
  });

  it("the single-file mock embeds the same faces under the pack's names", () => {
    // the mock writes its own <head>, so the export's injected rules never
    // reach it — it emits the same block through the same helper, with data:
    // URIs, or it renders in a fallback font
    const mock = read("tools/build-mock.mjs");
    expect(mock).toContain('import { FACES, fontFaceCss, vendoredOf } from "./vendor-fonts.mjs"');
    expect(mock).toContain("fontFaceCss((f) => dataUri(f.file))");
    expect(mock).toContain("data:font/ttf;base64,");
    expect(mock).toContain("jstack-fonts");
  });
});
