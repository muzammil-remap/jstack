/**
 * The one reader for `data/routes.ts` (W-1).
 *
 * S-1 made the route table the single source for the adapter, the mock
 * router, the backend-grep markers and the wiring map. It did not make the
 * READING of that table single: `gen-wiring.mjs` had its own regex and
 * `gen-openapi.mjs` was about to add a second. W-1 added two columns between
 * `handler` and `group`, and gen-wiring's regex — which required those two
 * fields to be adjacent — silently matched nothing and wrote a wiring map
 * with zero routes in it. The generated map did not complain; it was just
 * empty, and would have been committed that way.
 *
 * So there is one reader, here, and everything that needs rows imports it.
 *
 * It is line-based on purpose. A single regex over the whole array is the
 * other way this has gone wrong: `{ name: "…", [^}]* }` reads 58 of the 100
 * rows, because `/actions/{id}` closes the brace early. Every row is one
 * line, so a line is the unit.
 */
import { readFileSync } from "node:fs";

const ROW_START = '{ name: "';

export function readRoutes(src) {
  const rows = [];
  for (const line of src.split("\n")) {
    const text = line.trim();
    if (!text.startsWith(ROW_START)) continue;
    const field = (key) => text.match(new RegExp(`[{,] ${key}: "([^"]*)"`))?.[1];
    rows.push({
      name: field("name"),
      method: field("method"),
      path: field("path"),
      marker: field("marker"),
      handler: field("handler"),
      body: field("body") ?? null,
      // WPF-5: a flag, not a quoted value, so `field()` could never read it — and
      // `tools/gen-openapi.mjs`'s multipart branch never ran
      multipart: /[{,] multipart: true[, }]/.test(text),
      response: field("response"),
      group: field("group"),
    });
  }

  // Count the rows a second way and compare. A row the reader misses is the
  // failure none of these tools would notice on their own — the output is
  // simply smaller, and smaller looks like progress.
  const declared = src.split("\n").filter((l) => l.trim().startsWith(ROW_START)).length;
  if (rows.length !== declared) throw new Error(`read-routes: read ${rows.length} rows but data/routes.ts declares ${declared}`);
  if (rows.length === 0) throw new Error("read-routes: data/routes.ts has no rows — has the row format changed?");

  const incomplete = rows.filter((r) => !r.name || !r.method || !r.path || !r.handler || !r.response || !r.group);
  if (incomplete.length) {
    throw new Error(`read-routes: ${incomplete.length} row(s) missing a required column: ${incomplete.map((r) => r.name ?? "?").join(", ")}`);
  }
  return rows;
}

export function readRoutesFrom(path) {
  return readRoutes(readFileSync(path, "utf8"));
}
