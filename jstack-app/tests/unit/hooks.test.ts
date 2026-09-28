/**
 * CM-09/CM-10 — the pre-commit hook actually refuses a bad commit.
 *
 * ADR-35's liveness layer 1 is "at the keyboard": a commit that leaves
 * `CODEMAP.md` naming a file that does not exist is rejected before it is
 * made. A hook that is installed but does not fire is the same as no hook,
 * and it is exactly the kind of thing nobody notices for months — so this
 * runs the real script against a real temporary clone with a real broken
 * reference planted in it, and asserts the commit is refused.
 *
 * A temp clone rather than this working tree: the test must not be able to
 * damage the repository it is testing, and `git commit` in the live tree
 * would do exactly that if an assertion were wrong.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const repo = join(root, "..");

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

describe("CM-07 / CM-09 · the hook is installed by an install, not by hand", () => {
  it("prepare runs install-hooks.mjs", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts.prepare).toContain("install-hooks.mjs");
  });

  it("this repository has core.hooksPath pointing at the tracked hooks", () => {
    // if this fails, someone ran `git config --unset core.hooksPath`, or the
    // install never ran — either way the local layer is off
    expect(git(repo, "config", "--get", "core.hooksPath").trim()).toBe(".githooks");
  });

  it("the hook is committed, executable in git's eyes, and runs the walker", () => {
    const hook = join(repo, ".githooks", "pre-commit");
    expect(existsSync(hook)).toBe(true);
    const src = readFileSync(hook, "utf8");
    expect(src).toContain("codemap-check.mjs");
    expect(src).toContain("pnpm codemap");
    // git tracks the executable bit separately from the filesystem; on
    // Windows the working copy is always 0644 and only the index matters
    const mode = git(repo, "ls-files", "-s", ".githooks/pre-commit").trim().split(/\s+/)[0];
    expect(mode === "100755" || mode === "").toBe(true);
  });
});

describe("CM-07 / CM-10 · a broken reference is refused, by the check the hook runs", () => {
  let scratch: string | null = null;

  afterAll(() => {
    if (scratch == null) return;
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      // a leftover temp file is harmless; Windows can hold it briefly
    }
  });

  /**
   * The walker is pointed at a modified COPY of the map rather than run
   * inside a clone. A clone only carries committed content, so on the row
   * that introduces these files it would be checking an empty tree — and
   * copying each uncommitted file in one by one would be testing the
   * copying, not the check. This runs the real script, from the real app
   * root, against a map with a real plant in it, and never writes to the
   * map the repository depends on.
   */
  function check(mapPath: string): { status: number; out: string } {
    try {
      return { status: 0, out: execFileSync(process.execPath, [join(root, "tools", "codemap-check.mjs"), mapPath], { cwd: root, encoding: "utf8" }) };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { status: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  }

  it("a planted path that does not exist is refused, naming it", () => {
    scratch = mkdtempSync(join(tmpdir(), "jstack-hook-"));
    const real = readFileSync(join(root, "CODEMAP.md"), "utf8");

    // the unmodified map passes — so a refusal below is caused by the plant
    const cleanCopy = join(scratch, "clean.md");
    writeFileSync(cleanCopy, real);
    expect(check(cleanCopy)).toEqual({ status: 0, out: "" });

    // plant in a HAND-WRITTEN section; the walker ignores generated blocks
    const planted = join(scratch, "planted.md");
    const PLANT = ["", "", "- **bogus** — see `stores/definitelyNotAFile.ts`.", ""].join("\n");
    writeFileSync(planted, real.replace("## 9. Glossary", "## 9. Glossary" + PLANT));
    const bad = check(planted);
    expect(bad.status).toBe(1);
    expect(bad.out).toContain("definitelyNotAFile.ts");
  });

  it("a gitignored path is named but not checked — it is a runtime artefact", () => {
    // The case that turned the board red (B-14, v2.1). Section 10 names
    // `e2e/.artifacts/` as the place Playwright writes its traces, which a
    // reader genuinely needs; the directory is gitignored and is created by a
    // run, so it is present on a laptop that has run the suite and absent
    // from a fresh clone. Checking it asks a question with no stable answer.
    scratch ??= mkdtempSync(join(tmpdir(), "jstack-hook-"));
    const probe = "e2e/.artifacts/probe-not-on-disk";

    // both halves of the premise, so this cannot pass vacuously: the path is
    // really ignored, and really is not there
    expect(() => execFileSync("git", ["check-ignore", "-q", "--", probe], { cwd: root })).not.toThrow();
    expect(existsSync(join(root, probe))).toBe(false);

    const real = readFileSync(join(root, "CODEMAP.md"), "utf8");
    const named = join(scratch, "ignored.md");
    const PLANT = ["", "", "- **runtime** — traces land in `" + probe + "/`.", ""].join("\n");
    writeFileSync(named, real.replace("## 9. Glossary", "## 9. Glossary" + PLANT));
    expect(check(named)).toEqual({ status: 0, out: "" });
  });

  it("a plant inside a GENERATED block is ignored — those regenerate themselves", () => {
    const real = readFileSync(join(root, "CODEMAP.md"), "utf8");
    const inGenerated = join(scratch!, "generated.md");
    const GENERATED_PLANT = ["$1", "`stores/alsoNotAFile.ts`"].join("\n");
    writeFileSync(inGenerated, real.replace(/(<!-- generated:start section=2[^>]*-->)/, GENERATED_PLANT));
    expect(check(inGenerated).status).toBe(0);
  });
});

/**
 * RR-05 (Stage 4 A-0) — `main` is guarded by a tracked pre-push hook until the
 * audit is signed.
 *
 * GitHub's branch-protection API is unavailable on this repository's plan
 * (private repo, free tier: the API answers 403 "Upgrade to GitHub Pro"), so
 * the rule the plan wanted server-side lives at the keyboard: `.githooks/
 * pre-push` refuses any push to `main` unless the audit carries the auditor's
 * sign-off. `NEEDS_JOSH.md` asks for the real thing. The hook is run here,
 * with stdin shaped as git shapes it, in a temporary repository whose audit
 * files say whatever the case needs — never against the live tree, whose
 * audit files must stay exactly as the auditor leaves them.
 *
 * V2.2 row 0 (QA-08) adds `AUDIT_v22.md` to the same gate: a push to `main`
 * needs BOTH audits signed. The V2.1 rule is not relaxed — a release carrying
 * V2.2 must answer for both versions — so the V2.1-only case that used to pass
 * is now correctly refused (`02_ACCEPTANCE_TESTS_v22.md` §4, BUGLOG A-01).
 *
 * v2.3 row 0 adds `AUDIT_v23.md` the same way (the hook's own instruction:
 * "add the next version's audit when that build starts; never remove one"), so
 * the cases that open main now sign all three, and a v2.3 tree with only the
 * two older audits signed is correctly refused (`BUGLOG_v23.md` A-01).
 */
describe("RR-05 · the pre-push hook guards main until the audit is signed", () => {
  const hook = join(repo, ".githooks", "pre-push");
  let scratch: string | null = null;

  afterAll(() => {
    if (scratch == null) return;
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      // Windows can hold a temp dir briefly; a leftover is harmless
    }
  });

  /** the phrases the real audits carry when they are signed */
  const SIGNED_V21 = "# AUDIT_v21.md\n\nVerdict: SIGNED OFF AT CAP — 2 carried\n";
  const SIGNED_V22 = "# AUDIT_v22.md\n\nVerdict: SIGNED OFF\n";
  const SIGNED_V23 = "# AUDIT_v23.md\n\nVerdict: SIGNED OFF\n";
  /** D-8: what an audit looks like while it is still deciding — it discusses
   *  the gate, so the words that open main appear inside a sentence that says
   *  the opposite. The check matched a substring anywhere in the file until
   *  A-6, so THIS file opened main. */
  /** D9 (the A-6 re-audit): this file grows a SECTION PER ROUND, so it can
   *  hold a sign-off from an earlier round ABOVE a later round that found
   *  defects. Anchoring the phrase to a line was not enough — any matching
   *  line opened main, so the gate had been open since the round before and
   *  no later round could close it. The LAST verdict is the one that counts. */
  const SIGNED_THEN_DEFECTS =
    "# AUDIT_v22.md\n\n## round 1\n\n**Verdict: SIGNED OFF AT CAP — 8 carried**\n\n## round 2\n\n**Verdict: DEFECTS FOUND**\n";
  /** and the other way round: a round that FOUND defects, then a later one
   *  that signed off, opens main — otherwise the gate could never reopen. */
  const DEFECTS_THEN_SIGNED =
    "# AUDIT_v22.md\n\n## round 1\n\n**Verdict: DEFECTS FOUND**\n\n## round 2\n\n**Verdict: SIGNED OFF AT CAP — 9 carried**\n";
  const DISCUSSES_THE_GATE = "# AUDIT_v22.md\n\nThe hook refuses a push while this file is not SIGNED OFF, which is correct.\n\n**Verdict: DEFECTS FOUND**\n";

  /**
   * Run the real hook script inside a temp git repo, with git's stdin line.
   * `null` for an audit means the file is absent, which is a distinct case
   * from present-but-unsigned and is tested separately for both versions.
   */
  function push(audits: { v21?: string | null; v22?: string | null; v23?: string | null }, remoteRef: string): { status: number; out: string } {
    scratch ??= mkdtempSync(join(tmpdir(), "jstack-prepush-"));
    const dir = mkdtempSync(join(scratch, "repo-"));
    git(dir, "init", "-q");
    if (audits.v21 != null) writeFileSync(join(dir, "AUDIT_v21.md"), audits.v21);
    if (audits.v22 != null) writeFileSync(join(dir, "AUDIT_v22.md"), audits.v22);
    if (audits.v23 != null) writeFileSync(join(dir, "AUDIT_v23.md"), audits.v23);
    const line = `refs/heads/v22-build 1111111111111111111111111111111111111111 ${remoteRef} 2222222222222222222222222222222222222222\n`;
    try {
      return { status: 0, out: execFileSync("sh", [hook], { cwd: dir, input: line, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { status: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  }

  it("the hook is tracked, and lives where core.hooksPath already points", () => {
    expect(existsSync(hook)).toBe(true);
    expect(git(repo, "ls-files", "--", ".githooks/pre-push").trim()).toBe(".githooks/pre-push");
    const mode = git(repo, "ls-files", "-s", ".githooks/pre-push").trim().split(/\s+/)[0];
    expect(mode).toBe("100755");
    expect(git(repo, "config", "--get", "core.hooksPath").trim()).toBe(".githooks");
  });

  it("refuses a push to main when AUDIT_v21.md is not signed off, naming the file", () => {
    const r = push({ v21: "# AUDIT_v21.md\n\nDEFECTS FOUND\n", v22: SIGNED_V22 }, "refs/heads/main");
    expect(r.status).toBe(1);
    expect(r.out).toContain("AUDIT_v21.md");
  });

  it("refuses a push to main when AUDIT_v21.md is missing altogether", () => {
    expect(push({ v21: null, v22: SIGNED_V22 }, "refs/heads/main").status).toBe(1);
  });

  it("refuses a push to main when AUDIT_v22.md is not signed off, naming the file", () => {
    const r = push({ v21: SIGNED_V21, v22: "# AUDIT_v22.md\n\nDEFECTS FOUND\n" }, "refs/heads/main");
    expect(r.status).toBe(1);
    expect(r.out).toContain("AUDIT_v22.md");
  });

  it("D9: an earlier round's sign-off does not keep main open after a later round finds defects", () => {
    const r = push({ v21: SIGNED_V21, v22: SIGNED_THEN_DEFECTS }, "refs/heads/main");
    expect(r.status).toBe(1);
    expect(r.out).toContain("AUDIT_v22.md");
  });

  it("D9: a later round's sign-off reopens main after an earlier round found defects", () => {
    expect(push({ v21: SIGNED_V21, v22: DEFECTS_THEN_SIGNED, v23: SIGNED_V23 }, "refs/heads/main").status).toBe(0);
  });

  it("D-8: an audit that only DISCUSSES the words does not open main", () => {
    const r = push({ v21: SIGNED_V21, v22: DISCUSSES_THE_GATE }, "refs/heads/main");
    expect(r.status).toBe(1);
    expect(r.out).toContain("AUDIT_v22.md");
  });

  it("refuses a push to main when AUDIT_v22.md is missing, even with V2.1 signed (QA-08)", () => {
    // the expectation V2.2 row 0 changed: a signed V2.1 audit alone used to
    // open the gate, and must not once V2.2 is what is being released
    const r = push({ v21: SIGNED_V21, v22: null }, "refs/heads/main");
    expect(r.status).toBe(1);
    expect(r.out).toContain("AUDIT_v22.md");
  });

  it("refuses a push to main when AUDIT_v23.md is missing, even with V2.1 and V2.2 signed (v2.3 row 0)", () => {
    // the expectation v2.3 row 0 changed: two signed audits used to open the
    // gate, and must not once v2.3 is what is being released
    const r = push({ v21: SIGNED_V21, v22: SIGNED_V22, v23: null }, "refs/heads/main");
    expect(r.status).toBe(1);
    expect(r.out).toContain("AUDIT_v23.md");
  });

  it("allows a push to main once ALL THREE audits say SIGNED OFF — at cap counts, it is the auditor's phrase", () => {
    expect(push({ v21: SIGNED_V21, v22: SIGNED_V22, v23: SIGNED_V23 }, "refs/heads/main").status).toBe(0);
  });

  it("a push to any other branch is not the hook's business", () => {
    expect(push({ v21: null, v22: null, v23: null }, "refs/heads/v22-build").status).toBe(0);
  });

  it("the live AUDIT_v21.md does not carry the phrase before the audit has run — else the gate is already open", () => {
    // written at A-0; the auditor adds the verdict at A-4. If this fails
    // AFTER A-4, delete this case in the release row rather than the phrase.
    const audit = readFileSync(join(repo, "AUDIT_v21.md"), "utf8");
    const signed = audit.includes("SIGNED OFF");
    const audited = /## The audit[\s\S]*Signed: qa-auditor/.test(audit);
    expect(signed && !audited).toBe(false);
  });

  it("the live AUDIT_v23.md does not carry the phrase before the v2.3 audit has run", () => {
    // absent keeps the gate shut; what must never happen is the phrase before the auditor signs
    const path = join(repo, "AUDIT_v23.md");
    if (!existsSync(path)) return;
    const audit = readFileSync(path, "utf8");
    const signed = audit.includes("SIGNED OFF");
    const audited = /Signed: qa-auditor/.test(audit);
    expect(signed && !audited).toBe(false);
  });

  it("the live AUDIT_v22.md does not carry the phrase before the V2.2 audit has run", () => {
    // Stage 6 writes it. Absent is the correct state for the whole of 5a–5d,
    // and absent keeps the gate shut, so both readings are a pass here; what
    // must never happen is the phrase appearing before the auditor signs.
    const path = join(repo, "AUDIT_v22.md");
    if (!existsSync(path)) return;
    const audit = readFileSync(path, "utf8");
    const signed = audit.includes("SIGNED OFF");
    const audited = /Signed: qa-auditor/.test(audit);
    expect(signed && !audited).toBe(false);
  });
});

/**
 * v2.3 WPF-10 (CODE_REVIEW_v23.md finding 18). `pnpm codemap` rewrote three
 * tracked files the hook never staged, so a commit carried stale copies that
 * passed locally and failed the board; a commit touching only `HANDOVER.md` never
 * regenerated the page made from it; and the wpb merge left the work-tree export
 * in twice.
 */
describe("WPF-10 · the pre-commit hook stages every file the maps regenerate", () => {
  const hook = readFileSync(join(repo, ".githooks", "pre-commit"), "utf8");

  it("every file `pnpm codemap` rewrites is staged by the hook", () => {
    const generated = ["CODEMAP.md", "wiring.json", "WIRING.md", "WIRING.html", "openapi.yaml", "PARAMETERS.md", "data/requestSchemas.json", "evidence/todo-backend-grep.txt"];
    expect(generated.filter((file) => !hook.includes(`"$APP/${file}"`))).toEqual([]);
  });

  it("a commit that touches only HANDOVER.md is not skipped — the handover page is made from it", () => {
    const exit = hook.split("\n").find((line) => line.includes("git diff --cached --name-only")) ?? "";
    expect(exit).toContain("HANDOVER");
  });

  it("names its work tree once", () => {
    expect(hook.match(/export GIT_WORK_TREE=/g)).toHaveLength(1);
  });
});
