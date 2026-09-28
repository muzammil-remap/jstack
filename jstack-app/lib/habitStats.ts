/**
 * What the habit grids are drawn from (LH-1).
 *
 * `GET /habits/stats` answers with day keys, streaks and per-habit totals
 * (CONTRACT_v22.md §3). Everything here is derivation on top of that — the
 * totals across habits, the cell a day is drawn as, and the geometry of the
 * month and year grids — and it lives in one file for the reason
 * `lib/goalMeta.ts` and `lib/taskMeta.ts` do: four surfaces read it (the Life
 * card's week strip, the month grid, the year grid, the all-time bars), and a
 * grid that decided for itself what "a miss" means would eventually disagree
 * with the one beside it.
 *
 * THE TOTALS ARE DERIVED, NOT SENT. `HabitStats` used to carry `pct`, `done`
 * and `possible` at the top level as well as per habit, which is one fact
 * declared twice and free to drift (rule 16). The summary line adds them up
 * here instead.
 *
 * The geometry is Monday-first, like every other grid in the app
 * (`WEEKDAY_HEADS` in `theme/ui/datetime.tsx`, `mondayIndex` in `lib/time.ts`).
 * The reference image Josh sent is Sunday-first; matching it would make the
 * habit year the one calendar in JSTACK that starts on a different day.
 */
import { addDays, dayKey, mondayIndex, monthDays, monthLabel, now, weekStart } from "@/lib/time";
import type { HabitStatRow, HabitStats } from "@/data/types";

/** How a single day is drawn. `miss` covers both a logged miss and a day never
 * logged: not doing the thing is not doing the thing, and a third cell colour
 * for "you did not write it down" would be the grid teaching a distinction
 * nobody asked it to make. The mock keeps the difference in its logs; the
 * SCREEN does not need it. */
export type HabitCell = "hit" | "miss" | "future";

export function cellFor(row: HabitStatRow, key: string, todayKeyValue: string = dayKey(now())): HabitCell {
  if (key > todayKeyValue) return "future";
  return row.days[key] === true ? "hit" : "miss";
}

/** The whole board's numbers, summed across habits. Not exported: the summary
 * line below is the only thing that wants them, and an export nothing imports
 * is a claim with no caller (CT-06). */
function habitTotals(stats: HabitStats): { done: number; possible: number; pct: number } {
  const done = stats.habits.reduce((n, h) => n + h.done, 0);
  const possible = stats.habits.reduce((n, h) => n + h.possible, 0);
  return { done, possible, pct: possible > 0 ? done / possible : 0 };
}

/** The sentence reads "This week", "This month", "This year" — and "All time"
 * on its own, because "This all time" is not English and reads as a bug beside
 * the three that are (LH2-07). */
const PERIOD_PHRASE: Record<HabitStats["period"], string> = { week: "This week", month: "This month", year: "This year", all: "All time" };

/**
 * The Trends summary. Unchanged in wording from LF-03 — "This week 62% · 84 of
 * 135" — because the sentence is what the spec pins; only where the numbers
 * come from has moved.
 */
export function habitSummaryLine(stats: HabitStats | null, period: HabitStats["period"]): string {
  // A-06: "This week 0% · 0 of 0" is a claim, not a loading state. Nothing is
  // stated until the stats arrive.
  if (stats == null) return `${PERIOD_PHRASE[period]} —`;
  const { done, possible, pct } = habitTotals(stats);
  return `${PERIOD_PHRASE[period]} ${Math.round(pct * 100)}% · ${done} of ${possible}`;
}

/** LH-04's line, per habit: "current streak 4 · longest 19 · 128 of 184 · 70%". */
export function habitAllTimeLine(row: HabitStatRow): string {
  const rate = row.possible > 0 ? Math.round((row.done / row.possible) * 100) : 0;
  return `current streak ${row.streak.current} · longest ${row.streak.longest} · ${row.done} of ${row.possible} · ${rate}%`;
}

/** LH-02's caption: "18 of 30". Counted over days that have happened, which is
 * what the server sent. */
export function habitCountCaption(row: HabitStatRow): string {
  return `${row.done} of ${row.possible}`;
}

/**
 * A calendar month as seven columns, Monday first, padded with `null` for the
 * days before the 1st and after the last so every row is seven wide.
 *
 * `monthDays` is the existing helper and is reused rather than recomputed —
 * `lib/time.ts` owns what a month IS; this owns what it looks like.
 */
export function monthCells(anchor: string): (string | null)[] {
  const days = monthDays(anchor);
  if (days.length === 0) return [];
  const lead = mondayIndex(days[0]);
  const cells: (string | null)[] = Array<string | null>(lead).fill(null);
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** One column per week of the year, each seven days Monday to Sunday. Weeks
 * that straddle the year boundary keep their out-of-year days — dropping them
 * would leave a ragged first and last column, and a grid with a hole in it
 * reads as missing data rather than as January. */
export function yearWeeks(year: number): string[][] {
  const first = weekStart(`${year}-01-01`);
  const weeks: string[][] = [];
  for (let start = first; start.slice(0, 4) <= String(year); start = addDays(start, 7)) {
    const week = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i));
    weeks.push(week);
    if (week[6].slice(0, 4) > String(year)) break;
  }
  return weeks;
}

/** Where each month label sits: the index of the first week column whose
 * Monday falls in that month. A label per month, never two on one column. */
export function yearMonthLabels(weeks: string[][]): { index: number; label: string }[] {
  const out: { index: number; label: string }[] = [];
  let lastMonth = "";
  weeks.forEach((week, index) => {
    const month = week[0].slice(0, 7);
    if (month !== lastMonth) {
      out.push({ index, label: monthLabel(week[0]) });
      lastMonth = month;
    }
  });
  return out;
}

/** LH-03's twelve bars: completions per calendar month of the year. */
export function monthlyCounts(row: HabitStatRow, year: number): { month: string; label: string; count: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const count = monthDays(`${month}-01`).filter((k) => row.days[k] === true).length;
    return { month, label: monthLabel(`${month}-01`).slice(0, 1), count };
  });
}

/**
 * LH-04's rows: every year the habit has a logged day in, newest first, with
 * that year's completions and the RATE they were kept at.
 *
 * A year with no data is not drawn — an empty bar row is a year you did not
 * have the app.
 *
 * `rate` is `count / days known about in that year`, and it exists because the
 * bar was drawn against the biggest year in the same card: with one year of
 * data that is the only year, so every bar drew at 100% and a habit kept a
 * third of the time made the same mark as one kept almost always (LH2-05). A
 * bar that always fills is a picture of nothing.
 */
export function yearlyCounts(row: HabitStatRow): { year: string; count: number; known: number; rate: number }[] {
  const byYear = new Map<string, { count: number; known: number }>();
  for (const [key, done] of Object.entries(row.days)) {
    const year = key.slice(0, 4);
    const acc = byYear.get(year) ?? { count: 0, known: 0 };
    byYear.set(year, { count: acc.count + (done ? 1 : 0), known: acc.known + 1 });
  }
  return [...byYear.entries()]
    .map(([year, { count, known }]) => ({ year, count, known, rate: known > 0 ? count / known : 0 }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

/**
 * ux S6-11(b): each calendar month's run of week columns, so the year card's
 * bars sit under the same columns as its grid. A month runs from the column
 * holding its 1st up to (not including) the column holding the next month's
 * 1st; December runs to the last column. The spans tile the year with no gap
 * and no overlap, which `tests/unit/habitStats.test.ts` holds them to.
 */
export function yearMonthSpans(weeks: string[][], year: number): { month: string; start: number; end: number }[] {
  const firstOf = (m: number) => `${year}-${String(m).padStart(2, "0")}-01`;
  const columnOf = (key: string) => weeks.findIndex((w) => w.includes(key));
  return Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, "0")}`,
    start: columnOf(firstOf(i + 1)),
    end: i === 11 ? weeks.length : columnOf(firstOf(i + 2)),
  }));
}

/** The week column a day sits in, or null when the year does not hold it —
 * which is what tells the year scroller where to open (ux S6-11(b)). */
export function weekColumnOf(weeks: string[][], key: string): number | null {
  const i = weeks.findIndex((w) => w.includes(key));
  return i === -1 ? null : i;
}

/**
 * ux S6-44: the first month boundary at or after a column, so the year
 * scroller never opens mid-month — with today's column at the right edge the
 * left edge cut May to `y` and 19 to `l9`. The column itself when no month
 * starts at or after it (the year's end: nothing left to snap to).
 */
export function monthStartAtOrAfter(spans: readonly { start: number }[], column: number): number {
  const next = spans.map((s) => s.start).filter((start) => start >= column);
  return next.length === 0 ? column : Math.min(...next);
}

/**
 * ux S6-55: the column the year scroller opens at. Today's column at the right
 * edge, snapped UP to a month start so the left edge captions a whole month
 * (S6-44) — and never so far that the current month's caption falls off the
 * right edge: a narrow row rounds OUT around the month the owner is in rather
 * than in to a boundary. Today stays inside.
 */
export function yearOpening(spans: readonly { start: number; end: number }[], todayColumn: number, viewportColumns: number, captionColumns: number): number {
  const wanted = Math.max(0, todayColumn + 1 - viewportColumns);
  const current = spans.find((s) => todayColumn >= s.start && todayColumn < s.end);
  // the right edge must reach the end of the current month's caption
  const needRight = current == null ? todayColumn + 1 : Math.max(todayColumn + 1, current.start + captionColumns);
  let first = monthStartAtOrAfter(spans, wanted);
  // a wide row: snap up another month rather than break the left edge's month start
  while (first + viewportColumns < needRight) {
    const next = monthStartAtOrAfter(spans, first + 1);
    if (next > todayColumn || next === first) break;
    first = next;
  }
  // a narrow row: round OUT around the current month rather than in to a boundary
  if (first + viewportColumns < needRight) first = Math.max(first, needRight - viewportColumns);
  return Math.max(0, Math.min(first, todayColumn));
}

/** ux S6-55: a caption or a value is drawn only when every column it needs sits
 * inside the window — `Oc` is not a month and `(` is not a count. */
export function columnsFit(start: number, end: number, first: number, viewportColumns: number): boolean {
  return start >= first && end <= first + viewportColumns;
}

/**
 * ux S6-11(c): the floor the Trends body is given on a desktop, so the dialog
 * stands at its own 90% ceiling on every tab and the segmented control never
 * moves. The chrome is `Dialog`'s header — 16px padding, a 20px serif heading
 * on its natural line, 16px padding, a 1px rule — and the body's 16px padding
 * above and below. On a phone the dialog is the screen and needs no floor.
 */
export const TRENDS_DIALOG_CHROME = 16 + 25 + 16 + 1 + 32;

export function trendsBodyHeight(viewportHeight: number, phone: boolean): number | undefined {
  return phone ? undefined : Math.round(viewportHeight * 0.9) - TRENDS_DIALOG_CHROME;
}
