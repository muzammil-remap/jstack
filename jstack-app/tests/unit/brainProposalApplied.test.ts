/**
 * BN-04, `02_ACCEPTANCE_TESTS_v22.md` — `BRAIN_PROPOSAL.md` (approved by Josh
 * on 7 Sep) is applied by N-1, and `demo/v22/brain-proposal-*` captures
 * record the result.
 *
 * C-7d: an earlier pass recorded this row PARTIAL on a false premise — the
 * four captures do exist, at `brain-proposal-<width>-<scheme>.png` (no `-d1`
 * segment, unlike the device-pass frames elsewhere in `demo/v22/`, which is
 * exactly the shape that made a prior check for them miss). This test checks
 * what a guard can check in CI: the captures are on the tree and
 * `BRAIN_PROPOSAL.md` carries Josh's dated approval. The commit message
 * clause (N-1 names any later `JOSH_QA.md` line it applied, or "none") is a
 * one-time historical fact, verified by hand against commit 21bfbe91 ("Later
 * `JOSH_QA.md` lines applied: NONE — still exactly the six built at
 * JQ-1..6.") rather than re-checked here — a unit test shelling out to `git
 * log` on every run is not a guard this tree otherwise keeps.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const app = join(__dirname, "..", "..");
const demoV22 = join(app, "..", "history", "v22", "demo", "v22");

describe("BN-04 · BRAIN_PROPOSAL.md applied, and the captures record it", () => {
  it("BRAIN_PROPOSAL.md carries Josh's dated approval", () => {
    const src = readFileSync(join(app, "..", "history", "v2", "BRAIN_PROPOSAL.md"), "utf8");
    expect(src).toMatch(/Approved by Josh on 7 September 2026/);
  });

  it.each(["1366-light", "1366-dark", "393-light", "393-dark"])(
    "demo/v22/brain-proposal-%s.png exists",
    (variant) => {
      expect(existsSync(join(demoV22, `brain-proposal-${variant}.png`))).toBe(true);
    },
  );
});
