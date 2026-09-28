/**
 * SM-01 — `data/routes.ts` is the one table `CALL_ROUTES`, the mock server's
 * router, `gen-backend-grep` and (Q1) `gen-wiring` all read (S-1, ADR-33).
 * Every row has a method and a real handler; no duplicates; a row's own
 * `pattern` (derived from `path`) matches a concrete example of that path.
 * The DataProvider-completeness half of SM-01 (every method HAS a row) is
 * a compile-time check in `data/routes.ts` itself (`NamesCovered`) — a
 * missing row is a `pnpm check` error, not a `pnpm test` one.
 */
import { HANDLER_MODULES } from "@/data/mock/server";
import { buildPath, CALL_ROUTES, pathToPattern, ROUTES, routeByName } from "@/data/routes";

/** The server's OWN map, not a copy of it. This file used to list the ten
 *  handler modules itself, so the first module added after it was written
 *  (L-1's `parameters`) was simply absent and its three routes were checked
 *  against nothing. A guard with its own copy of the thing it guards is a
 *  guard that stops guarding quietly (rule 16). */
const MODULES: Record<string, Record<string, unknown>> = HANDLER_MODULES;
const VERBS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

describe("routes.ts — the one table (SM-01)", () => {
  it("every row has a valid HTTP verb", () => {
    for (const r of ROUTES) expect(VERBS.has(r.method)).toBe(true);
  });

  it("every row's path starts with / and every {param} segment is a whole segment", () => {
    for (const r of ROUTES) {
      expect(r.path.startsWith("/")).toBe(true);
      for (const seg of r.path.split("/")) {
        if (seg.includes("{")) expect(seg).toMatch(/^\{[^}]+\}$/);
      }
    }
  });

  it("no two rows share a (method, path) pair", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of ROUTES) {
      const key = `${r.method} ${r.path}`;
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });

  it("no two rows share a name (DataProvider method)", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of ROUTES) {
      if (seen.has(r.name)) dupes.push(r.name);
      seen.add(r.name);
    }
    expect(dupes).toEqual([]);
  });

  it("every row's handler resolves to a real exported function", () => {
    const unresolved: string[] = [];
    for (const r of ROUTES) {
      const [moduleName, fnName] = r.handler.split(".");
      const fn = MODULES[moduleName]?.[fnName];
      if (typeof fn !== "function") unresolved.push(`${r.name}: "${r.handler}"`);
    }
    expect(unresolved).toEqual([]);
  });

  it("every row's pattern matches a concrete example of its own template", () => {
    const mismatches: string[] = [];
    for (const r of ROUTES) {
      const paramCount = (r.path.match(/\{[^}]+\}/g) ?? []).length;
      const example = buildPath(r.path, Array.from({ length: paramCount }, (_, i) => `x${i}`));
      if (!pathToPattern(r.path).test(example)) mismatches.push(`${r.name}: ${r.path} → ${example}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("a literal path segment is escaped, not treated as a regex character class", () => {
    // quiet-hours has a literal hyphen; pathToPattern must not let "-" (or
    // any other regex-special character a future path might carry) change
    // what the pattern matches.
    const pattern = pathToPattern("/settings/quiet-hours");
    expect(pattern.test("/settings/quiet-hours")).toBe(true);
    expect(pattern.test("/settings/quietxhours")).toBe(false);
  });

  it("routeByName finds every DataProvider name ROUTES declares, and throws on an unknown one", () => {
    for (const r of ROUTES) expect(routeByName(r.name).name).toBe(r.name);
    expect(() => routeByName("notAMethod" as never)).toThrow();
  });

  it("CALL_ROUTES has exactly one entry per row, verb and pattern matching", () => {
    expect(Object.keys(CALL_ROUTES).length).toBe(ROUTES.length);
    for (const r of ROUTES) {
      const [verb, pattern] = CALL_ROUTES[r.name];
      expect(verb).toBe(r.method);
      expect(pattern.source).toBe(pathToPattern(r.path).source);
    }
  });

  /**
   * The array-order hazard: a literal path and a `{param}` path at the same
   * method and segment depth can both match one concrete URL, and the
   * router (data/mock/server.ts) returns the FIRST match — so a literal
   * route must be listed before any `{param}` route it could be mistaken
   * for. `/layout/app` vs `/layout/{tab}` and `/tasks/waiting`,
   * `/tasks/gantt` vs `/tasks/{id}` are the two real cases (S-1); this
   * scans for the general shape so a future route doesn't reintroduce it
   * silently.
   */
  it("a literal path never follows a same-method, same-depth {param} path that would swallow it", () => {
    const bySegCountAndMethod = new Map<string, { path: string; hasParam: boolean; index: number }[]>();
    ROUTES.forEach((r, index) => {
      const segs = r.path.split("/").filter(Boolean);
      const key = `${r.method} ${segs.length}`;
      const list = bySegCountAndMethod.get(key) ?? [];
      list.push({ path: r.path, hasParam: segs.some((s) => s.startsWith("{")), index });
      bySegCountAndMethod.set(key, list);
    });
    const offenders: string[] = [];
    for (const rows of bySegCountAndMethod.values()) {
      const params = rows.filter((r) => r.hasParam);
      const literals = rows.filter((r) => !r.hasParam);
      for (const p of params) {
        for (const l of literals) {
          const pRegex = pathToPattern(p.path);
          if (pRegex.test(l.path) && p.index < l.index) offenders.push(`${p.path} (row ${p.index}) precedes ${l.path} (row ${l.index})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("R-07 · the push routes are §4.13's, both of them", () => {
  it("DELETE /push/subscribe/{device} has a row, a handler and the §4.13 marker", () => {
    const row = ROUTES.find((r) => r.name === "deletePushSubscription");
    expect(row).toMatchObject({ method: "DELETE", path: "/push/subscribe/{device}", marker: "§4.13", handler: "session.deletePushSubscription", response: "NoContent" });
    expect(ROUTES.find((r) => r.name === "postPushSubscribe")).toMatchObject({ marker: "§4.13" });
  });
});
