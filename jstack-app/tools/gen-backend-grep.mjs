/**
 * Canonical TODO(BACKEND: §4.n) marker list generator (AUDIT D-10/D-15; row
 * 4 of the V2 build moved markers from bare §n to CONTRACT_v2.md's §4.n
 * subsections). Emits `relative/path:line:trimmed-line-text`, sorted — the
 * exact format tests/unit/contract.test.ts compares content-exactly
 * against a live scan.
 *
 * Run: node tools/gen-backend-grep.mjs   (rewrites evidence/todo-backend-grep.txt)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

function allSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".expo", "e2e", "tests", "tools", "evidence"].includes(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...allSourceFiles(p));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

const rows = [];
for (const f of allSourceFiles(APP_ROOT)) {
  const rel = f.slice(APP_ROOT.length + 1).replaceAll("\\", "/");
  readFileSync(f, "utf8")
    .split("\n")
    .forEach((line, i) => {
      // B-34: some markers carry a trailing annotation before the close
      // paren (`TODO(BACKEND: §4.3, A-31)` — a mock-only endpoint added for
      // an undo flow, not itself in CONTRACT_v2.md) — the bare `§N.n)` form
      // silently dropped these three real markers from the count.
      if (/TODO\(BACKEND: §\d+(\.\d+)?(,[^)]+)?\)/.test(line)) rows.push(`${rel}:${i + 1}:${line.replace(/\r$/, "").trim()}`);
    });
}
rows.sort();
writeFileSync(join(APP_ROOT, "evidence", "todo-backend-grep.txt"), rows.join("\n") + "\n");
console.log(`${rows.length} markers written to evidence/todo-backend-grep.txt`);
