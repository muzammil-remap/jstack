/**
 * The release gate on CODEMAP.md's companion lists (ADR-35 liveness layer 3;
 * Stage 4 A-0 review, R-01).
 *
 * Section 11 of the map is generated: three lists of what the codebase holds
 * that the hand-written judgement has not caught up with — bug rows section 6
 * has not distilled, guards section 4 does not name, file families section 5
 * has no recipe for. The map said "a release requires them empty" from the row
 * that created them, and for two stages nothing asked: `release.yml` had no
 * such step, and the board's own test asserted the first list was NON-empty.
 * A curation row then claimed all three were empty while fifteen entries sat
 * under the first heading, and every gate stayed green.
 *
 * This is the step. It reads the generated block, counts the `- ` entries
 * under each heading, and refuses — naming the list and its first entries —
 * when any is non-empty. Exit 0 and silent when all three read "None. ✅".
 *
 * A path argument checks a COPY, which is how `tests/unit/codemap.test.ts`
 * proves the refusal on a planted entry without touching the real map.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAP = process.argv[2] ? process.argv[2] : join(root, "CODEMAP.md");

const HEADINGS = ["New since section 6 was curated", "Guards section 4 does not name", "File families with no recipe in section 5"];

/** `{ heading, entries[] }` for each companion list in the section-11 block. */
function companionEntries(md) {
  const start = md.indexOf("<!-- generated:start section=11");
  if (start === -1) throw new Error("CODEMAP.md has no generated section 11 — run `pnpm codemap` first");
  const end = md.indexOf("<!-- generated:end -->", start);
  const block = md.slice(start, end === -1 ? undefined : end);
  return HEADINGS.map((heading) => {
    const at = block.indexOf(`### ${heading}`);
    if (at === -1) throw new Error(`CODEMAP.md section 11 has no "${heading}" list`);
    const rest = block.slice(at + heading.length + 4);
    const next = rest.search(/\n### /);
    const body = next === -1 ? rest : rest.slice(0, next);
    return { heading, entries: [...body.matchAll(/^- (.*)$/gm)].map((m) => m[1].trim()) };
  });
}

if (process.argv[1] && process.argv[1].endsWith("companions-check.mjs")) {
  const lists = companionEntries(readFileSync(MAP, "utf8"));
  const full = lists.filter((l) => l.entries.length > 0);
  if (full.length === 0) process.exit(0);
  console.error("CODEMAP.md's companion lists are not empty — the hand-written sections have not caught up with the code:");
  for (const { heading, entries } of full) {
    console.error(`  ${heading}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`);
    for (const e of entries.slice(0, 5)) console.error(`    - ${e}`);
    if (entries.length > 5) console.error(`    … and ${entries.length - 5} more`);
  }
  console.error("\nA release requires all three empty (CODEMAP.md §11): distil, name or write the recipe, then `pnpm codemap`.");
  process.exitCode = 1;
}
