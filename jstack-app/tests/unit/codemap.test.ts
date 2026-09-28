/**
 * CM-01..10 — `CODEMAP.md` is true, current, and cannot rot silently.
 *
 * The map is what a future agent reads *instead of* opening the code, so a
 * confident wrong line in it is worse than a missing one: nothing prompts
 * the reader to doubt it. Four things are checked here, and each is a
 * different way the file could lie.
 *
 * 1. **Drift** — regenerating changes nothing. If it does, the committed
 *    file describes a codebase that no longer exists.
 * 2. **Freshness** — nothing has touched the mapped source since the map was
 *    last rewritten. Compared as COMMITS, not as times: mtimes lie in a
 *    Dropbox tree, and the stamped sha is always one commit behind the map
 *    that carries it, because the hook stamps the parent of the commit it is
 *    building. Both earlier forms of this check went red on a correct map.
 * 3. **The walker** — every path and testID a HAND-WRITTEN section names
 *    exists. `.githooks/pre-commit` runs this same check on every commit;
 *    here it also runs in the board, so `--no-verify` cannot get past it.
 * 4. **The guards are real** — every file section 4 names as enforcing an
 *    invariant exists and is a test or a lint rule that actually runs.
 *
 * The companion lists are reported, not asserted empty. They are long by
 * design right now: section 6 distils nine gotchas out of sixty-odd bug
 * rows, and Stage 4 curates the rest. A release gate (Stage 3c's `P-1`) is
 * what makes them blocking.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const repo = join(root, "..");
const MAP = join(root, "CODEMAP.md");

const read = () => readFileSync(MAP, "utf8");
const run = (cmd: string, args: string[], cwd = root) => execFileSync(cmd, args, { cwd, encoding: "utf8" });

/** Exit status only. `run` throws on a non-zero exit, and several of the git
 * questions below are ASKED by exit status. */
const ok = (cmd: string, args: string[], cwd = root) => {
  try {
    execFileSync(cmd, args, { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/** `run`, but a failure answers with the fallback instead of throwing. */
const runOr = (fallback: string, cmd: string, args: string[], cwd = root) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
};

/** The stamp header records WHEN a block was generated: the sha HEAD was at,
 * and that commit's date. It is not what the map SAYS, and it necessarily
 * differs between the committed map and a regeneration — the pre-commit hook
 * stamps the PARENT of the commit it is building, because the commit being
 * built has no sha yet. Comparing it here made the drift check fail on every
 * run after the commit landed (B-14, v2.1). Drift is about content; the stamp
 * is CM-02's business. */
const withoutStamps = (md: string) =>
  md.replace(/<!-- generated:start section=(\d+) sha=[^\s]+ date=[^\s]+ -->/g, "<!-- generated:start section=$1 -->");

/** The source folders section 2 claims to map — kept in step with
 * gen-codemap.mjs's own list by the last test in this file. */
const MAPPED_DIRS = ["app", "components", "data", "layout", "lib", "stores", "theme", "tools", "eslint-rules"];

describe("CM-01 · the map does not drift", () => {
  it("regenerating CODEMAP.md changes nothing", () => {
    // Regenerate into a TEMP file, not in place. Writing the real map here
    // mutated a file `tests/unit/hooks.test.ts` reads, and Jest runs those
    // two in parallel — one run in several failed on it. A drift check that
    // is itself a race is not a check.
    const tmp = join(tmpdir(), `codemap-drift-${process.pid}.md`);
    try {
      run(process.execPath, [join(root, "tools", "gen-codemap.mjs"), "--out", tmp]);
      const regenerated = withoutStamps(readFileSync(tmp, "utf8"));
      if (regenerated !== withoutStamps(read())) {
        throw new Error("CODEMAP.md is stale — run `pnpm codemap` and commit the result.");
      }
      expect(regenerated).toBe(withoutStamps(read()));
    } finally {
      try {
        rmSync(tmp, { force: true });
      } catch {
        // a leftover temp file is harmless
      }
    }
  });

  /**
   * LK-02 — the same check for `PARAMETERS.md`, and for the same reason. It is
   * the page Josh and the EA read to find out what can be tuned, so a stale
   * one is a document that quietly disagrees with the ranges the server
   * enforces. Regenerated into a temp file for the race reason above.
   */
  it("regenerating PARAMETERS.md changes nothing (L-1)", () => {
    const tmp = join(tmpdir(), `parameters-drift-${process.pid}.md`);
    try {
      run(process.execPath, [join(root, "tools", "gen-parameters.mjs"), "--out", tmp]);
      const regenerated = readFileSync(tmp, "utf8");
      const committed = readFileSync(join(root, "PARAMETERS.md"), "utf8");
      if (regenerated !== committed) {
        throw new Error("PARAMETERS.md is stale — run `pnpm codemap` and commit the result.");
      }
      // it is a real page, not an empty shell: six rows and the way to add one
      expect(committed).toContain("| `lock.afterMinutes` |");
      expect(committed.match(/^\| `[a-z]+\./gm)?.length).toBe(6);
      expect(committed).toContain("## Adding one");
    } finally {
      try {
        rmSync(tmp, { force: true });
      } catch {
        // a leftover temp file is harmless
      }
    }
  });

  it("every generated block carries a sha and a date", () => {
    const blocks = [...read().matchAll(/<!-- generated:start section=(\d+) sha=([^\s]+) date=([^\s]+) -->/g)];
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    for (const [, section, sha, date] of blocks) {
      expect(`section ${section} sha`).toBe(`section ${section} sha`);
      expect(sha).toMatch(/^[0-9a-f]{7,40}$/);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("CM-02 · the map is not older than the code it maps", () => {
  it("nothing has touched the mapped source since the map was last written", () => {
    // A shallow clone does not CONTAIN the commits this compares, and asking
    // for one fails outright rather than answering nothing — `git log -1
    // <sha>` exited 128 and took the suite with it. The board now checks out
    // with fetch-depth: 0; anywhere shallow, say so and skip (B-14, v2.1).
    if (runOr("", "git", ["rev-parse", "--is-shallow-repository"], repo) === "true") {
      // …through `console.info`, not `warn`: GL-00's budget counts a warning
      // as a failure, so the skip notice failed the very suite it was meant to
      // let pass. Found by A-5 step 1's fresh clone, which was shallow.
      console.info("CM-02 skipped: shallow clone — check out with fetch-depth: 0 to run this check.");
      return;
    }

    const stamped = /<!-- generated:start section=2 sha=([^\s]+)/.exec(read())?.[1];
    expect(stamped).toBeTruthy();

    // 1. the stamp names a commit that is really in this history. Ancestor-OR-
    //    EQUAL: `--is-ancestor` is true of HEAD itself.
    expect(ok("git", ["merge-base", "--is-ancestor", stamped!, "HEAD"], repo)).toBe(true);

    // 2. Freshness compares COMMITS, not committer times. The hook stamps the
    //    parent of the commit it is building, so the stamp is always exactly
    //    one commit behind the map that carries it — against which any time
    //    comparison reads "stale" the instant the commit lands, on every
    //    platform. What actually matters is that nothing has changed the
    //    source the map describes since the map was last rewritten.
    const mapCommit = run("git", ["log", "-1", "--format=%H", "--", "jstack-app/CODEMAP.md"], repo).trim();
    expect(mapCommit).toBeTruthy();

    const since = run(
      "git",
      ["diff", "--name-only", `${mapCommit}..HEAD`, "--", ...MAPPED_DIRS.map((d) => `jstack-app/${d}`)],
      repo,
    )
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean)
      // generated files are rewritten by `pnpm codemap` in the same commit
      // that changes them; they are not a source change the map missed
      .filter((f) => !f.includes("generated"));

    expect(since).toEqual([]);
  });
});

describe("CM-03 · the hand-written sections name only things that exist", () => {
  it("the walker finds no broken path or testID", () => {
    // the same check .githooks/pre-commit runs, here so --no-verify cannot
    // sneak a broken reference past it
    let status = 0;
    let out = "";
    try {
      out = run(process.execPath, [join(root, "tools", "codemap-check.mjs")]);
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      status = err.status ?? 1;
      out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    expect(`${status}\n${out}`.trim()).toBe("0");
  });
});

describe("CM-04 · every invariant names a guard that exists and runs", () => {
  /** The GUARD column only — column 2 of section 4's table. An earlier cut
   * of this test read every backticked path in the row, which swept up the
   * SUBJECTS as well (`theme/useLayout.ts` is the file an invariant is
   * about, not the thing enforcing it) and then failed for the wrong
   * reason. */
  function guardFiles(): string[] {
    const md = read();
    const section4 = md.slice(md.indexOf("## 4. Invariants"), md.indexOf("## 5. How to add"));
    expect(section4.length).toBeGreaterThan(500);
    const out = new Set<string>();
    for (const line of section4.split("\n")) {
      if (!line.startsWith("|") || line.startsWith("|---") || line.startsWith("| invariant")) continue;
      const cols = line.split("|").map((c) => c.trim());
      const guardCol = cols[2] ?? "";
      for (const m of guardCol.matchAll(/`([A-Za-z0-9_.\-/]+\.(?:ts|tsx|js|mjs|yml))`/g)) out.add(m[1]);
    }
    return [...out];
  }

  it("section 4's guard column points at real files", () => {
    const guards = guardFiles();
    expect(guards.length).toBeGreaterThan(8); // else this asserts nothing
    const missing = guards.filter((g) => !existsSync(join(root, g)) && !existsSync(join(repo, g)));
    expect(missing).toEqual([]);
  });

  it("each named guard is a test, a spec, a lint rule, a tool or a hook — not prose", () => {
    const notAGuard = guardFiles().filter(
      (g) =>
        !/\.test\.tsx?$/.test(g) &&
        !/\.spec\.ts$/.test(g) &&
        !/^eslint-rules\//.test(g) &&
        !/^tools\//.test(g) &&
        !/\.yml$/.test(g) &&
        !/^\.githooks\//.test(g),
    );
    expect(notAGuard).toEqual([]);
  });
});

describe("CM-05 · the companion lists exist, and are empty because somebody looked", () => {
  const HEADINGS = ["New since section 6 was curated", "Guards section 4 does not name", "File families with no recipe in section 5"];

  /** the entries under one companion heading, in the real map or a copy */
  const entriesUnder = (md: string, heading: string): number => {
    const start = md.indexOf(`### ${heading}`);
    expect(start).toBeGreaterThan(-1);
    const rest = md.slice(start + heading.length);
    const next = rest.search(/\n### |<!-- generated:end -->/);
    return [...rest.slice(0, next === -1 ? undefined : next).matchAll(/^- /gm)].length;
  };

  it("all three are present", () => {
    const md = read();
    for (const heading of HEADINGS) expect(md).toContain(heading);
  });

  /**
   * Stage 4 (A-0 review, R-01): the lists WERE asserted non-empty here, as the
   * honest state at M-1 — and a curation row then claimed "the three companion
   * lists are empty" while fifteen audit rows still sat under the first
   * heading, which this test could not see because it only asked for "more
   * than zero". A release requires every list empty (CODEMAP.md §11), so the
   * expectation is the literal zero, per list, by name.
   */
  it.each(HEADINGS)("'%s' is empty — the release gate's precondition", (heading) => {
    expect({ heading, entries: entriesUnder(read(), heading) }).toEqual({ heading, entries: 0 });
  });

  /**
   * And the gate is real: `tools/companions-check.mjs` is what `release.yml`
   * runs, and it must refuse a map with an entry under any heading, naming
   * the heading — proven on a planted COPY, never on the file the repository
   * depends on (the pattern hooks.test.ts uses).
   */
  it("the release gate refuses a planted entry and names the list; a clean map passes", () => {
    const dir = mkdtempSync(join(tmpdir(), "jstack-companions-"));
    const real = read();
    const run = (mapPath: string) => {
      try {
        return { status: 0, out: execFileSync(process.execPath, [join(root, "tools", "companions-check.mjs"), mapPath], { cwd: root, encoding: "utf8" }) };
      } catch (e) {
        const err = e as { status?: number; stdout?: string; stderr?: string };
        return { status: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
      }
    };
    try {
      const clean = join(dir, "clean.md");
      writeFileSync(clean, real);
      expect(run(clean).status).toBe(0);

      const planted = join(dir, "planted.md");
      const empty = "### Guards section 4 does not name\n\nNone. ✅";
      expect(real).toContain(empty);
      writeFileSync(planted, real.replace(empty, "### Guards section 4 does not name\n\nEach is a guard.\n\n- `tests/unit/planted-guard.test.ts`"));
      const bad = run(planted);
      expect(bad.status).toBe(1);
      expect(bad.out).toContain("Guards section 4 does not name");
      expect(bad.out).toContain("planted-guard.test.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("CM-06 · the map's own list of mapped folders is the generator's", () => {
  it("MAPPED_DIRS here matches SOURCE_DIRS in gen-codemap.mjs", () => {
    // a test that guessed the folder list would pass while the generator
    // quietly stopped mapping one of them
    const src = readFileSync(join(root, "tools", "gen-codemap.mjs"), "utf8");
    const declared = /const SOURCE_DIRS = \[([^\]]+)\]/.exec(src)?.[1];
    expect(declared).toBeTruthy();
    const parsed = declared!.split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
    expect(parsed).toEqual(MAPPED_DIRS);
  });
});

describe("CM-07 · §1 names every acceptance table that is in force (A4-12)", () => {
  /**
   * §1 "Where truth lives" is what a fresh agent reads cold, and it named V2's
   * and V2.1's acceptance tables while V2.2's — the 190 IDs this build was
   * actually written against — went unmentioned. Nothing checked it, because
   * §1 is hand-written prose; CM-03 asks only that what it names EXISTS, never
   * that what exists is named.
   */
  it("all three acceptance files appear in the 'Where truth lives' paragraph", () => {
    const md = read().replace(/\r\n/g, "\n");
    const start = md.indexOf("**Where truth lives.**");
    expect(start).toBeGreaterThan(-1);
    const para = md.slice(start, md.indexOf("\n\n", start));
    const missing = ["02_ACCEPTANCE_TESTS_v2.md", "_v21.md", "_v22.md"].filter((f) => !para.includes(f));
    expect(missing).toEqual([]);
  });
});
