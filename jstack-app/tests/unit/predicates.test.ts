/**
 * S-2 (SP-01, prep for TF-06/TF-09) — every slicer and every filter group has
 * an implementation, and the table is checked against the TYPE, not itself.
 *
 * The slicers were an if/else chain. A chain cannot be asked "is every kind
 * handled" — a missing branch is a slicer that silently returns everything,
 * which looks like a filter that matched a lot rather than one that never ran.
 * A table can be asked, and this is the asking.
 *
 * The expected sets are written out as literals. Reading them off
 * `Object.keys(PREDICATE_KINDS)` would be asking the table to confirm itself,
 * which is the failure rule 14 exists to name: a guard that derives its
 * expectation from its subject agrees with whatever it finds. If `TaskSlice`
 * gains a member (F-1 widens it), TypeScript fails the Record first and this
 * list fails second — two chances to notice, both of them loud.
 */
import { FILTER_GROUPS, PREDICATE_KINDS, dueBucket, inWindow, passesFilters, passesSlicer } from "@/data/mock/predicates";
import slicersFixture from "@/data/mock/fixtures/slicers.json";
import { EMPTY_FILTERS } from "@/data/taskFilters";
import type { Slicer, Task } from "@/data/types";

const slicers = slicersFixture as Slicer[];

const NOW = new Date("2026-09-07T09:00:00.000Z");

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: "t",
    title: "a task",
    owner: "josh",
    priority: "medium",
    status: "open",
    activity: [],
    ...over,
  }) as Task;

describe("SP-01 · the seeded slicers are records, and every one of them is evaluable", () => {
  it("the fixture ships exactly the five the app has always had", () => {
    // literals, deliberately: see the header. F-1 replaced `SLICER_PREDICATES`
    // — a function per id — with a stored record per slicer, so the guard moved
    // from "is every id implemented" to "does every SHIPPED slicer ask a
    // question the server knows".
    expect(slicers.map((s) => s.id)).toEqual(["week", "waiting", "delegated", "agent", "recurring"]);
    expect(slicers.map((s) => s.name)).toEqual(["This week", "Waiting", "Delegated", "Agent", "Recurring"]);
  });

  it("each one carries a predicate kind the table implements", () => {
    for (const s of slicers) expect(Object.keys(PREDICATE_KINDS)).toContain(s.predicate.kind);
  });

  it("each one selects what its name says, and rejects what it does not", () => {
    const by = (id: string) => slicers.find((s) => s.id === id)!.predicate;
    expect(passesSlicer(task({ status: "waiting" }), by("waiting"), NOW)).toBe(true);
    expect(passesSlicer(task({ status: "open" }), by("waiting"), NOW)).toBe(false);

    expect(passesSlicer(task({ delegated: { to: "ea", state: "running" } } as Partial<Task>), by("delegated"), NOW)).toBe(true);
    expect(passesSlicer(task(), by("delegated"), NOW)).toBe(false);

    expect(passesSlicer(task({ owner: "ea" }), by("agent"), NOW)).toBe(true);
    expect(passesSlicer(task({ owner: "josh" }), by("agent"), NOW)).toBe(false);

    expect(passesSlicer(task({ repeat: { rule: "every Mon 8am" } } as Partial<Task>), by("recurring"), NOW)).toBe(true);
    expect(passesSlicer(task(), by("recurring"), NOW)).toBe(false);

    // week is the only one that reads the clock: inside seven days, and not
    // a task with no date at all
    expect(passesSlicer(task({ due: "2026-09-10" }), by("week"), NOW)).toBe(true);
    expect(passesSlicer(task({ due: "2026-10-30" }), by("week"), NOW)).toBe(false);
    expect(passesSlicer(task(), by("week"), NOW)).toBe(false);
  });

  it("two of them cannot be removed — `fixed` is the server's word as well as the dialog's", () => {
    expect(slicers.filter((s) => s.fixed === true).map((s) => s.id)).toEqual(["week", "delegated"]);
  });

  it("`now` is a parameter, so the same task slices differently on another day", () => {
    const t = task({ due: "2026-09-10" });
    const week = slicers[0].predicate;
    expect(passesSlicer(t, week, NOW)).toBe(true);
    expect(passesSlicer(t, week, new Date("2026-08-01T09:00:00.000Z"))).toBe(false);
  });
});

describe("SP-01 · every filter group is implemented", () => {
  it("the table has exactly the five groups TaskFilters names", () => {
    expect(Object.keys(FILTER_GROUPS).sort()).toEqual(["due", "owner", "priority", "project", "status"]);
  });

  it("a task with no project fails a project filter rather than throwing", () => {
    expect(FILTER_GROUPS.project(task(), ["Bali"], NOW)).toBe(false);
    expect(FILTER_GROUPS.project(task({ project: "Bali" }), ["Bali"], NOW)).toBe(true);
  });

  it("dueBucket puts a date in exactly one bucket", () => {
    expect(dueBucket(task(), NOW)).toBe("none");
    expect(dueBucket(task({ due: "2026-09-07" }), NOW)).toBe("today");
    expect(dueBucket(task({ due: "2026-09-01" }), NOW)).toBe("overdue");
    expect(dueBucket(task({ due: "2026-09-10" }), NOW)).toBe("week");
    expect(dueBucket(task({ due: "2026-12-25" }), NOW)).toBe("none");
  });
});

describe("TK-14 · groups AND, values within a group OR", () => {
  it("an empty selection is no filter at all, not a filter that excludes everything", () => {
    expect(passesFilters(task(), EMPTY_FILTERS, NOW)).toBe(true);
  });

  it("values within one group OR", () => {
    const t = task({ priority: "high" });
    expect(passesFilters(t, { ...EMPTY_FILTERS, priority: ["low", "high"] }, NOW)).toBe(true);
    expect(passesFilters(t, { ...EMPTY_FILTERS, priority: ["low", "medium"] }, NOW)).toBe(false);
  });

  it("groups AND — passing one and failing another is a fail", () => {
    const t = task({ priority: "high", status: "open" });
    expect(passesFilters(t, { ...EMPTY_FILTERS, priority: ["high"], status: ["open"] }, NOW)).toBe(true);
    expect(passesFilters(t, { ...EMPTY_FILTERS, priority: ["high"], status: ["waiting"] }, NOW)).toBe(false);
  });
});

/**
 * TF-06/TF-09 (F-1) — a slicer is a RECORD now, and the server evaluates its
 * predicate from a table.
 *
 * The `if/else` chain became `SLICER_PREDICATES` at S-2, which answered "is
 * every slicer implemented" for a closed union of five. F-1 makes the list
 * something Josh edits, so the union is gone and the closed thing is the
 * PREDICATE KIND — five shapes the server knows how to evaluate. A slicer the
 * EA or Josh writes can only ask one of those five questions, which is what
 * makes an editable slicer safe to store.
 */
describe("TF-09 · every predicate kind is implemented", () => {
  it("the table has exactly the five kinds SlicerPredicate names", () => {
    // literals, deliberately — see the header of this file
    expect(Object.keys(PREDICATE_KINDS).sort()).toEqual(["delegated", "dueWithin", "owner", "repeat", "status"]);
  });

  it("each kind answers its own question, and nothing else's", () => {
    expect(passesSlicer(task({ due: "2026-09-10" }), { kind: "dueWithin", days: 7 }, NOW)).toBe(true);
    expect(passesSlicer(task({ due: "2026-10-30" }), { kind: "dueWithin", days: 7 }, NOW)).toBe(false);
    // a task with no due date is not "due within" anything
    expect(passesSlicer(task(), { kind: "dueWithin", days: 7 }, NOW)).toBe(false);

    expect(passesSlicer(task({ status: "waiting" }), { kind: "status", status: "waiting" }, NOW)).toBe(true);
    expect(passesSlicer(task({ status: "open" }), { kind: "status", status: "waiting" }, NOW)).toBe(false);

    expect(passesSlicer(task({ delegated: { to: "ea", state: "running" } } as Partial<Task>), { kind: "delegated" }, NOW)).toBe(true);
    expect(passesSlicer(task(), { kind: "delegated" }, NOW)).toBe(false);

    expect(passesSlicer(task({ owner: "ea" }), { kind: "owner", owner: "ea" }, NOW)).toBe(true);
    expect(passesSlicer(task({ owner: "josh" }), { kind: "owner", owner: "ea" }, NOW)).toBe(false);

    expect(passesSlicer(task({ repeat: { rule: "every Mon 8am" } } as Partial<Task>), { kind: "repeat" }, NOW)).toBe(true);
    expect(passesSlicer(task(), { kind: "repeat" }, NOW)).toBe(false);
  });

  it("the DAYS are the record's, not a constant — that is the point of a slicer being editable", () => {
    const t = task({ due: "2026-09-30" });
    expect(passesSlicer(t, { kind: "dueWithin", days: 7 }, NOW)).toBe(false);
    expect(passesSlicer(t, { kind: "dueWithin", days: 60 }, NOW)).toBe(true);
  });

  it("a kind the table does not know matches NOTHING, rather than everything", () => {
    // it cannot arrive from this app — the union forbids it — but it can
    // arrive from a stored record, and a slicer that silently stopped
    // filtering would look like a filter that matched a lot
    expect(passesSlicer(task(), { kind: "orbital" } as never, NOW)).toBe(false);
  });
});

describe("TF-01 · the range window, on the open views and on Done", () => {
  const dated = (over: Partial<Task>) => task(over);

  it("a task inside the window passes; one outside does not", () => {
    expect(inWindow(dated({ due: "2026-09-10" }), { from: "2026-09-07", to: "2026-09-30" }, "list")).toBe(true);
    expect(inWindow(dated({ due: "2026-12-10" }), { from: "2026-09-07", to: "2026-09-30" }, "list")).toBe(false);
  });

  it("ANY of the three dates inside the window is enough — a task that starts before and ends inside is in it", () => {
    expect(inWindow(dated({ startsAt: "2026-08-01T09:00:00.000Z", endsAt: "2026-09-10T17:00:00.000Z" }), { from: "2026-09-07", to: "2026-09-30" }, "list")).toBe(true);
  });

  it("a task with NO dates is always inside the range on the open views (resolution #4)", () => {
    expect(inWindow(task(), { from: "2026-09-07", to: "2026-09-30" }, "list")).toBe(true);
    expect(inWindow(task(), { from: "2026-09-07", to: "2026-09-30" }, "board")).toBe(true);
  });

  it("an empty window is everything, which is what `all` and Done's default mean", () => {
    expect(inWindow(dated({ due: "2019-01-01" }), {}, "list")).toBe(true);
  });

  it("Done measures COMPLETIONS — a task completed outside the window is out, and one never completed is not on Done at all", () => {
    expect(inWindow(dated({ completedAt: "2026-09-10T02:00:00.000Z" }), { from: "2026-09-07", to: "2026-09-30" }, "done")).toBe(true);
    expect(inWindow(dated({ completedAt: "2026-01-10T02:00:00.000Z" }), { from: "2026-09-07", to: "2026-09-30" }, "done")).toBe(false);
    // a done task from before T-3 carries no stamp: a narrowed window cannot
    // claim it landed inside one
    expect(inWindow(task(), { from: "2026-09-07", to: "2026-09-30" }, "done")).toBe(false);
    // ...but with no window at all it is shown, because Done's default is all
    expect(inWindow(task(), {}, "done")).toBe(true);
  });
});
