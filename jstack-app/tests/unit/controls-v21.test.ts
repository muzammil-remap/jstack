/**
 * QA-01b (T-1) — `CONTROLS_v21.md` cannot become a stale second opinion.
 *
 * `CONTROLS_v2.md` is the complete reference and `controls.test.ts` guards it
 * in both directions. This file guards the DELTA document against three ways
 * it could quietly stop being true:
 *
 *   1. it names a control that no longer exists,
 *   2. it names one `CONTROLS_v2.md` does not — two documents disagreeing
 *      about one app, which is worse than one document being incomplete,
 *   3. it attributes a control to a row that was never in the plan.
 *
 * It deliberately does NOT check the other direction (every new control is
 * listed here): that is `controls.test.ts`'s job against the complete
 * reference, and a second copy of it would be a second thing to keep true.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..");
const V21 = readFileSync(join(APP, "..", "history", "v21", "CONTROLS_v21.md"), "utf8");
const V2 = readFileSync(join(APP, "..", "history", "v2", "CONTROLS_v2.md"), "utf8");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".expo", "e2e", "tests"].includes(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

const SOURCE = sources(APP)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

/** the fixture is the other half of the source for derived ids. */
const FIXTURE = readFileSync(join(APP, "data", "mock", "fixtures", "sections.json"), "utf8");

/** the delta document minus its REMOVED table, which names V2 controls
 * precisely BECAUSE they are gone — checking those against the source would
 * assert the opposite of what the table says. */
const LIVE = V21.slice(0, V21.indexOf("## What V2.1 REMOVED"));

/** every backticked token in the first column of a testID table, plus the
 * ones listed in the "Read-only:" paragraphs. */
function documented(): string[] {
  const out = new Set<string>();
  let inTable = false;
  for (const line of LIVE.split("\n")) {
    if (/^\|\s*testID\s*\|/i.test(line)) {
      inTable = true;
      continue;
    }
    if (!line.startsWith("|")) {
      inTable = false;
      // the read-only runs are prose, and they are still claims
      if (/^Read-only:/.test(line) || /^`\$\{/.test(line)) {
        for (const m of line.matchAll(/`([^`]+)`/g)) out.add(m[1]);
      }
      continue;
    }
    if (/^\|\s*-{2,}/.test(line)) continue;
    if (!inTable) continue;
    for (const m of (line.split("|")[1] ?? "").matchAll(/`([^`]+)`/g)) out.add(m[1]);
  }
  return [...out];
}

/** a template's fixed lead — what a literal grep can look for. */
const stem = (id: string) => id.split("${")[0].replace(/-$/, "");

describe("QA-01b · CONTROLS_v21.md is true", () => {
  const ids = documented();

  it("names a real number of controls", () => {
    // a parser that silently found nothing would pass every check below
    expect(ids.length).toBeGreaterThan(30);
  });

  it("every control it names still exists in the source or the section fixture", () => {
    const missing = ids.filter((id) => {
      const s = stem(id);
      if (s === "") return false; // a bare `${...}` template carries no signal
      return !SOURCE.includes(s) && !FIXTURE.includes(s);
    });
    expect(missing).toEqual([]);
  });

  it("every control it names is also in CONTROLS_v2.md, the complete reference", () => {
    // by STEM, because the two documents spell a template differently by
    // design: this one writes the rule (`${idPrefix}-act-${rowId}`) and the
    // reference writes what ships (`person-act-${id}`). The fixed lead is
    // what they must agree on.
    const undocumented = ids.filter((id) => {
      const s = stem(id);
      return s !== "" && !V2.includes(s);
    });
    expect(undocumented).toEqual([]);
  });

  it("every row it credits is a row the plan named", () => {
    const rows = new Set([...V21.matchAll(/\|\s*((?:[A-Z]{1,2}-\d+(?:, )?)+)\s*\|\s*$/gm)].flatMap((m) => m[1].split(", ")));
    const planned = new Set(["I-1", "O-1", "O-2", "U-1", "B-1", "B-2", "B-3", "V-1", "V-2", "T-1", "T-2"]);
    expect([...rows].filter((r) => !planned.has(r))).toEqual([]);
    expect(rows.size).toBeGreaterThan(3);
  });
});
