/**
 * CT-06 — nothing in the app exports something nobody imports.
 *
 * A dead export is not untidiness. It reads as supported: the next person
 * wires a screen to it and discovers nobody has ever run it. This build has
 * paid for that twice — AUDIT_v2.md A-08 found nine generated tokens with no
 * consumer, three shadowed by hand-typed copies of their own values, and
 * S-6 found `data/labels.ts`'s entire rule set unused while two mock
 * handlers hand-wrote label literals that happened to match it.
 *
 * The tool is run as a subprocess rather than imported. It is an ESM `.mjs`
 * and Jest transforms this file to CJS, so a `require` throws and a static
 * import would need `--experimental-vm-modules` for the whole suite — but
 * the better reason is that this exercises the exact command a person and a
 * CI job run (`pnpm unused`), exit code and all, rather than a function that
 * happens to sit behind it.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const TOOL = join(root, "tools", "unused-exports.mjs");

function run(): { status: number; out: string } {
  try {
    return { status: 0, out: execFileSync(process.execPath, [TOOL], { cwd: root, encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("CT-06 · unused exports", () => {
  it("nothing is exported that nothing imports", () => {
    const { status, out } = run();
    // the tool's own output is the failure message — it names every offender
    expect(`${status}\n${out.trim()}`).toBe("0\nunused-exports: none");
  });

  it("every allow-list entry still names a real export — a stale one is a hole", () => {
    // the same discipline as tests/unit/date-basis.test.ts: an exemption that
    // outlives its subject silently widens the scan's blind spot
    const src = readFileSync(TOOL, "utf8");
    const entries = [...src.matchAll(/\["([^"]+) → ([^"]+)",/g)];
    expect(entries.length).toBeGreaterThan(5); // else this is checking nothing
    for (const [, rel, name] of entries) {
      const subject = readFileSync(join(root, rel), "utf8");
      expect(`${rel} → ${name} :: ${subject.includes(name)}`).toBe(`${rel} → ${name} :: true`);
    }
  });

  it("the allow-list stays short — it is exemptions, not a second codebase", () => {
    // not a style rule: every entry is something a reader has to take on
    // trust. If this ever needs raising, the right question is why so much
    // of the app has no caller.
    const src = readFileSync(TOOL, "utf8");
    expect([...src.matchAll(/\["([^"]+) → ([^"]+)",/g)].length).toBeLessThanOrEqual(30);
  });
});

/**
 * A-0 review, B-41. `tests/unit/lint-guards.test.ts` plants fixtures under
 * `tests/lint-guard-scratch-<random>` and deletes them; this tool walked `tests/`
 * for readers in the same board run and died with ENOENT on a fixture that
 * had just gone — twice in one afternoon, on a green tree. Transient fixtures
 * are not readers of anything real, so the walker skips them by name; and a
 * file that vanishes between readdir and read is skipped, not fatal.
 */
describe("B-41 · the walker does not read the lint fixtures it raced", () => {
  const readers = () =>
    execFileSync(process.execPath, [TOOL, "--readers"], { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);

  it("a planted scratch fixture is not among the files the walker will open", () => {
    const dir = join(root, "tests", "lint-guard-scratch-b41probe");
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(join(dir, "probe.tsx"), "export const p = 1;");
      const list = readers();
      // not vacuous: the list is the real reader list, with this file in it
      expect(list).toContain("tests/unit/unused-exports.test.ts");
      expect(list.filter((f) => f.includes("lint-guard-scratch-"))).toEqual([]);
    } finally {
      // the file first, then the directory in a try: `rmSync` on a directory
      // fails EPERM on Windows after its contents are gone (B-31), and a
      // leftover empty scratch dir is gitignored and swept by lint-guards
      rmSync(join(dir, "probe.tsx"), { force: true });
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // harmless leftover
      }
    }
  });
});
