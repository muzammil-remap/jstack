/**
 * CT-01/CT-02/CT-03 — the contract layer's own process gates.
 *
 * CT-01: every `TODO(BACKEND: §4.n)` marker in the app names a real
 * CONTRACT_v2.md subsection heading, and `evidence/todo-backend-grep.txt`
 * equals a fresh `tools/gen-backend-grep.mjs` scan.
 *
 * CT-02: every endpoint path named in CONTRACT_v2.md §6 (the CONTRACT_MAP
 * source table) resolves against at least one `CALL_ROUTES` entry.
 * `CONTRACT_MAP.md` itself is a row-19 artefact (a copy of §6 kept in sync
 * by its own test then) — this file checks against §6 directly so the
 * same guarantee holds from row 4 on, not just once row 19 lands.
 *
 * CT-03: nothing outside data/mock/, data/provider.ts and tests imports
 * the mock server (ADR-02's "one adapter" boundary) — SEC-15's grep half
 * (no send/pay/book/revoke verb on DataProvider) lives alongside it.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiAdapter, CALL_ROUTES, assertAllowedPath } from "@/data/ApiAdapter";
import { ROUTES } from "@/data/routes";
import { getAdapter } from "@/data/provider";

const ROOT = join(__dirname, "..", "..");

/** a markdown row's cells, splitting only on pipes OUTSIDE a code span */
function topLevelCells(row: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (const ch of row.replace(/^\|/, "").replace(/\|$/, "")) {
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

function allSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".expo", "e2e", "tests", "tools", "evidence"].includes(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...allSourceFiles(p));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

describe("CT-01 TODO(BACKEND: §4.n) markers", () => {
  // ALL THREE contracts. V2.1 added §4.10..§4.13 in `CONTRACT_v21.md` and
  // V2.2 adds §4.14.. in `CONTRACT_v22.md`, so a marker on one of those
  // endpoints names a subsection that exists — just not in the file this
  // check used to read. Reading two of three sources of truth made every
  // correct V2.2 marker look invented, exactly as reading one of two did to
  // V2.1's (row O-1, then L-1).
  const contract = ["history/v2/CONTRACT_v2.md", "history/v21/CONTRACT_v21.md", "history/v22/CONTRACT_v22.md"].map((f) => readFileSync(join(ROOT, "..", f), "utf8")).join("\n");
  const subsections = new Set([...contract.matchAll(/^#{2,3} §(\d+\.\d+)/gm)].map((m) => m[1]));

  it("every marker in source names a subsection that exists in one of the contracts", () => {
    const missing: string[] = [];
    for (const file of allSourceFiles(ROOT)) {
      const text = readFileSync(file, "utf8");
      // B-34: matches the generator's own pattern, including the trailing
      // `, A-NN)`-annotated markers (mock-only undo endpoints) it used to miss.
      for (const m of text.matchAll(/TODO\(BACKEND: §(\d+(?:\.\d+)?)(?:,[^)]+)?\)/g)) {
        if (!subsections.has(m[1])) missing.push(`${file}: §${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  /**
   * A4-08 / A4R2-01: CT-01 above asks only that a marker name a section that
   * EXISTS. Both halves of the real property were unguarded.
   *
   * Half one: three settings routes were marked §4.23 (Capture route and
   * share-in, which declares no API endpoint at all) while §4.22 spells all
   * three out. Half two, which the first version of this case skipped by
   * construction: fourteen routes named a V2 base section while a V2.2
   * section declared them, so §4.18, §4.20 and §4.21 carried NO markers while
   * `CONTRACT_MAP.md` — "the developer implementing the backend should start
   * here" — sends readers to exactly those three.
   *
   * The rule is: a route's marker must name SOME section that DECLARES it,
   * across all three contracts. Some endpoints are legitimately declared in
   * more than one — §4.20 declares `POST /tasks { …, goalId }` for creating
   * from a goal card, and that does not take the endpoint away from §4.5 — so
   * demanding one particular section would be wrong. Demanding that the marker
   * point at one of the sections that actually declares it is the property the
   * map promises.
   *
   * DECLARES means a row of a section's own "Method and path" table, first
   * cell only. Prose cross-references do not count and must not: §4.22
   * explains the rule card by naming `POST /actions/{id}`, which is §4.3's
   * endpoint and stays §4.3's. Reading whole section bodies made that a false
   * positive on the way here.
   */
  it("A4-08 / A4R2-01: every marker names a section that declares its path", () => {
    const declaredIn = new Map<string, Set<string>>();
    let tableRows = 0;
    for (const file of ["history/v2/CONTRACT_v2.md", "history/v21/CONTRACT_v21.md", "history/v22/CONTRACT_v22.md"]) {
      const src = readFileSync(join(ROOT, "..", file), "utf8").replace(/\r\n/g, "\n");
      const headings = [...src.matchAll(/^#{2,3} §(4\.\d+)[^\n]*\n/gm)];
      headings.forEach((h, i) => {
        const from = h.index! + h[0].length;
        // A4R2-01: the LAST section used to run to end-of-file, so §4.23's body
        // swallowed §5, §6 and §7 — and §6's map table names every path in the
        // contract, which made this check pass for anything marked §4.23 and a
        // replant of its own five markers report three.
        const nextSub = i + 1 < headings.length ? headings[i + 1].index! : src.length;
        const nextPart = src.indexOf("\n## ", from);
        const body = src.slice(from, Math.min(nextSub, nextPart === -1 ? src.length : nextPart));
        for (const line of body.split("\n")) {
          if (!line.trim().startsWith("| ")) continue;
          // A4R3-01, the second half: a markdown row cannot be split on "|"
          // when a cell holds one INSIDE a code span, and several do —
          // `GET /actions?state=open|history&focus=&q=` is §4.3's own
          // declaration. Splitting naively truncated that cell mid-backtick,
          // the regex then matched nothing, and §4.3 looked as though it did
          // not declare `/actions` while §4.8's plainer mention did. The
          // marker was right and the parser was wrong, which is the worse way
          // round: it would have had me "fix" a correct marker.
          const firstCell = topLevelCells(line.trim())[0] ?? "";
          // Three shapes, because the contracts use three and this guard has
          // been widened in three consecutive audit rounds without closing:
          //
          //   GET `/x`                  the common one
          //   GET/PUT `/x`              one path, two methods (A4R4-05)
          //   GET `/x` · PATCH · DELETE a path, then bare methods (A4R4-05)
          //
          // A4R3-01 fixed a fourth: `[^`?]*` excluded every declaration with a
          // query string, hiding 37 of 135 routes. The query is not part of the
          // path the routes table declares, so it is stripped.
          //
          // A bare method carries the LAST path seen in the same cell, which is
          // what the continuation rows mean. Nine routes were declared in a row
          // this could not read; none was mis-marked, but a mis-marking of any
          // of them would have passed silently — the blind spot is the finding.
          let lastPath: string | null = null;
          for (const m of firstCell.matchAll(/\b([A-Z]{3,6}(?:\/[A-Z]{3,6})*)(?:\s+`(\/[^`]*)`)?/g)) {
            const methods = m[1].split("/");
            if (m[2] != null) lastPath = m[2].split("?")[0];
            if (lastPath == null) continue;
            for (const method of methods) {
              tableRows += 1;
              const key = `${method} ${lastPath}`;
              if (!declaredIn.has(key)) declaredIn.set(key, new Set());
              declaredIn.get(key)!.add(h[1]);
            }
          }
        }
      });
    }
    // a parser that read nothing, or only one contract, would pass silently
    expect(tableRows).toBeGreaterThan(60);
    expect(new Set([...declaredIn.values()].flatMap((s) => [...s])).size).toBeGreaterThan(15);

    // A4R4-05: and it must actually COVER the table. Three rounds running this
    // guard was widened, passed, and still could not see a third of the routes
    // — a guard that verifies 120 of 135 is silent about the other fifteen, and
    // silence is what every finding in this audit has been made of. Six routes
    // are declared in no contract table at all (CT-01's business, and the six
    // are named so a seventh is a red test rather than a shrug).
    // Two kinds of legitimate absence, and both are named rather than tolerated.
    //
    // By construction: a marker carrying an A-row annotation (`§4.3, A-31`) is
    // a MOCK-ONLY endpoint added by a build row, which the contract does not
    // declare and should not — CT-01's own comment above says the same of the
    // same three. Exempting them by the annotation means a new one inherits the
    // exemption honestly, and a mock-only endpoint that loses its annotation
    // becomes a red test.
    //
    // By name, with a reason each:
    const DECLARED_NOWHERE: Record<string, string> = {
      webauthnCeremony:
        "not a REST endpoint: the passkey ceremony the browser runs, declared in §4.1's prose rather than as a method and path",
      putLabels:
        "`PUT /{noun}/{id}/labels` is declared with a NOUN PLACEHOLDER the routes table resolves per noun; §4.5 describes it in prose beside the nouns it applies to",
      putNotificationGroup:
        "§4.9 declares the notifications settings as one `GET/PUT /settings/notifications` pair; the per-group PUT is V2.1's addition, described in §4.9's prose",
    };
    const unseen = ROUTES.filter((r) => !declaredIn.has(`${r.method} ${r.path}`))
      .filter((r) => !r.marker.includes(",")) // mock-only, annotated with its A-row
      .map((r) => r.name);
    expect(unseen.filter((n) => DECLARED_NOWHERE[n] == null)).toEqual([]);
    // and the exemptions stay honest: one that stops being needed is a red test
    expect(Object.keys(DECLARED_NOWHERE).filter((n) => !unseen.some((u) => u === n))).toEqual([]);

    const wrong: string[] = [];
    for (const route of ROUTES) {
      const owners = declaredIn.get(`${route.method} ${route.path}`);
      if (owners == null) continue; // declared in no table — CT-01 covers existence
      const marker = route.marker.replace("§", "");
      if (!owners.has(marker)) {
        wrong.push(`${route.name} (${route.method} ${route.path}) marked ${route.marker}, declared in ${[...owners].map((o) => `§${o}`).join(", ")}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("evidence/todo-backend-grep.txt equals a fresh scan", () => {
    // B-34: this used to regenerate the file in place and then read back
    // what it had just written — a tautology that could never go red.
    // Copy the committed content out first, THEN regenerate, and diff.
    const scratch = mkdtempSync(join(tmpdir(), "jstack-backend-grep-"));
    try {
      const before = readFileSync(join(ROOT, "evidence", "todo-backend-grep.txt"), "utf8");
      execFileSync(process.execPath, [join(ROOT, "tools", "gen-backend-grep.mjs")]);
      const after = readFileSync(join(ROOT, "evidence", "todo-backend-grep.txt"), "utf8");
      expect(after.split("\n").filter(Boolean).length).toBeGreaterThan(0);
      expect(after).toBe(before);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe("CT-02 every CONTRACT_v2.md §6 endpoint has a CALL_ROUTES entry", () => {
  const contract = readFileSync(join(ROOT, "..", "history", "v2", "CONTRACT_v2.md"), "utf8");
  const section6 = contract.slice(contract.indexOf("## §6."), contract.indexOf("## §7."));
  // WS /voice has no REST/CALL_ROUTES equivalent by design (ADR-14 defers
  // the two-way voice socket; capabilities.liveVoice gates it off).
  const NOT_A_CALL_ROUTE = new Set(["/voice"]);
  const paths = [...new Set([...section6.matchAll(/`(\/[^`]*)`/g)].map((m) => m[1]))].filter((p) => !NOT_A_CALL_ROUTE.has(p));

  const routeRegexes = Object.values(CALL_ROUTES).map(([, re]) => re);

  /**
   * §6's table cells sometimes shorten a whole family to one wildcard
   * (`/tasks*`, `/habits*`) and sometimes list a bare suffix that only
   * makes sense read alongside the row's other cells (`/report`, `/accept`
   * under the `/tasks/{id}/delegate` row really mean `/tasks/{id}/report`
   * etc — CONTRACT_v2.md's own shorthand, not something to fix here). Both
   * cases are checked the same loose way: does some CALL_ROUTES pattern's
   * source contain this path (or its de-starred prefix) as a substring?
   */
  function candidateMatches(path: string): boolean {
    const concrete = path.replace(/\{[^}]+\}/g, "x");
    if (routeRegexes.some((re) => re.test(concrete))) return true;
    const bare = path.replace(/\*$/, "").replace(/^\//, "");
    if (bare === "") return false;
    return routeRegexes.some((re) => re.source.includes(bare.replace(/\//g, "\\/")));
  }

  it("found endpoint paths in §6 to check", () => {
    expect(paths.length).toBeGreaterThan(20);
  });

  it.each(paths)("%s matches at least one CALL_ROUTES pattern", (path) => {
    expect(candidateMatches(path)).toBe(true);
  });

  it("CONTRACT_MAP.md's table is identical to CONTRACT_v2.md §6's", () => {
    // git's line-ending normalisation (CRLF on this repo's committed .md
    // files) can differ from whatever a freshly-written file has on disk
    // — normalise both sides so this checks content, not line endings.
    const contractMap = readFileSync(join(ROOT, "..", "CONTRACT_MAP.md"), "utf8").replace(/\r\n/g, "\n");
    const tableLines = section6
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((l) => l.startsWith("|"))
      .join("\n");
    expect(tableLines.length).toBeGreaterThan(0);
    expect(contractMap).toContain(tableLines);
  });
});

describe("CT-03 the mock server import boundary", () => {
  it("nothing outside data/mock/, data/provider.ts, data/transport/mock.ts, lib/testHook.ts and tests imports data/mock", () => {
    const violations: string[] = [];
    for (const file of allSourceFiles(ROOT)) {
      const rel = file.slice(ROOT.length + 1).replaceAll("\\", "/");
      // data/transport/mock.ts's entire job is routing into data/mock/server.ts
      // (ADR-02); lib/testHook.ts (row 5) reads data/mock/db.ts directly for
      // deep test introspection — it never ships (lib/testBuild.ts swaps it
      // for a no-op in production, SEC-01), so it is the one intentional
      // exception to "only through the adapter".
      if (rel.startsWith("data/mock/") || rel === "data/provider.ts" || rel === "data/transport/mock.ts" || rel === "lib/testHook.ts") continue;
      const text = readFileSync(file, "utf8");
      if (/from ["']@\/data\/mock\//.test(text) || /from ["']\.\.?\/.*data\/mock\//.test(text)) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });

  it("getAdapter() returns the one ApiAdapter", () => {
    expect(getAdapter()).toBeInstanceOf(ApiAdapter);
  });
});

/**
 * SEC-15 has TWO clauses: "No adapter method, route pattern, handler or
 * fixture verb named send, pay, book or revoke" AND "the runtime guard throws
 * on such a path". AUDIT_v2.md A-03 found the second clause unimplemented and
 * the first checking less than its own title said — `CALL_ROUTES` was imported
 * and never read, and handlers and fixtures were never scanned at all. Both
 * halves are covered here now, and `assertAllowedPath` is the guard itself.
 */
describe("SEC-15 grep half — no send/pay/book/revoke verb anywhere it could act", () => {
  // revokeDevice / POST /devices/{id}/revoke is the ONE exception, and it is a
  // security CONTROL: LK-06, SE-08 and CONTRACT_v2.md §6 all require the owner
  // to be able to revoke a device. It is not the forbidden "revoke a decision"
  // verb. Recorded here rather than only in a code comment (A-03).
  const ALLOWED = /revokeDevice|\/devices\/[^/]+\/revoke/;
  // AUDIT_v2.md AA-02: this was written as a template-literal `\b` that got
  // eaten into a literal 0x08 BACKSPACE byte, so the regex could never match
  // and both greps below passed unconditionally — the auditor proved it by
  // planting a `/tasks/{id}/send` route and a `/tasks/{id}/send` handler and
  // watching them sail through. Written as a character class instead: no
  // escape to lose, and `tests/unit/security.test.ts` now refuses any control
  // character in source so a third one cannot hide.
  const VERB = /(^|[^a-z])(send|pay|book|revoke)([^a-z]|$)/i;

  it("no DataProvider method name is a forbidden verb", () => {
    const src = readFileSync(join(ROOT, "data", "DataProvider.ts"), "utf8");
    const methodNames = [...src.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]);
    expect(methodNames.filter((n) => /^(send|pay|book)[A-Z]/.test(n) || /revoke(?!Device)/.test(n))).toEqual([]);
  });

  it("no CALL_ROUTES route PATTERN is a forbidden verb — the half the title claimed and never ran", () => {
    const offenders = Object.entries(CALL_ROUTES)
      .map(([name, [verb, path]]) => `${name} ${verb} ${path.source}`)
      .filter((row) => VERB.test(row) && !ALLOWED.test(row));
    expect(offenders).toEqual([]);
  });

  it("no mock handler declares a route with a forbidden verb", () => {
    const dir = join(ROOT, "data", "mock", "handlers");
    const offenders: string[] = [];
    for (const f of readdirSync(dir)) {
      for (const m of readFileSync(join(dir, f), "utf8").matchAll(/["'`](\/[\w{}/$.-]*)["'`]/g)) {
        if (VERB.test(m[1]) && !ALLOWED.test(m[1])) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * A4R2-11: the scan above reads `data/mock/handlers/*` and its pattern
   * requires the string to START with `/`. The mock's rig table is neither —
   * it lives in `data/mock/server.ts` and its keys are `"POST /__test__/…"`,
   * method and path in one string. So the one table in the mock that mounts
   * routes the app itself never declares was outside the guard entirely.
   *
   * No verb is reachable there today (`__test__/revoke` is device revocation,
   * the sanctioned use). The blind spot IS the finding: a rig route is exactly
   * where a send/pay/book would be added "just for a test" and then ship.
   */
  it("A4R2-11: nor does the mock's rig-route table, which the scan above cannot see", () => {
    const src = readFileSync(join(ROOT, "data", "mock", "server.ts"), "utf8");
    // BOTH rig tables. A4R2-11 closed `TEST_ROUTES`, whose keys are
    // `"POST /__test__/…"`, and walked straight past `TEST_PATTERNS` twenty
    // lines below it, whose rows are `["GET", pathToPattern("/__test__/…")]`
    // — method and path in separate cells, so the first pattern cannot see
    // them. A planted `pathToPattern("/__test__/send/{id}")` passed every
    // SEC-15 case (A4R3-03). Covering one table and not its sibling is the
    // same half-fix shape three rounds have now found in three other places.
    const keys = [
      ...[...src.matchAll(/["'`]([A-Z]+ \/[\w{}/$.-]*)["'`]/g)].map((m) => m[1]),
      ...[...src.matchAll(/\[\s*["'`]([A-Z]+)["'`]\s*,\s*pathToPattern\(\s*["'`](\/[\w{}/$.-]*)["'`]/g)].map((m) => `${m[1]} ${m[2]}`),
    ];
    expect(keys.length).toBeGreaterThan(4); // a pattern that read nothing would pass silently
    expect(keys.some((k) => k.includes("/__test__/"))).toBe(true); // and it really is the rig table
    expect(keys.some((k) => k.startsWith("GET /__test__/files/"))).toBe(true); // TEST_PATTERNS specifically

    // One allow-listed line, one reason: `POST /__test__/revoke` is the lever
    // that drives DEVICE revocation — the single sanctioned use of the word
    // (`/devices/{id}/revoke` is allow-listed above for the same reason), and
    // the rig route exists so that path can be tested at all. Nothing else in
    // the table may carry a verb.
    const RIG_ALLOWED = "POST /__test__/revoke";
    expect(keys).toContain(RIG_ALLOWED); // if the lever is renamed, re-read this exemption
    expect(keys.filter((k) => k !== RIG_ALLOWED).filter((k) => VERB.test(k) && !ALLOWED.test(k))).toEqual([]);
  });
});

describe("SEC-15 runtime guard — the clause that did not exist (A-03)", () => {
  it("throws on a path carrying a forbidden verb, before the transport is reached", () => {
    expect(() => assertAllowedPath("POST", "/actions/c1/send")).toThrow(/send/);
    expect(() => assertAllowedPath("POST", "/bills/b1/pay")).toThrow(/pay/);
    expect(() => assertAllowedPath("POST", "/calendar/book")).toThrow(/book/);
  });

  it("allows device revocation, the one sanctioned use of the word", () => {
    expect(() => assertAllowedPath("POST", "/devices/dev1/revoke")).not.toThrow();
  });

  it("allows every route the adapter actually declares", () => {
    for (const [verb, path] of Object.values(CALL_ROUTES)) {
      // turn the route's own RegExp source back into a representative path:
      // drop the anchors, unescape the slashes, and stand a literal in for
      // each id/segment matcher.
      // Stand a literal in for every id/segment matcher FIRST, while the
      // class still carries its escaped slash — unescaping first leaves
      // `[/]+` behind, which then reads as two empty segments and a `+`.
      const sample = path.source
        .replace(/\[\^\\?\/\]\+/g, "x")
        .replace(/\\d\+/g, "1")
        .replace(/\\w\+/g, "x")
        .replace(/\.\+/g, "x")
        .replace(/\\\//g, "/")
        .replace(/[\^$]/g, "");
      expect(() => assertAllowedPath(verb, sample)).not.toThrow();
    }
  });
});
