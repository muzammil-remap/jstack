/**
 * LV-05 — one z-order table, and no literal `zIndex` number anywhere else.
 *
 * V2.1 spent five bug rows (R-15, R-16, R-26, R-27, R-31, R-36) on floating
 * chrome covering content, and every one of them started the same way: a
 * number chosen at a call site, correct against the two layers its author had
 * in mind and wrong against the third. The fix is not a better number, it is
 * having one place where the order is written down and comparable.
 *
 * So this guard is a grep, and greps have a way of passing because they cannot
 * match their own subject (V2.1's qa A-4 counted 119 of 123 that way). The
 * last case here plants a literal it must catch, which is the only thing that
 * makes the first case's silence mean anything.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { Z, Z_ORDER } from "../../layout/zorder";

const root = join(__dirname, "..", "..");
const DIRS = ["app", "components", "layout", "stores", "lib", "theme", "data"];
const TABLE = join("layout", "zorder.ts");

/** `zIndex: 105` — a number literal, not `zIndex: Z.toast` */
const LITERAL_Z = /zIndex\s*:\s*-?\d+/g;

function sourceFiles(dir: string): string[] {
  const abs = join(root, dir);
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) {
        if (entry !== "node_modules") walk(p);
      } else if (/\.tsx?$/.test(entry)) {
        out.push(p);
      }
    }
  };
  walk(abs);
  return out;
}

describe("LV-05 · the z-order table is the only place a layer number is written", () => {
  it("every layer is a named constant, ordered as the stack is painted", () => {
    // the order is the claim; the numbers are just how it is spelled
    const order = Z_ORDER.map((name) => Z[name]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(Z_ORDER).size).toBe(Z_ORDER.length);

    // the pairs that must sit on the same layer, and the ones that must not
    expect(Z.dialog).toBe(Z.sheet);
    expect(Z.toast).toBeGreaterThan(Z.dialog);
    expect(Z.gate).toBeGreaterThan(Z.toast);
    expect(Z.watermark).toBeGreaterThan(Z.gate);
    expect(Z.privacyShield).toBeGreaterThan(Z.watermark);
    expect(Z.screen).toBeLessThan(Z.dialog);
  });

  it("no source file outside the table writes a literal zIndex number", () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of sourceFiles(dir)) {
        const rel = relative(root, file);
        if (rel.split(sep).join("/") === TABLE.split(sep).join("/")) continue;
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(LITERAL_Z)) {
          const line = text.slice(0, m.index).split("\n").length;
          offenders.push(`${rel.split(sep).join("/")}:${line} ${m[0]}`);
        }
      }
    }
    expect({ literalZIndex: offenders }).toEqual({ literalZIndex: [] });
  });

  it("the table itself is where the numbers live — it really does contain them", () => {
    // the mirror of the case above: if the table stopped holding literals the
    // grep would pass vacuously, because there would be nothing to move
    const table = readFileSync(join(root, TABLE), "utf8");
    expect([...table.matchAll(/-?\d+/g)].length).toBeGreaterThan(0);
  });

  it("the matcher catches a planted literal — otherwise its silence proves nothing", () => {
    const planted = 'style={{ position: "absolute", zIndex: 42 }}';
    expect([...planted.matchAll(LITERAL_Z)].map((m) => m[0])).toEqual(["zIndex: 42"]);

    // and does not fire on the form the codebase is supposed to use
    const correct = "style={{ zIndex: Z.toast }}";
    expect([...correct.matchAll(LITERAL_Z)]).toHaveLength(0);
  });
});
