/**
 * QA-01c (T2-1) — `CONTROLS_v22.md` cannot become a stale second opinion.
 *
 * `CONTROLS_v2.md` is the complete reference and `controls.test.ts` guards it
 * in both directions. This file guards the V2.2 DELTA document, in the same
 * shape `controls-v21.test.ts` guards V2.1's, against the three ways it could
 * quietly stop being true:
 *
 *   1. it names a control that no longer exists,
 *   2. its `kind` column is wrong — a `control` the complete reference does
 *      NOT document, or a `surface` it DOES,
 *   3. it attributes a control to a row that was never in the plan.
 *
 * Check 2 is two-directional on purpose. V2.1's delta asserted only that its
 * ids were in the reference, which a document can satisfy by listing nothing
 * awkward; this one has to be right about which ids the reference carries,
 * and 291 rows is far too many to keep right by looking.
 *
 * It deliberately does NOT check the other direction (every new control is
 * listed here): that is `controls.test.ts`'s job against the complete
 * reference, and a second copy of it would be a second thing to keep true.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..");
const V22 = readFileSync(join(APP, "..", "history", "v22", "CONTROLS_v22.md"), "utf8");
const V2 = readFileSync(join(APP, "..", "history", "v2", "CONTROLS_v2.md"), "utf8");
const PLAN = readFileSync(join(APP, "..", "history", "v22", "BUILD_PLAN_v22.md"), "utf8");

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

type Row = { id: string; where: string; kind: "control" | "surface"; row: string };

/**
 * Every `| testID | Where | Kind |` row, with the heading it sits under.
 *
 * The heading carries the row name (`## SY-1 · feat(v2.2 sync): …`), which is
 * the one thing this document adds over the complete reference.
 */
function rows(): Row[] {
  const out: Row[] = [];
  let heading = "";
  let inTable = false;
  for (const line of V22.split("\n")) {
    if (line.startsWith("## ")) {
      heading = line.slice(3).split("·")[0].trim();
      inTable = false;
      continue;
    }
    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }
    if (/^\|\s*testID\s*\|/i.test(line)) {
      inTable = true;
      continue;
    }
    if (/^\|\s*-{2,}\s*\|/.test(line)) continue;
    if (!inTable) continue;
    const cells = line.split("|");
    const id = /`([^`]+)`/.exec(cells[1] ?? "")?.[1];
    const kind = (cells[3] ?? "").trim();
    if (id == null) continue;
    out.push({ id, where: (cells[2] ?? "").trim(), kind: kind as Row["kind"], row: heading });
  }
  return out;
}

/** the complete reference's own documented set, harvested the way
 * `controls.test.ts` harvests it: the FIRST CELL of a table whose header
 * reads `testID`. A plain scan of the whole file pairs backticks ACROSS it,
 * so one unmatched backtick anywhere flips every pairing after it — which is
 * how a first cut of this file's generator reported 0 of 291 documented. */
function documentedInV2(): string[] {
  const out: string[] = [];
  let inTable = false;
  for (const line of V2.split("\n")) {
    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }
    if (/^\|\s*testID\s*\|/i.test(line)) {
      inTable = true;
      continue;
    }
    if (/^\|\s*-{2,}\s*\|/.test(line)) continue;
    if (!inTable) continue;
    const cell = line.split("|")[1] ?? "";
    for (const m of cell.matchAll(/`([a-zA-Z][^`]*)`/g)) out.push(m[1]);
  }
  return out;
}

const prefixOf = (id: string) => (id.includes("${") ? id.split("${")[0] : id);

/** identical literals, or — when either side is a template — one static
 * prefix leading the other. An empty static prefix carries no signal and
 * never counts, the same rule `controls.test.ts` applies. */
function compatible(a: string, b: string): boolean {
  if (!a.includes("${") && !b.includes("${")) return a === b;
  const pa = prefixOf(a);
  const pb = prefixOf(b);
  if (!pa || !pb) return false;
  return pa.startsWith(pb) || pb.startsWith(pa);
}

const ROWS = rows();
const DOCUMENTED = documentedInV2();

describe("QA-01c · CONTROLS_v22.md is the V2.2 delta, and stays true", () => {
  it("the document is the size it says it is — 301 ids over 30 rows", () => {
    // else every case below is asserting over a table that quietly emptied
    expect({ ids: ROWS.length, rows: new Set(ROWS.map((r) => r.row)).size }).toEqual({ ids: 301, rows: 30 });
  });

  it("A4-09: and its own PROSE says the same numbers as its table", () => {
    // The case above pins the table at 301 while the document's opening
    // sentence said 298, "every one of the 294 attributed" and "115 of the
    // 294" — three wrong numbers in a file whose whole job is to be counted,
    // under a guard whose title claims to check the size it says it is. It
    // checked the size; nothing read the sentence. Now both.
    // CRLF on disk here, LF after a fresh checkout elsewhere: normalise, or
    // this is a case that passes locally and fails on the runner (B-17).
    const doc = V22.slice(0, V22.indexOf("| `")).replace(/\r\n/g, "\n"); // the prose above the table
    const stated = [...doc.matchAll(/\b(\d{3})\b/g)].map((m) => Number(m[1]));
    const controls = ROWS.filter((r) => r.kind === "control").length;
    expect(stated.length).toBeGreaterThan(2); // a pattern that matched nothing would pass silently
    // every three-digit number in the prose is one of the table's own totals
    expect([...new Set(stated)].filter((n) => n !== ROWS.length && n !== controls).sort()).toEqual([]);
    expect(doc).toContain(`**${ROWS.length} testIDs, across ${new Set(ROWS.map((r) => r.row)).size} rows.**`);
    expect(doc).toContain(`${controls} of\n  the ${ROWS.length}.`);
  });

  it("every id it names is in the shipped source", () => {
    const missing = ROWS.filter((r) => !SOURCE.includes(`testID={\`${r.id}\`}`) && !SOURCE.includes(`testID="${r.id}"`));
    expect(missing.map((r) => `${r.id} (${r.row})`)).toEqual([]);
  });

  it("every id it names is in the file it says it is in", () => {
    const wrong = ROWS.filter((r) => {
      const files = r.where.split(",").map((f) => f.trim().replace(/`/g, ""));
      return !files.some((f) => {
        const src = readFileSync(join(APP, f), "utf8");
        return src.includes(`testID={\`${r.id}\`}`) || src.includes(`testID="${r.id}"`);
      });
    });
    expect(wrong.map((r) => `${r.id} → ${r.where}`)).toEqual([]);
  });

  it("the kind column is right in BOTH directions against CONTROLS_v2.md", () => {
    const wrong = ROWS.filter((r) => DOCUMENTED.some((d) => compatible(r.id, d)) !== (r.kind === "control"));
    expect(wrong.map((r) => `${r.id} is marked ${r.kind}`)).toEqual([]);
  });

  it("every row it names is a real V2.2 row in BUILD_PLAN_v22.md §4", () => {
    const named = [...new Set(ROWS.map((r) => r.row))];
    // `★` because §4 marks the rows that carry a full board and a ux round,
    // and the mark is part of the cell rather than of the row's name
    const missing = named.filter((row) => !new RegExp(`^\\|\\s*${row.replace(/[-]/g, "\\-")}\\s*(?:★\\s*)?\\|`, "m").test(PLAN));
    expect(missing).toEqual([]);
  });

  it("no id is filed under two rows — an id has one origin", () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const r of ROWS) {
      const first = seen.get(r.id);
      if (first != null && first !== r.row) twice.push(`${r.id}: ${first} and ${r.row}`);
      else seen.set(r.id, r.row);
    }
    expect(twice).toEqual([]);
  });
});
