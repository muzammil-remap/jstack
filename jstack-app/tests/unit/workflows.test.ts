/**
 * C-1 — every workflow step runs something that exists.
 *
 * LV-04's first half lives here (T2-1's self-check): every gate a delivery doc
 * CLAIMS ("refuses", "empty", a count, PASS) has to exist as a workflow step or
 * a test. The second half — the counts in HANDOVER_v22.md, README.md and
 * QA_REPORT_v22.md equalling `evidence/jest-summary.json` — is guarded in
 * `handover.test.ts` and cannot close until T2-2 writes those three documents.
 *
 * A board step that calls a script nobody wrote fails the first time it
 * matters, which is the push that needed it. The failure is also uniquely
 * annoying: it happens on the runner, minutes into a job, after everything
 * cheap has already passed.
 *
 * So the workflows are parsed and every `run:` is checked against the
 * `package.json` scripts and the `tools/` directory. `tools/workflow-yaml.mjs`
 * is a second small parser, separate from `tools/yaml.mjs` — that one reads
 * the narrow subset this repo EMITS, and widening it to swallow hand-written
 * YAML would make it accept things it should reject when checking its own
 * output.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const app = join(__dirname, "..", "..");
const repo = join(app, "..");
const WORKFLOWS = join(repo, ".github", "workflows");

/** The .mjs parser, run in a child process — Jest's CommonJS transform will
 * not take an ES module tool, and this is how the board runs it anyway. */
const cache = new Map<string, { doc: unknown; runs: string[] }>();

function parsed(file: string): { doc: unknown; runs: string[] } {
  // Memoised. Each call spawns a Node process, and parsing the same three
  // files once per assertion took two minutes for a check that reads three
  // small files — the same shape as B-20, in a smaller suite.
  const hit = cache.get(file);
  if (hit != null) return hit;
  const url = pathToFileURL(join(app, "tools", "workflow-yaml.mjs")).href;
  const script = [
    `const W = await import(${JSON.stringify(url)});`,
    `const fs = await import("node:fs");`,
    `const doc = W.parseWorkflow(fs.readFileSync(${JSON.stringify(file)}, "utf8"));`,
    `console.log(JSON.stringify({ doc, runs: W.runSteps(doc) }));`,
  ].join("");
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: app, encoding: "utf8" })) as { doc: unknown; runs: string[] };
  cache.set(file, result);
  return result;
}

const workflowFiles = () => readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).sort();

const scripts = () => Object.keys((JSON.parse(readFileSync(join(app, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts);

describe("C-1 / CI-01 · every workflow parses and every run step is real", () => {
  it("there are workflows to check", () => {
    expect(workflowFiles().length).toBeGreaterThan(1);
  });

  it.each(["board.yml", "release.yml"])("%s parses into a jobs document", (file) => {
    const { doc } = parsed(join(WORKFLOWS, file)) as { doc: { name: string; jobs: Record<string, unknown> } };
    expect(typeof doc.name).toBe("string");
    expect(Object.keys(doc.jobs).length).toBeGreaterThan(0);
  });

  it("every `pnpm <script>` names a script package.json declares", () => {
    const known = scripts();
    const missing: string[] = [];
    for (const file of workflowFiles()) {
      for (const run of parsed(join(WORKFLOWS, file)).runs) {
        for (const m of run.matchAll(/\bpnpm (?:run )?([a-z][a-z0-9:_-]*)/g)) {
          const name = m[1];
          // pnpm's own verbs, not scripts
          if (["install", "audit", "store", "exec", "dlx", "why", "add", "remove"].includes(name)) continue;
          if (!known.includes(name)) missing.push(`${file}: pnpm ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("every `node tools/x.mjs` names a tool that exists", () => {
    const missing: string[] = [];
    for (const file of workflowFiles()) {
      for (const run of parsed(join(WORKFLOWS, file)).runs) {
        for (const m of run.matchAll(/\bnode (tools\/[A-Za-z0-9_.-]+\.mjs)/g)) {
          if (!existsSync(join(app, m[1]))) missing.push(`${file}: ${m[1]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("the check is not vacuous — it finds the steps it is checking", () => {
    // a parser that silently returned nothing would make every assertion
    // above pass while checking nothing at all
    const board = parsed(join(WORKFLOWS, "board.yml")).runs;
    expect(board.length).toBeGreaterThan(6);
    expect(board.join("\n")).toContain("pnpm test");
    expect(board.join("\n")).toContain("node tools/secret-scan.mjs");
  });
});

describe("C-1 / CI-01 / SH-05 · the board runs every gate the build claims", () => {
  const boardRuns = () => parsed(join(WORKFLOWS, "board.yml")).runs.join("\n");

  it.each([
    ["typecheck", "pnpm check"],
    ["lint", "pnpm lint"],
    ["unit tests", "pnpm test"],
    ["dead exports", "pnpm unused"],
    ["the contract is valid", "node tools/validate-openapi.mjs"],
    ["the audit allow-list", "node tools/audit-check.mjs"],
    ["secret scan", "node tools/secret-scan.mjs"],
    ["log scan", "node tools/log-scan.mjs"],
    ["the blocked-action grep (SEC-15)", "SEC-15"],
  ])("%s", (_name, command) => {
    expect(boardRuns()).toContain(command);
  });

  it("checks out full history — the codemap freshness check compares commits", () => {
    // B-14: a shallow clone does not contain the commits CM-02 compares, and
    // `git log` exits 128 rather than answering nothing
    expect(readFileSync(join(WORKFLOWS, "board.yml"), "utf8")).toContain("fetch-depth: 0");
  });
});

describe("P-1 / SH-03 · the release runs the gates a tag claims", () => {
  const releaseRuns = () => parsed(join(WORKFLOWS, "release.yml")).runs.join("\n");

  it.each([
    ["typecheck", "pnpm check"],
    ["lint", "pnpm lint"],
    ["unit tests", "pnpm test"],
    ["the contract is valid", "node tools/validate-openapi.mjs"],
    ["the production build", "pnpm build:web:prod"],
    ["secret scan", "node tools/secret-scan.mjs"],
    ["log scan", "node tools/log-scan.mjs"],
    ["the SBOM", "node tools/gen-sbom.mjs"],
    // A-0 review, R-01: CODEMAP.md §11 said "a release requires them empty"
    // for two stages while no workflow step asked. The claim is a step now.
    ["the companion lists are empty", "node tools/companions-check.mjs"],
  ])("%s", (_name, command) => {
    expect(releaseRuns()).toContain(command);
  });
});

describe("PW-06 · the release attaches what it says it attaches", () => {
  // A-0 review, R-09: QA_REPORT_v21.md's PW-06 row said the release attaches
  // `jstack-web-<tag>.zip` and `jstack-mock-<tag>.html`; release.yml attached
  // a .tar.gz and no mock at all, and the audit prompt's A-6 repeats the
  // claim. The artefacts a person is told to download are asserted by name.
  const release = () => readFileSync(join(WORKFLOWS, "release.yml"), "utf8");

  it("builds the single-file mock from the production export", () => {
    expect(parsed(join(WORKFLOWS, "release.yml")).runs.join("\n")).toContain("node tools/build-mock.mjs");
  });

  it("attaches the zip and the mock, named by the tag", () => {
    const text = release();
    expect(text).toContain("jstack-web-${{ github.ref_name }}.zip");
    expect(text).toContain("jstack-mock-${{ github.ref_name }}.html");
    expect(text).not.toContain(".tar.gz");
  });
});

describe("CI-02 · the board keeps the production build", () => {
  it("uploads dist-prod as an artifact, built inside the workspace", () => {
    const board = readFileSync(join(WORKFLOWS, "board.yml"), "utf8");
    expect(board).toContain("actions/upload-artifact");
    expect(board).toContain("path: jstack-app/dist-prod");
    expect(board).toContain("JSTACK_PROD_DIST: ${{ github.workspace }}/jstack-app/dist-prod");
  });
});

/**
 * CD-01 (PF-A, carried from V2.1 at R-04) — the perf verdict is a same-run A/B,
 * because a recorded number cannot be the yardstick for a 10% rule.
 *
 * The V2.1 baseline recorded 300 ms FCP and 84 ms worst long task. The same
 * bytes measured 412/96 on the same laptop a day later, and an unchanged build
 * spread 324–456 ms across four runs. A-1's "0 of 5 regressed" was retracted as
 * evidence for exactly that reason: the instrument's noise is larger than the
 * threshold it was being read against. Within a single run the spread is 6–8%,
 * so the honest comparison is reference and candidate served side by side and
 * measured in the same minute — which needs the previous green build kept where
 * this run can fetch it.
 */
describe("CD-01 · the perf gate is an A/B against a reference build, in the same run", () => {
  const board = () => readFileSync(join(WORKFLOWS, "board.yml"), "utf8");

  it("fetches the previous green build as the reference", () => {
    const text = board();
    expect(text).toContain("gh run download");
    // the artefact CI-02 uploads is what this downloads — one name, both ends
    expect(text).toContain("jstack-web-prod-");
  });

  it("serves both builds and compares them with --reference-url", () => {
    const runs = parsed(join(WORKFLOWS, "board.yml")).runs.join("\n");
    expect(runs).toContain("node tools/perf-baseline.mjs");
    expect(runs).toContain("--reference-url");
    // two ports in the same job: the candidate and the reference
    expect(runs).toContain("node tools/serve-web.mjs 4173");
    expect(runs).toContain("node tools/serve-web.mjs 4174");
  });

  it("reports rather than gates — the A/B informs, it does not fail the board", () => {
    // still a measurement on a shared runner. PF-04's byte budget is the hard
    // gate, because bytes do not drift between runs.
    const text = board();
    const perf = text.slice(text.indexOf("Perf A/B"));
    expect(perf).not.toBe("");
    expect(perf.slice(0, 400)).toContain("continue-on-error: true");
  });

  it("PF-04 stays a hard gate on bytes, which is the half that does not drift", () => {
    expect(existsSync(join(app, "tests", "unit", "bundle-budget.test.ts"))).toBe(true);
  });
});

/**
 * CI-03 (Josh's A-0 row 4): B-23 measured the browser suite at ~21 minutes on
 * a hosted runner and moved it to `nightly.yml` — 02:00 Brisbane, plus
 * workflow_dispatch. The workflow has existed since C-1; what did not was a
 * test naming CI-03, so the cross-reference could not find it.
 */
describe("CI-03 · the browser suite runs nightly, as B-23 decided", () => {
  it("nightly.yml exists, runs on a schedule and by hand, builds the test bundle and runs the e2e board", () => {
    const file = join(WORKFLOWS, "nightly.yml");
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, "utf8");
    expect(text).toMatch(/cron: "0 16 \* \* \*"/); // 02:00 Brisbane is 16:00 UTC the day before
    expect(text).toContain("workflow_dispatch");
    const runs = parsed(file).runs.join("\n");
    expect(runs).toContain("pnpm build:web");
    expect(runs).toContain("pnpm test:e2e");
    expect(runs).toContain("playwright install");
    // B-23 recorded the number the decision rests on
    expect(readFileSync(join(repo, "history", "v21", "BUGLOG_v21.md"), "utf8")).toMatch(/## B-23[\s\S]*846s/);
  });
});

// SH-04 / RR-03 · dependabot is weekly, grouped, for both ecosystems — removed
// (v2.3.2, WPO-1): Josh, 15 Sep: "no more emails". `.github/dependabot.yml`
// is deleted; the three workflows it fed are already disabled in GitHub's
// own settings and their files stay.

describe("RR-01 / RR-02 / RR-04 · the repository's hygiene files say what they must", () => {
  it("RR-01: the PR template asks for the board, the acceptance IDs touched, the CHANGES line and the markers", () => {
    const t = readFileSync(join(repo, ".github", "PULL_REQUEST_TEMPLATE.md"), "utf8");
    for (const must of ["pnpm check", "pnpm codemap", "acceptance ID", "CHANGES", "TODO(BACKEND"]) expect(t).toContain(must);
  });
  it("RR-02: CODEOWNERS makes Josh the owner of everything", () => {
    expect(readFileSync(join(repo, ".github", "CODEOWNERS"), "utf8")).toMatch(/^\*\s+@OMJO26$/m);
  });
  it("RR-04: CONTRIBUTING covers branches, the gates, the markers, the never-list and conformance", () => {
    const t = readFileSync(join(repo, "CONTRIBUTING.md"), "utf8");
    for (const must of ["## Branches", "## The gates", "TODO(BACKEND", "Never", "tools/conformance.mjs"]) expect(t).toContain(must);
  });
});
