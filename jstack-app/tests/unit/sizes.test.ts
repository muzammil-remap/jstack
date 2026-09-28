/**
 * SM-03 (CD-05) — the file-size limits are enforced, not just stated.
 *
 * `14_CC_V21_EXEC_PROMPT.md` hard rule 3 sets them: no component or store
 * over 250 lines, no tab file over 60, `ApiAdapter.ts` under 350 after S-1.
 * They were written down in V2 and never guarded, which is exactly how
 * `theme/ui.tsx` reached 994 lines before S-2a split it, and how
 * `app/(tabs)/_layout.tsx` drifted two lines over its cap (CD-05).
 *
 * Every limit below is a literal. The test must never compute a limit from
 * the files it measures (hard rule 11) — a guard that reads its expectation
 * off its own subject reports green no matter how far the subject drifts,
 * which is the failure mode `CHANGES_v2.md` catalogues fifteen times.
 *
 * `app/_layout.tsx`'s own limit was added by S-3, the row that cut it from
 * 236 lines to under 100 by moving every dialog into `layout/dialogs.tsx`.
 * It was deliberately absent until then: a guard that fails before its row
 * has run would have to be skipped, which is worse than not yet existing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");

/** Hard rule 3's limits. Literals, never derived from the tree. */
const LIMITS = {
  component: 250,
  store: 200,
  tabFile: 60,
  apiAdapter: 350,
  rootLayout: 100,
};

/** Generated files answer to their generator, not to a hand-editing cap. */
const GENERATED = /\.generated\.(ts|tsx)$/;

/** Lines as `wc -l` counts them: a trailing newline ends the last line, it
 * does not start another one. Counting it would put every file one over. */
function lineCount(absPath: string): number {
  const text = readFileSync(absPath, "utf8");
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

/** Every source file under `dir`, recursively, as repo-relative paths. */
function walk(dir: string, exts = [".ts", ".tsx"]): string[] {
  const out: string[] = [];
  const abs = join(root, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return out;
  }
  for (const name of entries) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) {
      out.push(...walk(rel, exts));
    } else if (exts.some((e) => name.endsWith(e)) && !GENERATED.test(name)) {
      out.push(rel);
    }
  }
  return out;
}

/** Files that render UI. `theme/ui/` and `layout/` count: they hold
 * components too, and leaving them out is how a 994-line `theme/ui.tsx`
 * passed a "no component over 250 lines" rule for a whole build. */
const COMPONENT_DIRS = ["components", "theme/ui", "layout"];

function over(files: string[], limit: number): string[] {
  return files
    .map((f) => ({ f, n: lineCount(join(root, f)) }))
    .filter((x) => x.n > limit)
    .map((x) => `${x.f} is ${x.n} lines (limit ${limit})`);
}

describe("SM-03 · file size limits", () => {
  it("no component over 250 lines", () => {
    const files = COMPONENT_DIRS.flatMap((d) => walk(d));
    // guard the guard: if the walker ever finds nothing, an empty `over()`
    // would pass silently and prove nothing at all
    expect(files.length).toBeGreaterThan(50);
    expect(over(files, LIMITS.component)).toEqual([]);
  });

  it("no store over 200 lines", () => {
    const files = walk("stores");
    expect(files.length).toBeGreaterThan(3);
    expect(over(files, LIMITS.store)).toEqual([]);
  });

  it("no tab file over 60 lines", () => {
    const files = walk("app/(tabs)");
    expect(files.length).toBeGreaterThan(3);
    expect(over(files, LIMITS.tabFile)).toEqual([]);
  });

  it("ApiAdapter.ts is under 350 lines (S-1, SM-02)", () => {
    expect(over(["data/ApiAdapter.ts"], LIMITS.apiAdapter)).toEqual([]);
  });

  it("app/_layout.tsx is under 100 lines (S-3, SM-05)", () => {
    expect(over(["app/_layout.tsx"], LIMITS.rootLayout)).toEqual([]);
  });
});

describe("SM-02 · every ApiAdapter method is one line through this.req", () => {
  it("each `this.req(` call sits on a one-line method, and there are as many as the route table has rows", () => {
    const src = readFileSync(join(root, "data", "ApiAdapter.ts"), "utf8").split("\n");
    const calls = src.filter((l) => l.includes("this.req<"));
    // a one-line method: `name(args) { return this.req<T>("name", ...); } // TODO(BACKEND: §4.n) ...`
    const multi = calls.filter((l) => !/^\s+\w+\([^)]*\)\s*\{\s*return this\.req</.test(l) || !/\}\s*(\/\/.*)?$/.test(l));
    expect(multi).toEqual([]);
    const routes = readFileSync(join(root, "data", "routes.ts"), "utf8").split("\n").filter((l) => l.trim().startsWith('{ name: "')).length;
    expect(calls.length).toBe(routes);
  });
});
