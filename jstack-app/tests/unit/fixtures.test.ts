/**
 * CT-06 — every fixture record of a labelled noun carries `labels`
 * (scheme-valid: a real Silo, at least one real LabelType, a real
 * LabelSetBy) and `focus`; the scheme data/labels.ts exports matches what
 * `GET /labels/scheme` returns.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { get, reset } from "@/data/mock/db";
import agentsFixture from "@/data/mock/fixtures/agents.json";
import { SILO_META, TYPE_META } from "@/data/labels";
import { handle } from "@/data/mock/server";
import type { ActionItem, BrainItem, CalEvent, Insight, Task } from "@/data/types";

beforeEach(() => {
  reset();
});

function expectLabelled(record: { labels?: { silo: string; types: string[]; setBy: string }; focus?: string }, id: string) {
  expect(record.labels).toBeDefined();
  expect(record.focus).toBeDefined();
  const { silo, types, setBy } = record.labels!;
  expect(Object.keys(SILO_META)).toContain(silo);
  expect(types.length).toBeGreaterThan(0);
  for (const t of types) expect(Object.keys(TYPE_META)).toContain(t);
  expect(["source", "review", "pattern", "content", "folder", "josh"]).toContain(setBy);
  void id; // surfaced in the failing assertion's stack, not asserted directly
}

describe("CT-06 every labelled-noun fixture carries scheme-valid labels + focus", () => {
  it("every action (open and history)", () => {
    const { actions } = get();
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions as ActionItem[]) expectLabelled(a, a.id);
  });

  it("every task", () => {
    const { tasks } = get();
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks as Task[]) expectLabelled(t, t.id);
  });

  it("every calendar event", () => {
    const { calendarEvents } = get();
    expect(calendarEvents.length).toBeGreaterThan(0);
    for (const e of calendarEvents as CalEvent[]) expectLabelled(e, e.id);
  });

  it("every brain item", () => {
    const { brainItems } = get();
    expect(brainItems.length).toBeGreaterThan(0);
    for (const b of brainItems as BrainItem[]) expectLabelled(b, b.id);
  });

  it("the one insight fixture", () => {
    const { insights } = get();
    expect(insights.length).toBeGreaterThan(0);
    for (const i of insights as Insight[]) expectLabelled(i, i.id);
  });
});

describe("SEC-15 in the fixtures: the EA's work drafts, it does not send (AUDIT_v21 A-9)", () => {
  it("no EA-owned task or subtask title begins with a send, pay, book or revoke verb", () => {
    // Day 2 marked the subtask "Send from the JSTACK inbox" done with an EA
    // badge, on a card whose report says "nothing sent", under a watermark
    // that says "nothing sends". The demo's story has to keep the brief's
    // own rule: the EA produces work and never acts outward. Josh's own
    // tasks may say "Book the flights" — that is his to do, not the EA's.
    const tasks = JSON.parse(readFileSync(join(__dirname, "..", "..", "data", "mock", "fixtures", "tasks.json"), "utf8")) as { owner: string; title: string; subtasks?: { owner: string; title: string }[] }[];
    const eaTitles = tasks.flatMap((t) => [...(t.owner === "ea" ? [t.title] : []), ...(t.subtasks ?? []).filter((s) => s.owner === "ea").map((s) => s.title)]);
    expect(eaTitles.length).toBeGreaterThan(3);
    expect(eaTitles.filter((t) => /^(send|pay|book|revoke)\b/i.test(t))).toEqual([]);
  });
});

describe("CT-06 data/labels.ts matches GET /labels/scheme", () => {
  it("silos and types are identical", async () => {
    const res = await handle({ method: "GET", path: "/labels/scheme", query: {} });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ silos: SILO_META, types: TYPE_META });
  });
});

/**
 * JQ-04 (Josh, 8 Sep) — "owners are not 'J Josh' and 'J Joce'. That's dumb.
 * Make it Josh (abbreviated to JO) and Joce (abbreviated to JM)."
 *
 * The initial came from a hand-written map (`OWNER_INITIAL`) that gave Josh and
 * Joce the same letter, so two different people wore the same circle and the
 * name beside it was the only thing telling them apart. The abbreviation is a
 * fact about a PERSON, so it lives on the roster record with them — and this
 * asserts every entry carries one, which is what stops a derived first letter
 * coming back the next time somebody is added.
 */
describe("JQ-04 · every person carries their own abbreviation", () => {
  const roster = (agentsFixture as { roster: { id: string; name: string; short?: string }[] }).roster;

  it("every roster entry has a two-letter short", () => {
    const bad = roster.filter((r) => typeof r.short !== "string" || !/^[A-Z]{2}$/.test(r.short));
    expect(bad.map((r) => r.id)).toEqual([]);
  });

  it("no two people share one — which is the whole complaint", () => {
    const shorts = roster.map((r) => r.short);
    expect(shorts.length).toBe(new Set(shorts).size);
  });

  it("Josh is JO and Joce is JM, as Josh asked", () => {
    expect(roster.find((r) => r.id === "josh")?.short).toBe("JO");
    expect(roster.find((r) => r.id === "joce")?.short).toBe("JM");
  });
});

/**
 * Stage 6 A-3 (S6-36, S6-27) — two fixture strings a reader could not use: a
 * bill value with the app's meta separator inside it, and a People row whose
 * meta was a two-letter code beside a literal date.
 */
describe("Stage 6 A-3 · fixture strings a person has to read", () => {
  const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "..", "..", "data", "mock", "fixtures", name), "utf8"));

  it("no bill line puts the meta separator inside a value somebody will paste into a bank (S6-36)", () => {
    const cards = fixture("actions.json") as { id: string; bill?: { k: string; v: string }[] }[];
    const lines = cards.flatMap((c) => (c.bill ?? []).map((l) => ({ card: c.id, ...l })));
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.filter((l) => l.v.includes(" · "))).toEqual([]);
    // the BSB and the account are two fields with two copy links, as the grid supports
    expect(cards.find((c) => c.id === "c3")!.bill!.map((l) => l.k)).toEqual(["payee", "BSB", "account", "ref"]);
  });

  it("a People row's meta carries no bare two-letter code and no literal date (S6-27, LV-06)", () => {
    const people = (fixture("life.json") as { people: { id: string; meta: string }[] }).people;
    expect(people.length).toBeGreaterThan(3);
    const codes = people.filter((p) => /(^|· )[A-Z]{2}( ·|$)/.test(p.meta));
    expect(codes.map((p) => `${p.id}: ${p.meta}`)).toEqual([]);
    const dates = people.filter((p) => /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(p.meta));
    expect(dates.map((p) => `${p.id}: ${p.meta}`)).toEqual([]);
  });
});

describe("Stage 6 A-4 · the never-list holds in the fixtures (A4-01)", () => {
  // `01_APP_SPEC.md` §1 rule 9 ("COSOL data never appears anywhere. Not in
  // fixtures, examples, or copy") and §13's never-list; `DATA_LABELS.md`'s
  // own row on the label — "historical only · never appears in fixtures or
  // copy". The LABEL TYPE is sanctioned, so that archived records still have
  // a home; the WORD is what may not ship. Nothing swept for it until the
  // A-4 audit read it off the running app in Brain › Files, out of
  // `files.json`, out of `jstack-mock-v13.html` and out of the device pass.
  const dir = join(__dirname, "..", "..", "data", "mock", "fixtures");
  const forbidden = /cosol/i;

  it("no fixture names the business the spec forbids, in any field", () => {
    const names = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(names.length).toBeGreaterThan(5); // a glob that matched nothing would pass silently
    const hits = names.flatMap((name) =>
      readFileSync(join(dir, name), "utf8")
        .split("\n")
        .map((text, i) => ({ name, line: i + 1, text: text.trim() }))
        .filter((l) => forbidden.test(l.text)),
    );
    expect(hits.map((h) => `${h.name}:${h.line} ${h.text}`)).toEqual([]);
  });

  it("the sweep catches a plant — otherwise its silence proves nothing", () => {
    // the four shapes A-4 actually found, and the replacement it must not flag
    expect(forbidden.test('"id": "f-cosol-deck",')).toBe(true);
    expect(forbidden.test('"name": "COSOL board deck.pdf",')).toBe(true);
    expect(forbidden.test('"folder": "/JSTACK/Work/COSOL",')).toBe(true);
    expect(forbidden.test('"types": ["cosol"], "setBy": "folder"')).toBe(true);
    expect(forbidden.test('"name": "Core Asset board deck.pdf",')).toBe(false);
  });
});
