/**
 * LH-06, LH-07 — archiving a habit, and getting it back with its history.
 *
 * The whole row is one promise: **the logs are never deleted**. Josh's words
 * (`JOSH_QA_v22.md` item 12): "when I delete a habit from my current tracking
 * list, the data must be retained. Adding in a new habit, the deleted ones
 * should show up as an option to give me the ability to restore with it's data
 * if I want it back."
 *
 * So the negative assertions here are each paired with a positive one that
 * proves the request would otherwise have matched — an archived habit is proven
 * PRESENT somewhere before it is asserted absent from the list, and a restored
 * habit's stats are compared against the numbers it had before it was ever
 * archived, not merely asserted non-empty (hard rule 14, R-01).
 */
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import type { Habit, HabitStats } from "@/data/types";

async function habits(query: Record<string, string> = {}): Promise<Habit[]> {
  const res = await handle({ method: "GET", path: "/habits", query });
  expect(res.status).toBe(200);
  return res.json as Habit[];
}

async function stats(period = "all"): Promise<HabitStats> {
  const res = await handle({ method: "GET", path: "/habits/stats", query: { period } });
  expect(res.status).toBe(200);
  return res.json as HabitStats;
}

async function put(next: Habit[]) {
  return handle({ method: "PUT", path: "/habits", body: { habits: next } });
}

const ids = (rows: { id: string }[]) => rows.map((h) => h.id);

/** archive h4 the way the editor does, and hand back what it was before */
async function archiveH4() {
  const before = (await stats()).habits.find((h) => h.id === "h4")!;
  const next = (await habits()).map((h) => (h.id === "h4" ? { ...h, archived: true } : h));
  const res = await put(next);
  expect(res.status).toBe(200);
  return before;
}

beforeEach(() => {
  db.reset();
  db.asUser("josh");
});

describe("LH-06 · archiving takes the habit off the list and keeps every log", () => {
  it("the habit leaves GET /habits and the Life composite together", async () => {
    expect(ids(await habits())).toContain("h4");
    await archiveH4();

    expect(ids(await habits())).not.toContain("h4");
    // the composite is the surface the Life card and Today's chips load through,
    // so it is asserted on the PAIR — teaching only one of them to filter is
    // exactly the defect LG-1 shipped and `goals.test.ts` now guards (qa A-2)
    const life = await handle({ method: "GET", path: "/life" });
    expect(ids((life.json as { habits: Habit[] }).habits)).not.toContain("h4");
  });

  it("keeps every log — the count before and after archiving is identical", async () => {
    const logsBefore = db.get().habitLogs.filter((l) => l.habitId === "h4").length;
    expect(logsBefore).toBeGreaterThan(0);
    await archiveH4();
    expect(db.get().habitLogs.filter((l) => l.habitId === "h4").length).toBe(logsBefore);
  });

  it("stats for an archived habit still compute, and are the same numbers", async () => {
    const before = await archiveH4();
    const after = (await stats()).habits.find((h) => h.id === "h4");

    expect(after).toBeDefined();
    // the same numbers, not merely some numbers: a stats route that quietly
    // returned zeroes for an archived habit would pass a "still computes" check
    expect({ done: after!.done, possible: after!.possible, streak: after!.streak }).toEqual({
      done: before.done,
      possible: before.possible,
      streak: before.streak,
    });
    expect(after!.archived).toBe(true);
  });

  it("stamps when it was archived, and does not restamp a habit already archived", async () => {
    await archiveH4();
    const stamped = (await habits({ includeArchived: "true" })).find((h) => h.id === "h4")!;
    expect(stamped.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // a second save that leaves it archived must not move the date — "archived
    // 3 days ago" would reset itself every time anything else was edited
    const next = (await habits({ includeArchived: "true" })).map((h) => (h.id === "h1" ? { ...h, name: "Exercise " } : h));
    expect((await put(next)).status).toBe(200);
    expect((await habits({ includeArchived: "true" })).find((h) => h.id === "h4")!.archivedAt).toBe(stamped.archivedAt);
  });
});

describe("LH-07 · the archived ones come back, with their history", () => {
  it("GET /habits?includeArchived= is what lists them, and the plain call does not", async () => {
    await archiveH4();
    expect(ids(await habits())).not.toContain("h4");
    // the positive half of the same query
    expect(ids(await habits({ includeArchived: "true" }))).toContain("h4");
  });

  it("restoring returns the habit AND its logs and stats, unchanged", async () => {
    const before = await archiveH4();

    const restored = (await habits({ includeArchived: "true" })).map((h) => (h.id === "h4" ? { ...h, archived: false } : h));
    expect((await put(restored)).status).toBe(200);

    expect(ids(await habits())).toContain("h4");
    const after = (await stats()).habits.find((h) => h.id === "h4")!;
    expect({ done: after.done, possible: after.possible, streak: after.streak }).toEqual({
      done: before.done,
      possible: before.possible,
      streak: before.streak,
    });
    // and the stamp is cleared, so a restored habit does not claim to be archived
    expect((await habits()).find((h) => h.id === "h4")!.archivedAt).toBeUndefined();
  });

  it("the days of history the restore line promises is a number the stats can produce", async () => {
    // LH-07's copy is "Restore · keeps N days of history". N is the count of
    // days the habit has ever been logged, which for the `all` period IS
    // `possible` — asserted here so the sentence and the number cannot drift.
    const before = await archiveH4();
    expect(before.possible).toBeGreaterThan(0);
    expect(before.possible).toBe(db.get().habitLogs.filter((l) => l.habitId === "h4").length);
  });
});

describe("LH-06 · PUT /habits refuses what would lose data", () => {
  it("refuses a body that is not a list of habits, naming the field", async () => {
    const res = await handle({ method: "PUT", path: "/habits", body: { habits: "all of them" } });
    expect(res.status).toBe(422);
    expect((res.json as { field?: string }).field).toBe("habits");
  });

  it("refuses a habit with no name rather than storing a blank row", async () => {
    const [first, ...rest] = await habits();
    expect((await put([{ ...first, name: "  " }, ...rest])).status).toBe(422);
    // the positive half: the same body with the name restored is accepted
    expect((await put([first, ...rest])).status).toBe(200);
  });

  it("REFUSES to drop a habit off the list — archiving is the only way out", async () => {
    const res = await put((await habits()).filter((h) => h.id !== "h4"));
    expect(res.status).toBe(422);
    expect((res.json as { reason?: string }).reason).toContain("Audiobook");
    // and it is still there, with its logs
    expect(ids(await habits())).toContain("h4");
  });
});

describe("LH-06 · renaming and reordering keep the logs", () => {
  it("a rename does not touch the logs", async () => {
    const logs = db.get().habitLogs.filter((l) => l.habitId === "h4").length;
    const next = (await habits()).map((h) => (h.id === "h4" ? { ...h, name: "Listening" } : h));
    expect((await put(next)).status).toBe(200);
    expect((await habits()).find((h) => h.id === "h4")!.name).toBe("Listening");
    expect(db.get().habitLogs.filter((l) => l.habitId === "h4").length).toBe(logs);
  });

  it("the list comes back in the order it was sent, renumbered", async () => {
    const current = await habits();
    const moved = [current[2], current[0], current[1], ...current.slice(3)];
    expect((await put(moved)).status).toBe(200);

    const after = await habits();
    expect(ids(after).slice(0, 3)).toEqual([current[2].id, current[0].id, current[1].id]);
    // `sort` follows the order rather than being carried from the client: two
    // habits with the same number would otherwise render in whatever order the
    // table happened to hold them
    expect(after.map((h) => h.sort)).toEqual(after.map((_, i) => i + 1));
  });
});
