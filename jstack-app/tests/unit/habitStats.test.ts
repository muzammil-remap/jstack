/**
 * LH-01, LH-04 — `GET /habits/stats` and the geometry the grids are drawn from.
 *
 * The server half is driven through the ROUTE (`handle`), for the reason
 * `files.test.ts` and `goals.test.ts` give: every claim is about what the
 * SERVER returns, and calling the handler directly would assert the same
 * function twice.
 *
 * The streak numbers are pinned as LITERALS computed by hand from the fixture's
 * day strings, not recomputed here from the same input with the same algorithm
 * — a test that re-implements its subject agrees with its subject's bugs
 * (R-02). `data/mock/fixtures/habits-log.json` is deterministic, so these
 * numbers are stable; regenerate it and they move together, on purpose.
 */
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import habitLogFixture from "@/data/mock/fixtures/habits-log.json";
import { addDays, todayKey } from "@/lib/time";
import { cellFor, habitAllTimeLine, habitSummaryLine, columnsFit, monthCells, monthStartAtOrAfter, monthlyCounts, TRENDS_DIALOG_CHROME, trendsBodyHeight, weekColumnOf, yearMonthLabels, yearOpening, yearMonthSpans, yearWeeks, yearlyCounts } from "@/lib/habitStats";
import type { HabitStatRow, HabitStats } from "@/data/types";

async function stats(query: Record<string, string> = {}): Promise<HabitStats> {
  const res = await handle({ method: "GET", path: "/habits/stats", query });
  expect(res.status).toBe(200);
  return res.json as HabitStats;
}

const rowOf = (s: HabitStats, id: string) => s.habits.find((h) => h.id === id)!;

beforeEach(() => {
  db.reset();
  db.asUser("josh");
});

describe("LH-01 · the fixture is 184 days and says so three ways", () => {
  it("carries a day string per habit, all the same length, of only the three marks", () => {
    const logs = habitLogFixture.logs as Record<string, string>;
    expect(Object.keys(logs)).toHaveLength(9);
    expect(habitLogFixture.days).toBe(184);
    for (const [id, days] of Object.entries(logs)) {
      expect(`${id}:${days.length}`).toBe(`${id}:184`);
      expect(days).toMatch(/^[10.]+$/);
    }
  });

  it("today is exactly the four the other specs pin", () => {
    // `today.spec.ts` reads "4/9" off the glance and `life.spec.ts` toggles h2
    // and h4 from off. Today's column is a fixture CONTRACT, so it is asserted
    // here rather than left to whatever the generator produced.
    const logs = habitLogFixture.logs as Record<string, string>;
    const doneToday = Object.entries(logs)
      .filter(([, days]) => days[0] === "1")
      .map(([id]) => id);
    expect(doneToday.sort()).toEqual(["h1", "h3", "h5", "h9"]);
  });

  it("expands into logs with no row for a day nobody logged", () => {
    const logs = habitLogFixture.logs as Record<string, string>;
    const expected = Object.values(logs).join("").replace(/\./g, "").length;
    expect(db.get().habitLogs.length).toBe(expected);
    // and the day keys are real, composed here rather than written in the
    // fixture — nothing in it is a literal date
    for (const l of db.get().habitLogs.slice(0, 20)) expect(l.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("LH-01 · the window a period asks about", () => {
  it("week is the last seven days, ending today", async () => {
    const s = await stats({ period: "week" });
    const row = rowOf(s, "h9");
    expect(row.possible).toBe(7);
    expect(Object.keys(row.days).every((k) => k <= todayKey() && k >= addDays(todayKey(), -6))).toBe(true);
  });

  it("month is a CALENDAR month at the anchor, not the last thirty days", async () => {
    const s = await stats({ period: "month", anchor: "2026-04-01" });
    const keys = Object.keys(rowOf(s, "h3").days);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith("2026-04"))).toBe(true);
  });

  it("reads the anchor at all — it was declared on the route and unread until this row", async () => {
    const april = Object.keys(rowOf(await stats({ period: "month", anchor: "2026-04-01" }), "h3").days);
    const may = Object.keys(rowOf(await stats({ period: "month", anchor: "2026-05-01" }), "h3").days);
    // the positive half: both months have data, so a different answer is the
    // anchor being read and not one of them being empty
    expect(april.length).toBeGreaterThan(0);
    expect(may.length).toBeGreaterThan(0);
    expect(april).not.toEqual(may);
  });

  it("possible never counts a day that has not happened", async () => {
    const s = await stats({ period: "month", anchor: `${todayKey().slice(0, 7)}-01` });
    const row = rowOf(s, "h1");
    const dayOfMonth = Number(todayKey().slice(8, 10));
    // a month opened on the 9th reports out of 9, not out of 30 — "18 of 30"
    // in a month in progress reads as a failure
    expect(row.possible).toBe(dayOfMonth);
    expect(row.done).toBeLessThanOrEqual(row.possible);
  });

  it("an anchor with nothing logged is an empty month, not an error", async () => {
    const s = await stats({ period: "month", anchor: "2019-01-01" });
    expect(s.habits).toHaveLength(9);
    expect(Object.keys(rowOf(s, "h1").days)).toHaveLength(0);
    expect(rowOf(s, "h1").done).toBe(0);
  });
});

describe("LH-04 · streaks are counted over every log, never over the window", () => {
  // pinned literals, computed by hand from the fixture's day strings
  const EXPECTED: Record<string, { current: number; longest: number }> = {
    h9: { current: 6, longest: 27 },
    h3: { current: 4, longest: 42 },
    h8: { current: 0, longest: 2 },
    h2: { current: 0, longest: 4 },
  };

  it("reports the current and longest runs the fixture actually contains", async () => {
    const s = await stats({ period: "week" });
    for (const [id, want] of Object.entries(EXPECTED)) {
      expect({ id, ...rowOf(s, id).streak }).toEqual({ id, ...want });
    }
  });

  it("a week window and an all-time window report the SAME streak", async () => {
    // the whole point: "current streak" means up to today, and a month view
    // asking about April must not report a streak that starts on the 1st
    const week = await stats({ period: "week" });
    const all = await stats({ period: "all" });
    expect(rowOf(all, "h9").streak).toEqual(rowOf(week, "h9").streak);
    // and the two windows genuinely differ, so this is not two reads of one set
    expect(rowOf(all, "h9").possible).toBeGreaterThan(rowOf(week, "h9").possible);
  });

  it("an unfinished today does not break the current run", async () => {
    // h2 is not done today; its run is counted from yesterday, so a habit that
    // has been kept for days does not read as zero until the evening
    const s = await stats({ period: "all" });
    expect(rowOf(s, "h2").days[todayKey()]).toBeUndefined();
    expect(rowOf(s, "h2").streak.longest).toBe(4);
  });
});

describe("LH-02/LH-03 · what a day is drawn as, and where it sits", () => {
  const row = (days: Record<string, boolean>): HabitStatRow => ({
    id: "h1",
    name: "Exercise",
    days,
    streak: { current: 0, longest: 0 },
    done: 0,
    possible: 0,
  });

  it("a future day is blank, a logged miss and an unlogged day are both a miss", () => {
    const r = row({ "2026-09-08": true, "2026-09-07": false });
    expect(cellFor(r, "2026-09-08", "2026-09-09")).toBe("hit");
    expect(cellFor(r, "2026-09-07", "2026-09-09")).toBe("miss");
    expect(cellFor(r, "2026-09-06", "2026-09-09")).toBe("miss");
    expect(cellFor(r, "2026-09-10", "2026-09-09")).toBe("future");
    expect(cellFor(r, "2026-09-09", "2026-09-09")).toBe("miss");
  });

  it("a month is whole weeks, Monday first, padded at both ends", () => {
    // September 2026 starts on a Tuesday, so one pad cell leads
    const cells = monthCells("2026-09-01");
    expect(cells.length % 7).toBe(0);
    expect(cells[0]).toBeNull();
    expect(cells[1]).toBe("2026-09-01");
    expect(cells.filter((c) => c != null)).toHaveLength(30);
  });

  it("a year is week columns covering every one of its days, with a label per month", () => {
    const weeks = yearWeeks(2026);
    const flat = weeks.flat();
    expect(flat).toContain("2026-01-01");
    expect(flat).toContain("2026-12-31");
    for (const w of weeks) expect(w).toHaveLength(7);
    const labels = yearMonthLabels(weeks);
    // TWELVE MONTHS, plus the straddling one. The week containing 1 January
    // starts in December, so column 0 is labelled Dec — which is what the
    // reference image shows too ("Dec, Jan 2021, Feb…"), and dropping it would
    // leave the first column unlabelled rather than correct.
    expect(labels.map((l) => l.label)).toEqual(["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
    expect(labels.map((l) => l.index)).toEqual([...labels.map((l) => l.index)].sort((a, b) => a - b));
    // one label per column at most
    expect(new Set(labels.map((l) => l.index)).size).toBe(labels.length);
  });

  it("the twelve bars are twelve, in order, counting only hits", () => {
    const r = row({ "2026-03-02": true, "2026-03-03": true, "2026-03-04": false, "2026-07-01": true });
    const bars = monthlyCounts(r, 2026);
    expect(bars).toHaveLength(12);
    expect(bars[2].count).toBe(2);
    expect(bars[6].count).toBe(1);
    expect(bars[0].count).toBe(0);
  });

  it("all-time rows are one per year with data, newest first", () => {
    const r = row({ "2025-12-31": true, "2026-01-01": true, "2026-01-02": false });
    expect(yearlyCounts(r)).toEqual([
      // LH2-05: the RATE as well as the count. The bar is drawn from the rate,
      // because scaling it against the biggest year in the card meant every bar
      // filled completely whenever there was only one year of data.
      { year: "2026", count: 1, known: 2, rate: 0.5 },
      { year: "2025", count: 1, known: 1, rate: 1 },
    ]);
  });
});

describe("LH-04 · the lines a person reads", () => {
  it("the all-time line names both streaks, the count and the rate", () => {
    const r: HabitStatRow = { id: "h1", name: "Exercise", days: {}, streak: { current: 4, longest: 19 }, done: 128, possible: 184 };
    expect(habitAllTimeLine(r)).toBe("current streak 4 · longest 19 · 128 of 184 · 70%");
  });

  it("the summary states nothing until the stats arrive", () => {
    // A-06: "This week 0% · 0 of 0" is a claim, not a loading state
    expect(habitSummaryLine(null, "week")).toBe("This week —");
    // LH2-07: "All time", not "This all time" — which is not English, and read
    // as a bug beside the three periods that are
    expect(habitSummaryLine(null, "all")).toBe("All time —");
  });

  it("the summary sums the habits rather than reading a total off the wire", async () => {
    const s = await stats({ period: "week" });
    const done = s.habits.reduce((n, h) => n + h.done, 0);
    const possible = s.habits.reduce((n, h) => n + h.possible, 0);
    expect(habitSummaryLine(s, "week")).toBe(`This week ${Math.round((done / possible) * 100)}% · ${done} of ${possible}`);
    // the totals are NOT on the response — they were, twice, and a fact
    // declared twice is one that drifts (rule 16)
    expect(s).not.toHaveProperty("done");
    expect(s).not.toHaveProperty("pct");
  });
});

/**
 * Stage 6 A-3 (S6-11) — the year card's two charts share one axis, and the
 * dialog holds one height whichever tab is up.
 */
describe("Stage 6 A-3 · the year's bars sit on the grid's columns, and the dialog stands still", () => {
  it("month spans tile the week columns: each month starts where the last ended, and the year covers every column", () => {
    const weeks = yearWeeks(2026);
    const spans = yearMonthSpans(weeks, 2026);
    expect(spans).toHaveLength(12);
    expect(spans[0]).toEqual({ month: "2026-01", start: 0, end: spans[1].start });
    for (let i = 1; i < 12; i += 1) expect(spans[i].start).toBe(spans[i - 1].end);
    expect(spans[11].end).toBe(weeks.length);
    // 1 February 2026 is a Sunday: the column holding it is February's first,
    // so no month is drawn over a week another month owns
    expect(spans[0].end).toBe(weeks.findIndex((w) => w.includes("2026-02-01")));
  });

  it("the column a day sits in, and null for a day outside the year", () => {
    const weeks = yearWeeks(2026);
    expect(weekColumnOf(weeks, "2026-01-01")).toBe(0);
    expect(weekColumnOf(weeks, "2026-09-10")).toBe(weeks.findIndex((w) => w.includes("2026-09-10")));
    expect(weekColumnOf(weeks, "2025-06-01")).toBeNull();
  });

  it("the dialog body is sized to the dialog's own ceiling on a desktop, and left to the screen on a phone", () => {
    // 90% of the viewport is the Dialog's cap; what is left after its header
    // and the body padding is the floor the body is given
    expect(trendsBodyHeight(900, false)).toBe(Math.round(900 * 0.9) - TRENDS_DIALOG_CHROME);
    expect(trendsBodyHeight(852, true)).toBeUndefined();
  });
});

describe("S6-44 · the year scroller opens on a month boundary, never mid-month", () => {
  it("the first month start at or after a column; the column itself when none follows", () => {
    // `trends-year-d1-1366-*`: every card opened with today's column at the
    // right edge, which put the left edge mid-May — `y` for May, `l9` for 19.
    const weeks = yearWeeks(2026);
    const spans = yearMonthSpans(weeks, 2026);
    const sep = spans.find((s) => s.month === "2026-09")!;
    const oct = spans.find((s) => s.month === "2026-10")!;
    expect(monthStartAtOrAfter(spans, sep.start)).toBe(sep.start);
    expect(monthStartAtOrAfter(spans, sep.start + 1)).toBe(oct.start);
    expect(monthStartAtOrAfter(spans, 0)).toBe(0);
    expect(monthStartAtOrAfter(spans, weeks.length + 3)).toBe(weeks.length + 3);
  });
});

describe("S6-55 · the year window opens whole at both ends, and only what fits is drawn", () => {
  const weeks = yearWeeks(2026);
  const spans = yearMonthSpans(weeks, 2026);
  const today = weekColumnOf(weeks, "2026-09-10")!;
  const sep = spans.find((s) => s.month === "2026-09")!;

  it("opens on a month start when the row is wide, with today inside", () => {
    // `trends-year-d1-1366-*`: the left edge whole (B-165) and the right edge
    // cutting `Oct` to `Oc` — a wide row has room for both to be whole
    const first = yearOpening(spans, today, 30, 4);
    expect(spans.some((s) => s.start === first)).toBe(true);
    expect(first).toBeLessThanOrEqual(today);
    expect(first + 30).toBeGreaterThan(today);
  });

  it("on a narrow row the current month's caption comes before the month start — round out, not in (393)", () => {
    // `trends-year-d1-393-*`: the cut fell on September, the month the owner is in
    const first = yearOpening(spans, today, 8, 4);
    expect(first + 8).toBeGreaterThanOrEqual(sep.start + 4);
    expect(first).toBeLessThanOrEqual(today);
  });

  it("a caption or a value is drawn only when every column it needs is inside the window", () => {
    expect(columnsFit(10, 14, 10, 30)).toBe(true);
    expect(columnsFit(9, 13, 10, 30)).toBe(false);
    expect(columnsFit(37, 41, 10, 30)).toBe(false);
    expect(columnsFit(36, 40, 10, 30)).toBe(true);
  });
});
