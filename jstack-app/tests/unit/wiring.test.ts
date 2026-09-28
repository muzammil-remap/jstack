/**
 * WM-01 (first cut, Q1) — `tools/gen-wiring.mjs` is the source of truth for
 * `wiring.json` and `WIRING.md`: a fresh run into a temp path must equal
 * the committed files byte-for-byte, every route from `data/routes.ts`
 * must appear, and every orphan it names must genuinely have zero store
 * actions calling it (so the list can't silently drift from the scan that
 * produced it).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROUTES } from "@/data/routes";

const ROOT = join(__dirname, "..", "..");

describe("WM-01 tools/gen-wiring.mjs regenerates wiring.json and WIRING.md exactly", () => {
  it("a fresh run into a temp path equals the committed files", () => {
    const scratch = mkdtempSync(join(tmpdir(), "jstack-gen-wiring-"));
    try {
      execFileSync(process.execPath, [join(ROOT, "tools", "gen-wiring.mjs"), "--out", scratch]);
      const generatedJson = readFileSync(join(scratch, "wiring.json"), "utf8");
      const committedJson = readFileSync(join(ROOT, "wiring.json"), "utf8");
      expect(generatedJson).toBe(committedJson);
      const generatedMd = readFileSync(join(scratch, "WIRING.md"), "utf8");
      const committedMd = readFileSync(join(ROOT, "WIRING.md"), "utf8");
      expect(generatedMd).toBe(committedMd);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  const wiring = JSON.parse(readFileSync(join(ROOT, "wiring.json"), "utf8")) as {
    routes: { name: string; storeActions: string[] }[];
    orphans: string[];
  };

  it("every route in data/routes.ts appears exactly once", () => {
    const names = wiring.routes.map((r) => r.name).sort();
    expect(names).toEqual(ROUTES.map((r) => r.name).slice().sort());
  });

  it("every named orphan genuinely has no store action", () => {
    const byName = new Map(wiring.routes.map((r) => [r.name, r]));
    for (const orphan of wiring.orphans) {
      expect(byName.get(orphan)?.storeActions).toEqual([]);
    }
  });

  it("a route with a store action is never listed as an orphan", () => {
    for (const r of wiring.routes) {
      if (r.storeActions.length > 0) expect(wiring.orphans).not.toContain(r.name);
    }
  });
});
