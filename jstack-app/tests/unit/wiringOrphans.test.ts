/**
 * LV-02 — the wiring map's zero-caller list, decomposed and held.
 *
 * `wiring.json`'s `orphans` array means "no store action calls this adapter
 * method". LV-02 is written against a different sentence — "the wiring map's
 * zero-caller list is empty or every entry is named" — and reading the first
 * as the second is how a route that is called perfectly well from a detail
 * dialog ends up in KNOWN_GAPS.md while a route with no caller at all hides
 * in the same list. So the list is split three ways and the split is committed
 * to `evidence/wiring-orphans.json`.
 *
 * The point of comparing against a COMMITTED file rather than just printing a
 * number: a route that loses its last caller moves from `componentCalled` to
 * `uncalled`, and this test says so by name. A count alone would not — 38 is
 * 38 whichever bucket the entries sit in (R-01: pin the literal, never "non-empty").
 *
 * Seen to fail: deleting the `.getGoal(id)` call in `GoalDetail.tsx` prints
 *   - uncalled: ["getGoal", …20 more]  (the tool)
 *   + uncalled: […20]                  (the committed file)
 * and pointing `getFile`'s caller at a rig path moves it to `rigOnly` the same way.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

type Split = {
  orphans: number;
  componentCalled: { method: string; callers: string[] }[];
  rigOnly: { method: string; rigOnly: string[] }[];
  uncalled: { method: string }[];
};

const measured = (): Split =>
  JSON.parse(execFileSync(process.execPath, [join(ROOT, "tools", "orphan-callers.mjs"), "--json"], { cwd: ROOT, encoding: "utf8" }));

const committed = JSON.parse(readFileSync(join(ROOT, "evidence", "wiring-orphans.json"), "utf8"));

describe("LV-02 · the zero-caller list is decomposed, and every entry is named", () => {
  it("the tool's split equals the committed one, method for method", () => {
    const m = measured();
    expect(m.componentCalled.map((r) => r.method).sort()).toEqual(committed.componentCalled.methods.slice().sort());
    expect(m.rigOnly.map((r) => r.method).sort()).toEqual(committed.rigOnly.methods.slice().sort());
    expect(m.uncalled.map((r) => r.method).sort()).toEqual(committed.uncalled.methods.slice().sort());
  });

  it("the counts in the committed file are the counts it lists", () => {
    expect(committed.componentCalled.count).toBe(committed.componentCalled.methods.length);
    expect(committed.rigOnly.count).toBe(committed.rigOnly.methods.length);
    expect(committed.uncalled.count).toBe(committed.uncalled.methods.length);
    expect(committed.orphanCount).toBe(
      committed.componentCalled.count + committed.rigOnly.count + committed.uncalled.count,
    );
  });

  it("every component-called method names at least one real caller", () => {
    for (const row of measured().componentCalled) {
      expect({ method: row.method, callers: row.callers.length > 0 }).toEqual({ method: row.method, callers: true });
    }
  });

  /**
   * The LV-02 claim that is actually about THIS build: V2.2 added 26 routes and
   * wired every one. An uncalled route added by V2.2 would be a route the build
   * shipped and never used, which is a different and worse thing than a V2.1
   * surface the app has not grown into yet.
   */
  it("no uncalled route was added by V2.2 — every one predates tag v2.1", () => {
    // A clone without history has no `v2.1` to show, and `git show` exits 128
    // rather than answering nothing — which took the suite with it in A-5 step
    // 1's fresh clone. Say so and skip, as CM-02 does; the board and any full
    // clone run it.
    let atV21: string;
    try {
      atV21 = execFileSync("git", ["show", "v2.1:jstack-app/data/routes.ts"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      console.info("LV-02 skipped: this clone has no v2.1 tag — clone with its history to run this check.");
      return;
    }
    const addedSinceV21 = committed.uncalled.methods.filter((m: string) => !new RegExp(`\\b${m}\\b`).test(atV21));
    expect(addedSinceV21).toEqual([]);
  });
});
