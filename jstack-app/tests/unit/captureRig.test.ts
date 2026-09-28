/**
 * QA-07 — the capture rig refuses to photograph an off-pass instant into the
 * device pass.
 *
 * The pass's whole claim is that every frame in it was taken at ONE instant
 * (S6-37): that is what makes it pixel-reproducible, and what lets a reviewer
 * compare two frames and believe the difference is the app. `--instant` exists
 * because a fixed instant is also a blind spot — A-6 found that
 * `absorbNarrowEnds` only fires when the window opens on a Sunday and the
 * pass's instant is a Thursday, so the change could not appear in any frame of
 * it (ux round 4, `BUGLOG_v22.md` A-170). The flag takes frames OUTSIDE the
 * pass, and this guard is what keeps the two apart.
 *
 * It runs the REAL rig, for `hooks.test.ts`'s reason: a guard that is present
 * but does not fire is the same as no guard. It runs it with `--check-only`,
 * for a reason this test learned the hard way — see below.
 *
 * D15: the first cut asked `outDir.endsWith("v22")`, and `"../demo/v22/"` does
 * not end with `v22`, so ONE trailing separator wrote off-pass frames straight
 * into the pass. A path is compared as a path now.
 *
 * B-271: the first cut of THIS FILE had no `--check-only`, so planting the old
 * check to prove the case was red started two real captures on a Sunday clock
 * and overwrote three frames of the device pass — the contamination the guard
 * exists to prevent, caused by the test written to prove the guard works. The
 * rig validates its arguments and stops now, so a broken guard can no longer
 * reach anything while this file is proving it broken.
 */
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const app = join(__dirname, "..", "..");
const rig = join(app, "tools", "capture-v2.mjs");
const SUNDAY = "2026-09-13T16:20:00+10:00";
const PASS = join(app, "..", "history", "v22", "demo", "v22");

/** the rig's exit and output for one `--out`, taking no frames either way */
function check(out: string): { failed: boolean; text: string } {
  try {
    const stdout = execFileSync(
      process.execPath,
      [rig, "--check-only", "--instant", SUNDAY, "--out", out, "--only", "tasks-gantt"],
      { cwd: app, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 },
    );
    return { failed: false, text: stdout };
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return { failed: true, text: `${err.stderr ?? ""}${err.message ?? ""}` };
  }
}

describe("QA-07 · an off-pass instant may not write into the device pass", () => {
  it.each(["../history/v22/demo/v22", "../history/v22/demo/v22/", "../history/v22/demo/v22/."])("refuses --out %s", (out) => {
    const r = check(out);
    expect(r.failed).toBe(true);
    expect(r.text).toContain("every frame in the pass is taken at one instant");
  });

  it.each(["evidence/gantt-sunday", "../history/v22/demo/v21"])("allows --out %s, which is not the pass", (out) => {
    const r = check(out);
    expect({ out, failed: r.failed }).toEqual({ out, failed: false });
    expect(r.text).toContain("arguments ok");
  });

  it("compares the directory as a PATH, so a spelling cannot get past it", () => {
    // the arithmetic the guard uses, stated so the cases above are a property
    // rather than five coincidences
    for (const spelling of ["../history/v22/demo/v22", "../history/v22/demo/v22/", "../history/v22/demo/v22/."]) {
      expect(resolve(join(app, spelling))).toBe(resolve(PASS));
    }
    expect(resolve(join(app, "evidence", "gantt-sunday"))).not.toBe(resolve(PASS));
  });

  it("leaves the pass alone on the default instant, which is what the pass is taken at", () => {
    // the guard is about an OFF-pass instant: the rig must still be able to
    // write the pass itself, or `pnpm` could not take a device pass at all
    const r = execFileSync(process.execPath, [rig, "--check-only", "--only", "tasks-gantt"], {
      cwd: app,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    expect(r).toContain("arguments ok");
    expect(r).toContain("2026-09-10T16:20:00+10:00");
  });
});
