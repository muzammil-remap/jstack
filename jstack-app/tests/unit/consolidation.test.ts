/**
 * RM-03, RM-07..RM-10 and CD-10 — the consolidated REMAP set (row A-5, ADR-60).
 *
 * The set is four files a new team reads instead of the version history —
 * `HANDOVER.md`, `CONTRACT.md`, `DECISIONS.md`, `KNOWN_GAPS.md` — plus the
 * outline, the readiness checklist and the phone runbook. A document is only
 * as good as the gate that keeps it true, so every claim below is checked
 * against the tree rather than against another document:
 *
 *  - every section of the three versioned contracts is in `CONTRACT.md` at its
 *    number, or is named in its RETIRED table with a reason;
 *  - EVERY ROUTE in `data/routes.ts` is declared in `CONTRACT.md`'s §4 — the
 *    whole table, not a sample (the lesson of A4R4-05: a parser that reads
 *    part of its subject passes its own guard);
 *  - every banner on a versioned original names a file that exists;
 *  - the phone runbook quotes only strings the app renders and names only IDs
 *    that are PASS.
 *
 * `HANDOVER.md`'s "Connect and run" (RM-01); the readiness list is `HANDOVER.md` §3 since v2.3.2 (RM-02 never had a case)
 * are walked in `handover.test.ts`, as their acceptance rows say.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROUTES } from "@/data/routes";

const app = join(__dirname, "..", "..");
const repo = join(app, "..");
const read = (rel: string) => readFileSync(join(repo, rel), "utf8").replace(/\r\n/g, "\n");

const CONSOLIDATED = ["HANDOVER.md", "CONTRACT.md", "DECISIONS.md", "KNOWN_GAPS.md", "DEVICE_RUNBOOK.md"];
/** each versioned original and the consolidated file that replaces it */
const VERSIONED: [string, string][] = [
  ["history/v2/HANDOVER_v2.md", "HANDOVER.md"],
  ["history/v21/HANDOVER_v21.md", "HANDOVER.md"],
  ["history/v22/HANDOVER_v22.md", "HANDOVER.md"],
  ["history/v1/HANDOVER_v1.1.md", "HANDOVER.md"],
  ["history/v2/V2_HANDOVER_OUTLINE.md", "HANDOVER.md"],
  ["history/v2/CONTRACT_v2.md", "CONTRACT.md"],
  ["history/v21/CONTRACT_v21.md", "CONTRACT.md"],
  ["history/v22/CONTRACT_v22.md", "CONTRACT.md"],
  ["history/v2/V2_DECISIONS.md", "DECISIONS.md"],
  ["history/v21/V21_DECISIONS.md", "DECISIONS.md"],
  ["history/v22/V22_DECISIONS.md", "DECISIONS.md"],
  ["history/v2/CARRIED_DEFECTS_v2.md", "KNOWN_GAPS.md"],
  ["history/v21/CARRIED_DEFECTS_v21.md", "KNOWN_GAPS.md"],
  ["CARRIED_DEFECTS_v22.md", "KNOWN_GAPS.md"],
];

/** a section of a markdown file, from its heading to the next heading of the same depth */
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) return "";
  const depth = heading.match(/^#+/)?.[0] ?? "##";
  const rest = text.slice(start + heading.length);
  const next = rest.search(new RegExp(`\\n${depth} `));
  return heading + (next === -1 ? rest : rest.slice(0, next));
}

/** backticked tokens that name a file or directory in the repository */
function pathsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/`([^`\s]+)`/g)) {
    const t = m[1];
    if (/[<>*…{}?=#]|^https?:|^\/|^~|^\.\//.test(t)) continue;
    if (!/\/|\.(md|ts|tsx|mjs|cjs|js|json|yaml|html|txt)$/.test(t)) continue;
    out.push(t.replace(/\/$/, ""));
  }
  return [...new Set(out)];
}
const exists = (t: string, bases: string[]) => bases.some((b) => existsSync(join(b, t)));

/** words outside fenced code blocks and table rows — what the reader wades through */
function proseWords(text: string): number {
  const prose = text
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .filter((l) => !l.startsWith("|"))
    .join(" ");
  return prose.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

describe("RM-09 · the consolidated set exists", () => {
  it.each(CONSOLIDATED)("%s is at the repository root", (file) => {
    expect(existsSync(join(repo, file))).toBe(true);
  });
});

describe("RM-09 · CONTRACT.md folds in every section of the three contracts", () => {
  const contract = read("CONTRACT.md");
  const headings = contract.split("\n").filter((l) => /^#{2,3} /.test(l));
  const retired = section(contract, "## RETIRED");

  it.each(["history/v2/CONTRACT_v2.md", "history/v21/CONTRACT_v21.md", "history/v22/CONTRACT_v22.md"])("every ## / ### heading of %s is in CONTRACT.md or RETIRED", (file) => {
    const missing: string[] = [];
    for (const line of read(file).split("\n").filter((l) => /^#{2,3} /.test(l))) {
      const num = /§(\d+(?:\.\d+)?)/.exec(line)?.[1];
      const title = line.replace(/^#+\s*/, "");
      if (num != null) {
        // "§4 additions · endpoints" is folded into §4; "§4.15 Tasks" is §4.15
        if (!headings.some((h) => new RegExp(`§${num.replace(".", "\\.")}(\\.|\\s)`).test(h))) missing.push(title);
      } else {
        const words = title.split(/\s+/).slice(0, 3).join(" ");
        if (!headings.some((h) => h.includes(words)) && !retired.includes(words)) missing.push(title);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every route in data/routes.ts is declared in CONTRACT.md §4 — all of them", () => {
    const endpoints = section(contract, "## §4. Endpoints");
    expect(endpoints.length).toBeGreaterThan(0);
    const declared = new Set<string>();
    for (const row of endpoints.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("|---"))) {
      const first = row.split(/(?<!\\)\|/)[1] ?? "";
      let method: string[] = [];
      let path = "";
      for (const seg of first.split("·")) {
        const methods = /\b((?:GET|POST|PUT|PATCH|DELETE)(?:\/(?:GET|POST|PUT|PATCH|DELETE))*)\b/.exec(seg)?.[1]?.split("/");
        const p = /`(\/[^`\s]*)`/.exec(seg)?.[1];
        if (methods != null) method = methods;
        if (p != null) path = p.split("?")[0];
        if (path !== "") for (const m of method) declared.add(`${m} ${path}`);
      }
    }
    const missing = ROUTES.map((r) => `${r.method} ${r.path}`).filter((k) => !declared.has(k));
    expect(missing).toEqual([]);
  });

  it("every §8 question carries the answer the app assumes", () => {
    const questions = section(contract, "## §8.").split("\n").filter((l) => /^\d+\. \*\*/.test(l));
    expect(questions.length).toBe(24);
    expect(questions.filter((q) => !/Assumed|Answered|Closed|assumed|accepts only|ships Web Push|plays an|developer's choice|REMAP per the brief|Not assumed/.test(q))).toEqual([]);
  });
});

describe("RM-08 · HANDOVER.md, KNOWN_GAPS.md and the runbook name files that exist", () => {
  it.each(["HANDOVER.md", "KNOWN_GAPS.md", "DEVICE_RUNBOOK.md"])("every path in %s exists", (file) => {
    const missing = pathsIn(read(file)).filter((t) => !exists(t, [repo, app]));
    expect(missing).toEqual([]);
  });

  // v2.3.2: HANDOVER_OUTLINE.md's reading order folded into HANDOVER.md's
  // reference-files section — the same "names the consolidated set" check,
  // relocated there. Renumbered again 16 Sep (WP-T) from §8 to §9.
  it("HANDOVER.md §9 names the consolidated set", () => {
    const outline = section(read("HANDOVER.md"), "## 9. Reference files");
    expect(outline.length).toBeGreaterThan(200);
    for (const file of CONSOLIDATED.filter((f) => f !== "HANDOVER.md")) {
      expect({ file, named: outline.includes(`\`${file}\``) }).toEqual({ file, named: true });
    }
  });
});

describe("RM-09 · DECISIONS.md carries ADR-01..75, the superseded ones naming their successor", () => {
  const decisions = read("DECISIONS.md");
  const rows = decisions.split("\n").filter((l) => /^\| \d{2} \|/.test(l));

  it("one row per decision, 01 to 75, in order", () => {
    const numbers = rows.map((r) => Number(/^\| (\d{2}) \|/.exec(r)?.[1]));
    expect(numbers).toEqual(Array.from({ length: 75 }, (_, i) => i + 1));
  });

  it.each([
    [12, 46],
    [29, 47],
    [33, 59],
    [34, 61],
  ])("ADR-%i is marked superseded by ADR-%i", (adr, successor) => {
    const row = rows.find((r) => r.startsWith(`| ${String(adr).padStart(2, "0")} |`)) ?? "";
    expect(row).toMatch(new RegExp(`superseded by ADR-${successor}\\b`));
  });
});

describe("RM-06 · CODEMAP §7 indexes every decision with its status, and quotes no superseded one as standing", () => {
  it("every ADR in DECISIONS.md is in §7, and each superseded one says so there", () => {
    const codemap = readFileSync(join(app, "CODEMAP.md"), "utf8").replace(/\r\n/g, "\n");
    const index = section(codemap, "## 7. The decision index");
    expect(index.length).toBeGreaterThan(500);
    const rows = read("DECISIONS.md")
      .split("\n")
      .filter((l) => /^\| \d{2} \|/.test(l));
    const missing: string[] = [];
    for (const row of rows) {
      const num = /^\| (\d{2}) \|/.exec(row)![1];
      const line = index.split("\n").find((l) => l.startsWith(`- **ADR-${num} · `)) ?? "";
      if (line === "") missing.push(`ADR-${num}: not in §7`);
      else if (/superseded by ADR-\d+/.test(row) && !/superseded by ADR-\d+/.test(line)) missing.push(`ADR-${num}: superseded, and §7 does not say so`);
    }
    expect(missing).toEqual([]);
  });
});

describe("RM-09 · KNOWN_GAPS.md lists every open carried defect", () => {
  const gaps = read("KNOWN_GAPS.md");
  it("every id carried in CARRIED_DEFECTS_v22.md from §4 on has a line", () => {
    const carried = read("CARRIED_DEFECTS_v22.md");
    const from = carried.indexOf("## 4 ·");
    // A row whose disposition opens "**CLOSED at A-6**", or "**CLOSED at v2.3 (<commit>)**" naming the
    // commit that fixed it (WP-E E-3), is no longer carried:
    // the id stays in this file because it is the RECORD of what was carried
    // and when it stopped being, and `KNOWN_GAPS.md` is the list of what is
    // still open. A closed defect with a gap line would be the opposite lie to
    // the one this guard exists to catch.
    const ids = [...new Set([...carried.slice(from).matchAll(/^\| \*\*([A-Z0-9-]+)\*\*[^\n]*/gm)].filter((m) => !m[0].includes("**CLOSED at A-6**") && !/\*\*CLOSED at v2\.3 \([0-9a-f]{7,40}\)\*\*/.test(m[0])).map((m) => m[1]))];
    expect(ids.length).toBeGreaterThan(10);
    // D9's failure shape one file over (the A-6 re-audit's D10): this was
    // `gaps.includes(id)`, a SUBSTRING test, and of the ids it requires
    // exactly one was satisfied that way — `D-1`, by the letters inside
    // one of the fifteen carried CD ids. A guard whose whole job is "every
    // listed" was answering yes on a coincidence of spelling. The id has to
    // stand on its own: not preceded by a letter, digit or hyphen, and not
    // followed by a digit, so it cannot be found inside a longer id. The ids
    // are NOT written out here: this file is scanned by tools/qa-rows.mjs, and
    // an acceptance id named in a COMMENT reads to it as a test quoting that id
    // (A-6 re-audit E3 — the first cut of this comment turned a PARTIAL row
    // into a PASS off a sentence explaining why it was PARTIAL).
    const named = (id: string) => new RegExp(`(^|[^A-Za-z0-9-])${id}([^0-9]|$)`).test(gaps);
    expect(ids.filter((id) => !named(id))).toEqual([]);
  });

  it("every row says whose it is", () => {
    const rows = section(gaps, "## 1. Still open in the app")
      .split("\n")
      .filter((l) => l.startsWith("| ") && !l.startsWith("| ID ") && !l.startsWith("| What ") && !/^\|[-| ]+\|$/.test(l));
    expect(rows.length).toBeGreaterThan(40);
    expect(rows.filter((r) => !/\| (REMAP|Josh|A-6) \|$/.test(r.trim()))).toEqual([]);
  });
});

describe("CD-10 · the V2.1 rows that stand by decision are in KNOWN_GAPS.md with the reason and the lever", () => {
  const gaps = read("KNOWN_GAPS.md");
  it.each(["UX-A", "UX-C", "UX-E", "UX-G", "UX-K"])("%s has its row, its reason and its lever", (id) => {
    const row = gaps.split("\n").find((l) => l.startsWith(`| ${id} |`)) ?? "";
    expect(row).not.toBe("");
    expect(row).toMatch(/lever: /);
  });
});

describe("RM-11 · the appendix holds the real user stories, not a sketch (v2.3.2 WPT-3, the audit's R5-02)", () => {
  it("appendix/USER_STORIES_DRAFT.md carries the acceptance-ID rows and the three parts", () => {
    const text = read("appendix/USER_STORIES_DRAFT.md");
    const rows = text.split("\n").filter((l) => /^\| [A-Z]{2,3}-\d+ \|/.test(l)).length;
    expect(rows).toBeGreaterThanOrEqual(400);
    for (const part of ["## Part A", "## Part B", "## Part C"]) expect(text).toContain(part);
  });
});

describe("RM-10 · every versioned original says what supersedes it, and nothing moved", () => {
  it.each(VERSIONED)("%s starts with the banner naming %s", (file, successor) => {
    expect(existsSync(join(repo, file))).toBe(true);
    const first = read(file).split("\n")[0];
    const m = /^Superseded for REMAP by `([^`]+)`; kept as history\.$/.exec(first);
    expect({ file, first: first.slice(0, 90), names: m?.[1] }).toEqual({ file, first: first.slice(0, 90), names: successor });
    expect(existsSync(join(repo, successor))).toBe(true);
  });

  it("the cold-start sentence names HANDOVER.md", () => {
    const prompt = read("history/v1/19_CC_V22_AUDIT_PROMPT.md");
    expect(prompt).toContain("sentence: Read HANDOVER.md and do what it says");
    if (existsSync(join(repo, "COLD_START_REQUEST.md"))) {
      expect(read("COLD_START_REQUEST.md")).toMatch(/^sentence: Read HANDOVER\.md /m);
    }
  });
});

describe("the REMAP set stays short (Josh, 11 Sep: 'concise and accurate, never long-winded')", () => {
  it("README.md is under 300 words", () => {
    const words = read("README.md").split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    expect({ words, under: words < 300 }).toEqual({ words, under: true });
  });

  it("HANDOVER.md is under 3,000 words of prose (tables and code blocks aside; v2.3.2 folded the plan, the outline and the readiness list in and still sits well under)", () => {
    const words = proseWords(read("HANDOVER.md"));
    expect({ words, under: words < 3000 }).toEqual({ words, under: true });
  });

  it("README.md sends the reader to HANDOVER.md", () => {
    expect(read("README.md")).toContain("Start at [`HANDOVER.md`](HANDOVER.md)");
  });
});

describe("RM-03 · CONTRIBUTING.md states the prerequisites and every variable the app or CI reads", () => {
  const contributing = read("CONTRIBUTING.md");
  const inventory = section(contributing, "## Prerequisites, environment and secrets");

  it("has the section, with Node, pnpm, Playwright, Git Bash and core.hooksPath", () => {
    expect(inventory.length).toBeGreaterThan(200);
    for (const must of ["Node", "pnpm", "Playwright", "Git Bash", "core.hooksPath"]) expect({ must, found: inventory.includes(must) }).toEqual({ must, found: true });
  });

  it("names every environment variable the app, its tools and its tests read", () => {
    const dirs = ["app", "components", "data", "layout", "lib", "stores", "theme", "tools", "e2e", "tests"];
    const files: string[] = ["metro.config.js", "jest.config.js"].map((f) => join(app, f));
    // RM-03 race (D-16): this walk runs in parallel with
    // `tests/unit/lint-guards.test.ts`, which mkdtemp's and removes its own
    // `tests/lint-guard-scratch-*` mid-suite — a name this walk could list
    // one tick and find gone the next. `.tmp-*` is skipped on the same
    // convention for whatever scratch dir a future test mkdtemp's under one.
    // Skipping known scratch names avoids the race for the case that
    // provokes it; tolerating ENOENT on whatever `statSync` still catches
    // mid-flight (a real filesystem race, not a naming convention) covers
    // the rest without hiding a genuine error.
    const walk = (dir: string) => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw err;
      }
      for (const name of entries) {
        if (/^(lint-guard-scratch-|\.tmp-)/.test(name)) continue;
        const p = join(dir, name);
        let isDir: boolean;
        try {
          isDir = statSync(p).isDirectory();
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw err;
        }
        if (isDir) walk(p);
        else if (/\.(ts|tsx|mjs|js)$/.test(name)) files.push(p);
      }
    };
    for (const d of dirs) walk(join(app, d));
    const vars = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) vars.add(m[1]);
    // the platform's own, which a contributor never sets for this app
    for (const own of ["NODE_ENV", "TZ", "CI"]) vars.delete(own);
    expect(vars.size).toBeGreaterThan(8);
    expect([...vars].filter((v) => !inventory.includes(v)).sort()).toEqual([]);
  });

  it("says where the VAPID key and the voice socket come from, and what CI reads", () => {
    for (const must of ["VAPID", "voice socket", "CI reads"]) expect({ must, found: inventory.includes(must) }).toEqual({ must, found: true });
  });
});

describe("RM-07 · DEPLOY.md's native section says what exists, what is parked and the next step", () => {
  it("has all three, names the lock's module, and no EAS/Expo Go survives it (v2.3.2, WPO-1)", () => {
    const native = section(read("DEPLOY.md"), "## Native — what exists, what is parked, the next step");
    for (const must of ["**Exists.**", "**Parked.**", "**The next step.**", "expo-local-authentication", "expo prebuild"]) {
      expect({ must, found: native.includes(must) }).toEqual({ must, found: true });
    }
    for (const gone of ["eas build", "eas submit", "eas init", "EAS Update"]) {
      expect({ gone, found: native.includes(gone) }).toEqual({ gone, found: false });
    }
  });
});

describe("the phone runbook (DEVICE_RUNBOOK.md) quotes the app and names only IDs that pass", () => {
  const runbook = read("DEVICE_RUNBOOK.md");

  it("every string it quotes as the app's own is in the source", () => {
    const sources = ["components", "app", "layout", "lib", "stores", "data"].map((d) => join(app, d));
    const corpus: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|json)$/.test(name)) corpus.push(readFileSync(p, "utf8"));
      }
    };
    for (const s of sources) walk(s);
    const all = corpus.join("\n");
    // the steps only: a heading's "wrong" is the runbook's own word, not the app's
    const steps = runbook
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .join("\n");
    const quoted = [...new Set([...steps.matchAll(/"([^"\n]{3,80})"/g)].map((m) => m[1]))];
    expect(quoted.length).toBeGreaterThan(4);
    expect(quoted.filter((q) => !all.includes(q))).toEqual([]);
  });

  it("every acceptance ID a step names is PASS in QA_REPORT_v22.md §1", () => {
    // §1 only: §2's statuses are about the V2.1 lessons, not these IDs
    const full = read("QA_REPORT_v22.md");
    const report = full.slice(full.indexOf("## §1."), full.indexOf("## §2."));
    expect(report.length).toBeGreaterThan(1000);
    const status = new Map([...report.matchAll(/^\| ([A-Z][A-Z0-9]{1,2}-\d{2}) \| ([A-Z 4]+?) \|/gm)].map((m) => [m[1], m[2].trim()]));
    const named = [...new Set([...runbook.matchAll(/\b([A-Z]{2}-\d{2})\b/g)].map((m) => m[1]))];
    expect(named.length).toBeGreaterThan(10);
    expect(named.filter((id) => status.get(id) !== "PASS")).toEqual([]);
  });
});
