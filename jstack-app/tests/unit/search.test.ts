/**
 * GS-01, GS-06, GS-07 — the index, the scoping and the cap.
 *
 * Driven through the ROUTE (`handle`), not by calling `search()`, because the
 * claim under GS-01 is about what the server RETURNS: a record outside the
 * user's silos never appearing is a statement about the response, and a test
 * that called the index directly would be asserting the same function twice.
 *
 * The two guards that matter most here are negative ones — a record that must
 * NOT come back — so each is paired with a positive case proving the query
 * would otherwise have found it. A negative assertion with no partner passes
 * just as well against a search that returns nothing at all.
 */
import { fieldRuns } from "@/components/chrome/FindRow";
import { findDialogName } from "@/layout/find";
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { DIALOGS } from "@/layout/dialogs";
import type { SearchKind, SearchResponse } from "@/data/types";

async function find(query: Record<string, string>): Promise<SearchResponse> {
  const res = await handle({ method: "GET", path: "/search", query });
  expect(res.status).toBe(200);
  return res.json as SearchResponse;
}

const kinds = (r: SearchResponse) => r.groups.map((g) => g.kind);
const titles = (r: SearchResponse) => r.groups.flatMap((g) => g.items.map((i) => i.title));
const total = (r: SearchResponse) => r.groups.reduce((n, g) => n + g.items.length, 0);

beforeEach(() => {
  db.reset();
  db.asUser("josh");
});

describe("GS-01 · the index", () => {
  it("finds a capture and says which kind it is, with the ranges it matched", async () => {
    const r = await find({ q: "bali" });
    expect(r.groups.length).toBeGreaterThan(0);
    expect(titles(r).some((t) => /bali/i.test(t))).toBe(true);
    for (const g of r.groups) {
      for (const item of g.items) {
        // every range is read against the field it NAMES — a title range
        // applied to the snippet lights up the wrong characters
        for (const m of item.matches) {
          const text = m.field === "title" ? item.title : item.snippet;
          expect(text.slice(m.start, m.end).toLowerCase()).toBe("bali");
        }
      }
    }
  });

  it("a token under three characters is not a query — 'to' would match everything", async () => {
    expect(await find({ q: "to" })).toEqual({ q: "to", groups: [], truncated: false });
    expect((await find({ q: "" })).groups).toEqual([]);
  });

  it("prefix, not substring: 'pass' finds 'passport' and 'port' does not", async () => {
    expect(titles(await find({ q: "pass" })).some((t) => /passport/i.test(t))).toBe(true);
    expect(titles(await find({ q: "port" })).some((t) => /passport/i.test(t))).toBe(false);
  });

  it("groups come back in §7's order, and the app does not re-sort", async () => {
    const order = ["task", "brain", "reply", "file", "decision", "issue", "learning", "goal", "habit", "person", "rule", "subtask"];
    const got = kinds(await find({ q: "bali" }));
    expect(got).toEqual([...got].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it("a record outside the user's silos never comes back — and the query would have found it", async () => {
    // as Josh: the work-silo record is his and IS returned
    const asJosh = titles(await find({ q: "moz" }));
    expect(asJosh.length).toBeGreaterThan(0);

    // as Joce, whose silos do not include `work` (data/mock/db.ts USERS)
    db.asUser("joce");
    const asJoce = titles(await find({ q: "moz" }));
    for (const t of asJoce) expect(asJosh).toContain(t);
    expect(asJoce.length).toBeLessThan(asJosh.length);
  });

  it("the active focus scopes the results, by SILO and not by a focus string", async () => {
    const everything = total(await find({ q: "bali" }));
    const family = await find({ q: "bali", focus: "family" });
    expect(total(family)).toBeLessThanOrEqual(everything);
    for (const g of family.groups) {
      for (const item of g.items) {
        if (item.silo !== "") expect(["family1", "family2"]).toContain(item.silo);
      }
    }
  });
});

describe("GS-06 · the cap", () => {
  it("caps the TOTAL, keeps each group's own count, and says it is truncated", async () => {
    const r = await find({ q: "bali", limit: "1" });
    expect(total(r)).toBe(1);
    expect(r.truncated).toBe(true);
    // the group still reports how many there were — "showing 1 of 4", not "1"
    expect(r.groups[0].count).toBeGreaterThanOrEqual(1);

    const uncapped = await find({ q: "bali" });
    expect(uncapped.truncated).toBe(false);
    expect(total(uncapped)).toBeGreaterThan(1);
  });

  it("the default limit is the PARAMETER, read from the server's own table", async () => {
    const s = db.get();
    s.parameters = s.parameters.map((p) => (p.key === "search.maxResults" ? { ...p, value: 1 } : p));
    expect(total(await find({ q: "bali" }))).toBe(1);
  });
});

describe("GS-07 · the sensitivity filter", () => {
  it("'Not sensitive' returns no sensitive row, and 'Sensitive only' returns nothing else", async () => {
    const all = await find({ q: "passport" });
    const sensitive = all.groups.flatMap((g) => g.items).filter((i) => i.sensitivity === "sensitive");
    // the partner assertion: there IS one to exclude, so the exclusion means something
    expect(sensitive.length).toBeGreaterThan(0);

    const plain = await find({ q: "passport", sensitivity: "normal" });
    for (const g of plain.groups) for (const i of g.items) expect(i.sensitivity).not.toBe("sensitive");

    const only = await find({ q: "passport", sensitivity: "sens" });
    for (const g of only.groups) for (const i of g.items) expect(i.sensitivity).toBe("sensitive");
    expect(total(only)).toBe(sensitive.length);
  });
});

describe("GS-04 · a result names its tab as well as its dialog", () => {
  it("every returned ref carries a tab, a dialog and the record's own id", async () => {
    const r = await find({ q: "bali" });
    for (const g of r.groups) {
      for (const item of g.items) {
        expect(["today", "tasks", "brain", "life", "agents"]).toContain(item.ref.tab);
        expect(item.ref.dialog).not.toBe("");
        expect(item.ref.id).toBe(item.id);
      }
    }
  });
});

describe("GS-02/GS-03 · which Find opens", () => {
  it("a phone gets the screen and a desktop gets the modal, decided in one place", () => {
    expect(findDialogName(true)).toBe("find-phone");
    expect(findDialogName(false)).toBe("find");
  });
});

describe("the highlight is the server's ranges, rendered", () => {
  it("splits a field's text into plain and matched runs", () => {
    expect(fieldRuns("snippet", "Bali trip · open", [{ field: "snippet", start: 0, end: 4 }])).toEqual([
      { text: "Bali", hit: true },
      { text: " trip · open", hit: false },
    ]);
  });

  it("a range for ANOTHER field is ignored rather than applied to this one", () => {
    // title and snippet ranges share one array and are two different
    // coordinate systems; reading them as one string lights up characters the
    // server never matched
    const matches = [
      { field: "title", start: 0, end: 5 },
      { field: "snippet", start: 0, end: 5 },
    ];
    expect(fieldRuns("title", "Steve about Bali", matches)).toEqual([
      { text: "Steve", hit: true },
      { text: " about Bali", hit: false },
    ]);
    expect(fieldRuns("snippet", "voice · Telegram", matches)).toEqual([
      { text: "voice", hit: true },
      { text: " · Telegram", hit: false },
    ]);
  });

  it("no matches is one plain run, so the caller never branches", () => {
    expect(fieldRuns("snippet", "nothing lit", [])).toEqual([{ text: "nothing lit", hit: false }]);
  });

  it("a range past the end of the text is DROPPED, not sliced", () => {
    // a stale or overlapping range would otherwise render a highlight over
    // text it does not describe, which is worse than no highlight at all
    expect(fieldRuns("snippet", "short", [{ field: "snippet", start: 2, end: 99 }])).toEqual([{ text: "short", hit: false }]);
  });
});

describe("GS-01 " + "·" + " a match in the TITLE is reported as one", () => {
  it("a word that appears only in titles still comes back with ranges", async () => {
    const r = await find({ q: "steve" });
    const items = r.groups.flatMap((g) => g.items);
    expect(items.length).toBeGreaterThan(0);
    // the partner assertion: at least one row has "steve" ONLY in its title,
    // so a snippet-only index would report nothing at all for it — which is
    // exactly what the device pass found, six matching rows and no highlight
    const titleOnly = items.filter((i) => /steve/i.test(i.title) && !/steve/i.test(i.snippet));
    expect(titleOnly.length).toBeGreaterThan(0);
    for (const i of titleOnly) expect(i.matches.some((m) => m.field === "title")).toBe(true);
  });
});

/**
 * P-1 / F-12 (Stage 5d) — `REF` in `data/mock/search.ts` is a hand list that
 * mirrors `layout/dialogs.tsx`, and hard rule 16 says a hand list is proven
 * against its registry. ST-1 renamed `rule-edit` to `rules-edit` and the
 * search table kept the old name, so a rule found by Find navigated to Brain
 * and opened nothing — the class ADR-52 exists to remove, in the one surface
 * OP-07's walker cannot reach because the dialog name arrives off the wire.
 *
 * The queries come from the FIXTURES (the tables the index is built from),
 * never from the search module's own kind list, so the test cannot agree
 * with its subject by construction (rule 14).
 */
describe("GS-04 · every kind's ref names a dialog the registry has", () => {
  const KINDS: SearchKind[] = ["task", "brain", "reply", "file", "decision", "issue", "learning", "goal", "habit", "person", "rule", "subtask"];
  const REGISTRY = new Set(DIALOGS.map((d) => d.name));

  /** the titles the index reads, per kind, off the fixture tables themselves */
  function fixtureTitles(): Record<SearchKind, string[]> {
    const s = db.get();
    return {
      task: s.tasks.map((t) => t.title),
      subtask: s.tasks.flatMap((t) => (t.subtasks ?? []).map((st) => st.title)),
      brain: s.brainItems.map((b) => b.text),
      reply: s.replies.map((r) => r.text),
      file: s.files.map((f) => f.name),
      decision: s.actions.map((a) => a.title),
      issue: s.agentIssues.map((i) => i.title),
      learning: s.learning.map((l) => l.title),
      goal: s.goals.map((g) => g.text),
      habit: s.habits.map((h) => h.name),
      person: s.people.map((p) => p.name),
      rule: s.autonomyRules.map((r) => r.text),
    };
  }

  /** the dialog the first fixture record of `kind` that the index finds is sent to */
  async function dialogFor(kind: SearchKind): Promise<string | undefined> {
    for (const title of fixtureTitles()[kind]) {
      for (const word of title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
        if (word.length < 3) continue;
        const group = (await find({ q: word })).groups.find((g) => g.kind === kind);
        if (group != null && group.items.length > 0) return group.items[0].ref.dialog;
      }
    }
    return undefined;
  }

  it("all twelve kinds are reachable from a fixture title, and each opens a registered dialog (or Life › People)", async () => {
    const dialogOf: Partial<Record<SearchKind, string>> = {};
    for (const kind of KINDS) dialogOf[kind] = await dialogFor(kind);
    // the partner assertion: every kind was FOUND, so the check below ran on all twelve
    expect(KINDS.filter((k) => dialogOf[k] == null)).toEqual([]);
    // `people` is Life › People — a tab, not a dialog — and `openSearchResult` says so
    const unregistered = KINDS.filter((k) => dialogOf[k] !== "people" && !REGISTRY.has(dialogOf[k]!)).map((k) => `${k} → ${dialogOf[k]}`);
    expect(unregistered).toEqual([]);
  });
});

/**
 * A4R4-07 — the TAB column, which had no test.
 *
 * GS-04 above asserts a ref's tab is one of the five. It never asks whether it
 * is the RIGHT one, so when ST-1 moved the standing rules to Settings the
 * dialog half of that move was corrected (B-70) and the tab half, named in the
 * same sentence, was not: `rule` kept `tab: "brain"`, the tab rules had just
 * been removed from. Following a rule from Find landed on Brain with the
 * Settings editor over it, and Close left you on a tab you never chose.
 *
 * A dialog that belongs to a tab must be REACHED on that tab. The registry is
 * the authority for which tab owns a section, so this reads it rather than
 * restating it.
 */
describe("A4R4-07 · a ref's tab is the tab its dialog belongs to", () => {
  it("a rule found in Find does NOT send you to Brain, the tab ST-1 removed rules from", async () => {
    // The SUBJECT, found the way a person finds it. No conditional: if the
    // search stops returning a rule this case fails rather than quietly
    // passing, which is the difference between a guard and a decoration
    // (A4R3-05 taught that the expensive way).
    const r = await find({ q: "pickup" });
    const rules = r.groups.flatMap((g) => g.items).filter((i) => i.kind === "rule");
    expect(rules.length).toBeGreaterThan(0);
    for (const item of rules) {
      expect(item.ref.dialog).toBe("rules-edit");
      // Brain is the wrong answer precisely because Brain once WAS the right
      // answer: ST-1 moved the standing rules to Settings, the dialog half of
      // that move was corrected at B-70 and the tab half was not.
      expect({ id: item.id, tab: item.ref.tab }).toEqual({ id: item.id, tab: "today" });
    }
  });
});
