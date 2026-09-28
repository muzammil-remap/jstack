/**
 * QA-02b — every test title `QA_REPORT_v2.md` quotes must exist in the file
 * that row names, and no citation may carry a line number (B7-02).
 *
 * The report used to cite evidence as `today.spec.ts:7-8`. Line numbers rot
 * the moment anything above them moves, and by the audit's round 7 thirty-nine
 * of the hundred and thirteen checkable pointers named a DIFFERENT test than
 * the row claimed — TD-01 pointed at TD-02's describe, every VO row was about
 * twenty-five lines out. Nothing could see it: QA-02 compares quoted COUNTS,
 * so no guard has ever compared a row's prose to the code, which is why the
 * same class of defect (A-09, then AA-06 one round later, then this) has now
 * been found three times by three different readers.
 *
 * So the report cites TITLES, which move with the code they name, and this
 * file is the check that they still resolve. A stale citation is now a red
 * test rather than a thing someone has to notice.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const app = join(__dirname, "..", "..");
const report = readFileSync(join(app, "..", "history", "v2", "QA_REPORT_v2.md"), "utf8");

/** every .spec.ts / .test.ts(x) under e2e/ and tests/, by basename */
function indexTestFiles(dir: string, acc: Map<string, string[]>): Map<string, string[]> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      indexTestFiles(full, acc);
    } else if (/\.(spec|test)\.tsx?$/.test(name)) {
      acc.set(name, [...(acc.get(name) ?? []), full]);
    }
  }
  return acc;
}
const byBasename = indexTestFiles(join(app, "e2e"), indexTestFiles(join(app, "tests"), new Map()));

const rows = report.split("\n").filter((l) => /^\| [A-Z]{2,4}-\d/.test(l));

describe("QA-02b QA_REPORT_v2.md citations resolve to real tests", () => {
  it("reads all 166 acceptance rows", () => {
    expect(rows.length).toBe(166);
  });

  it("no row cites a line number — they rot silently and this one has, twice", () => {
    const withLines = rows.filter((r) => /\.(spec|test)\.tsx?:\d/.test(r) || /\s:\d+-\d+/.test(r));
    expect(withLines).toEqual([]);
  });

  it("every test file a row names exists", () => {
    const missing: string[] = [];
    for (const row of rows) {
      for (const [, file] of [...row.matchAll(/([A-Za-z0-9_.-]+\.(?:spec|test)\.tsx?)/g)]) {
        if (!byBasename.has(file)) missing.push(`${row.split("|")[1].trim()} → ${file}`);
      }
    }
    expect(missing).toEqual([]);
  });

  // The anchors this can check without guessing: an explicit describe("…"),
  // test("…") or it("…") wrapper, and a bare quoted string that opens with an
  // acceptance ID (`"FS-05: Agents shows no focus chips"`) — both are verbatim
  // titles, so both must appear verbatim in one of the row's own files.
  it("every quoted test title appears verbatim in a file the same row names", () => {
    const unresolved: string[] = [];
    for (const row of rows) {
      const id = row.split("|")[1].trim();
      const files = [...new Set([...row.matchAll(/([A-Za-z0-9_.-]+\.(?:spec|test)\.tsx?)/g)].map((m) => m[1]))];
      const titles = [
        ...[...row.matchAll(/(?:describe|test|it)\(\s*"([^"]+)"/g)].map((m) => m[1]),
        ...[...row.matchAll(/"([A-Z]{2,4}-\d{2}[^"]*)"/g)].map((m) => m[1]),
      ];
      if (titles.length === 0) continue;
      const sources = files
        .flatMap((f) => byBasename.get(f) ?? [])
        .filter((f) => existsSync(f))
        .map((f) => readFileSync(f, "utf8"));
      for (const title of [...new Set(titles)]) {
        if (!sources.some((src) => src.includes(title))) unresolved.push(`${id} → ${JSON.stringify(title)}`);
      }
    }
    expect(unresolved).toEqual([]);
  });
});

/**
 * PF-05 (Josh's A-0 row 4): the phone check exists, with the LAN address to
 * open, numbered checks with what "wrong" looks like, the offline and install
 * steps, and the scroll. Read from the runbook, not remembered.
 */
describe("PF-05 · DEVICE_RUNBOOK_v21.md carries the five-minute phone check", () => {
  it("names the address, the numbered checks, offline, install and the scroll", () => {
    const runbook = readFileSync(join(app, "..", "history", "v21", "DEVICE_RUNBOOK_v21.md"), "utf8");
    expect(runbook).toContain("http://<your-laptop-ip>:4173");
    expect(runbook).toContain("### 4. Offline");
    expect(runbook).toContain("### 5. Install");
    expect(runbook).toContain("Scroll Today");
    expect((runbook.match(/^### \d+\. /gm) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
