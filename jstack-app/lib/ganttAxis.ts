/**
 * The Gantt's geometry, as arithmetic (G-1, ADR-46; `lib/drag.ts`'s sibling).
 *
 * ONE IDEA HOLDS THIS FILE TOGETHER: **a day is a fixed number of pixels.**
 * Everything else follows. The axis is as wide as the range is long, so a
 * 90-day range is 2,520px and the viewport scrolls (GT-02); a bar's position
 * is which day it starts on rather than a share of whatever the container
 * happens to be; and a drag can be answered in days because a pixel already
 * means one.
 *
 * The Gantt drew in PERCENTAGES until this row, and every complaint about it
 * came from that: the axis printed two captions and a "today" rule because
 * three labels was all that fit in a proportion; a bar could not be dragged
 * because a pixel had no meaning; and F-1 had to write an apology into the
 * file when the range chip said "Next 90 days" over four weeks of track.
 *
 * **No React and no react-native here.** The component measures the scroll
 * offset and wires the responder; what a position MEANS is decided here, where
 * `tests/unit/ganttAxis.test.ts` drives it as numbers. A geometry tested only
 * in a browser is a geometry tested at one pixel ratio — the lesson `drag.ts`
 * already carries.
 *
 * **No date field is read here either** (TD-05, ADR-47). Day keys are strings
 * and `lib/time.ts` owns every conversion; `shiftDays` and `monthLabel` were
 * added there rather than written here for exactly that reason. `getTime()` is
 * the one exception the guard allows, because a millisecond count carries no
 * zone with it.
 */
import { addDays, atTime, dayKey, formatShort, isWeekend, mondayIndex, monthLabel, shiftDays, weekStart } from "@/lib/time";

const MS_PER_DAY = 86_400_000;

/**
 * 28px per day: the narrowest that fits a two-digit date on a week band and
 * still shows a fortnight on a 393px phone (14 × 28 = 392). Wider reads better
 * on a desktop but puts a 90-day range past 3,000px, and the scroll is the
 * thing people complained about having to do.
 */
export const DAY_WIDTH = 28;

/**
 * The narrowest band that can still CARRY its caption (S6-04b).
 *
 * A band's width is arithmetic and its caption's width is not: "30 Sep" is 35px
 * at the meta size whatever the day width is, and the band spends 5 of its own
 * on the hairline and the gap before the label starts. One day of 28px leaves
 * the caption 23, so it wrapped — and a two-line caption in a 16px band hangs
 * through the day ticks and under the now-rule. 44 is that 35 with a quarter
 * again for a font that renders wider, plus the 5 the band spends on itself.
 */
export const MIN_CAPTION_WIDTH = 44;

/** the working day a dropped bar is given (GT-07) — the same 9-to-5 `T-1`'s
 * date field defaults to, so a task scheduled by drag and one scheduled by
 * typing land on the same hours. */
const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 17;

type AxisDay = { key: string; x: number; weekend: boolean };
/** a week or month band: where it starts, how much of it is visible, what it
 * is called. `key` is the band's OWN first day, which may sit before the
 * window — the week of 7 Sep is that week whether or not the 7th is on screen. */
type AxisBand = { key: string; x: number; width: number; label: string };
export type Axis = { from: string; to: string; dayWidth: number; width: number; days: AxisDay[]; weeks: AxisBand[]; months: AxisBand[] };

export type Span = { startsAt: string; endsAt: string };

/** whole days from `from` to `key`, negative before it. Day keys are local
 * dates already, so this is subtraction and not a zone question. */
export function daysBetween(from: string, key: string): number {
  return Math.round((atTime(key, 12).getTime() - atTime(from, 12).getTime()) / MS_PER_DAY);
}

export function xForDay(key: string, from: string, dayWidth = DAY_WIDTH): number {
  return daysBetween(from, key) * dayWidth;
}

/**
 * Where an INSTANT falls, fractionally — the only thing on the axis that is
 * not snapped, and the reason the today line can be true to within 1% instead
 * of jumping to midnight (GT-01).
 */
export function xForInstant(at: string | Date, from: string, dayWidth = DAY_WIDTH): number {
  const ms = (typeof at === "string" ? new Date(at) : at).getTime();
  return ((ms - atTime(from, 0).getTime()) / MS_PER_DAY) * dayWidth;
}

/**
 * Which day a pixel is in. `Math.floor`, not a round, so every pixel of a day
 * belongs to that day and none of them to the next one — and it floors
 * NEGATIVELY too, because a bar dragged left off the window has to keep going
 * left rather than pinning itself to the first visible day.
 */
export function dayForX(x: number, from: string, dayWidth = DAY_WIDTH): string {
  return addDays(from, Math.floor(x / dayWidth));
}

/**
 * A bar covers WHOLE DAYS, end included: a 9-to-5 on one day is one day wide,
 * not the eight twenty-fourths of a day-width its hours would draw. The axis
 * unit is a day, so a bar that did not fill one would be a bar you cannot see
 * on the day it belongs to — and the hours are still there on the card.
 */
export function barGeometry(startsAt: string, endsAt: string, from: string, dayWidth = DAY_WIDTH): { x: number; width: number } {
  const startDay = dayKey(new Date(startsAt));
  const endDay = dayKey(new Date(endsAt));
  const x = xForDay(startDay, from, dayWidth);
  return { x, width: (daysBetween(startDay, endDay) + 1) * dayWidth };
}

/**
 * The visible part of a bar, or `null` when none of it is in the window.
 *
 * A range is a WINDOW, not the whole timeline: a task can start before it opens
 * or end after it closes, and the honest drawing is the part that falls inside,
 * cut at the edge. `barGeometry` deliberately does not do this — the drag needs
 * the bar's true position to compute a day delta from, and a clamped x would
 * make every drag on a clipped bar start from the wrong day.
 *
 * It earned its own function the hard way. Without it a bar starting two days
 * before the window was laid out at x = -56 and painted over the frozen label
 * column beside the chart, where it silently took every tap and drag aimed at
 * the bars underneath — five e2e cases failing with a layout that looked right
 * in a screenshot (BUGLOG_v22.md B-45).
 */
export function clampToWindow(box: { x: number; width: number }, axisWidth: number): { x: number; width: number } | null {
  const left = Math.max(0, box.x);
  const right = Math.min(axisWidth, box.x + box.width);
  return right <= left ? null : { x: left, width: right - left };
}

/** GT-04: a move takes both dates, so the task keeps its length. */
export function moveSpan(span: Span, days: number): Span {
  return { startsAt: shiftDays(span.startsAt, days), endsAt: shiftDays(span.endsAt, days) };
}

/**
 * GT-05: one edge moves and the other does not, and neither may pass the
 * other. Clamped rather than refused — a drag that snaps back tells a person
 * nothing about why, and the limit is obvious once they see the bar stop at
 * one day wide.
 */
export function resizeSpan(span: Span, edge: "start" | "end", days: number): Span {
  if (edge === "end") {
    const moved = shiftDays(span.endsAt, days);
    const startDay = dayKey(new Date(span.startsAt));
    const crossed = daysBetween(startDay, dayKey(new Date(moved))) < 0;
    return { startsAt: span.startsAt, endsAt: crossed ? shiftDays(span.endsAt, daysBetween(dayKey(new Date(span.endsAt)), startDay)) : moved };
  }
  const moved = shiftDays(span.startsAt, days);
  const endDay = dayKey(new Date(span.endsAt));
  const crossed = daysBetween(dayKey(new Date(moved)), endDay) < 0;
  return { startsAt: crossed ? shiftDays(span.startsAt, daysBetween(dayKey(new Date(span.startsAt)), endDay)) : moved, endsAt: span.endsAt };
}

/** GT-07: a task with no dates, dropped on a day, gets that day's working hours. */
export function scheduleOnDay(key: string): Span {
  return { startsAt: atTime(key, DEFAULT_START_HOUR).toISOString(), endsAt: atTime(key, DEFAULT_END_HOUR).toISOString() };
}

/**
 * GT-02's "Fit": the smallest window containing everything scheduled. `null`
 * when nothing is — the caller leaves the range alone rather than snapping to
 * a day that means nothing, because a Fit that jumps to today on an empty
 * board is a control that appears to do something random.
 */
export function fitWindow(spans: Span[]): { from: string; to: string } | null {
  if (spans.length === 0) return null;
  const starts = spans.map((s) => dayKey(new Date(s.startsAt)));
  const ends = spans.map((s) => dayKey(new Date(s.endsAt)));
  // day keys sort lexicographically because they are ISO dates — no parsing
  return { from: starts.slice().sort()[0], to: ends.slice().sort()[ends.length - 1] };
}

/**
 * The compact card's window (ux round S6-24): the union of the bars' own days
 * with `margin` days either side, or `null` when there are no bars — the
 * caller keeps the range's window then, as `fitWindow` leaves the range alone.
 *
 * The mini card drew the ACTIVE RANGE across a fixed track. Ninety days over
 * 308px is 3.4px a day, so four one-day tasks in four different weeks were
 * four identical specks with no axis to tell them apart, and the wider the
 * screen the smaller the bar against its track. A glance at nothing is not a
 * glance. The margin keeps a bar off the track's edge so the first and last
 * days are still visibly days rather than the track's own ends.
 */
export function miniWindow(spans: Span[], margin: number): { from: string; to: string } | null {
  const w = fitWindow(spans);
  return w == null ? null : { from: addDays(w.from, -margin), to: addDays(w.to, margin) };
}

/**
 * S6-24's other half: a bar is never narrower than `minWidth`, and widening
 * it never pushes it past the track's right edge — the bar moves LEFT to stay
 * inside, because a bar that overhangs its track reads as a drawing fault
 * rather than as a task. On a track narrower than the minimum (a first layout
 * has none) the bar stays at 0 and the caller does not draw it anyway.
 */
export function minimumBar(box: { x: number; width: number }, minWidth: number, trackWidth: number): { x: number; width: number } {
  const width = Math.max(minWidth, box.width);
  return { x: Math.max(0, Math.min(box.x, trackWidth - width)), width };
}

/** the visible slice of a band that starts at `bandStart` and runs `length`
 * days, clamped to the window. */
function band(bandStart: string, length: number, from: string, to: string, dayWidth: number, label: string): AxisBand {
  const firstVisible = bandStart < from ? from : bandStart;
  const bandEnd = addDays(bandStart, length - 1);
  const lastVisible = bandEnd > to ? to : bandEnd;
  return {
    key: bandStart,
    x: xForDay(firstVisible, from, dayWidth),
    width: (daysBetween(firstVisible, lastVisible) + 1) * dayWidth,
    label,
  };
}

/**
 * S6-04b: a clipped END band too narrow to carry its caption is ABSORBED by
 * the week beside it, rather than left to wrap.
 *
 * Only the two ends can be narrow — every band between them is a whole week —
 * and each is clipped against exactly one neighbour, so each has exactly one
 * band it can join. The SURVIVING band keeps its own key, x and caption and
 * only grows: the lead band still opens at x 0 captioned with the window's
 * first day, and the tail's neighbour still says its own Monday. Nothing moves
 * off its pixel, which is the property S6-04 bought.
 *
 * What it costs is one hairline — the absorbed band's — at the very edge of
 * the window. A boundary you cannot caption is worth less than a caption you
 * can read, and the day ticks still say where the days are.
 */
function absorbNarrowEnds(bands: AxisBand[]): AxisBand[] {
  if (bands.length < 2) return bands; // a lone band has nothing to join
  const out = bands.slice();
  if (out[0].width < MIN_CAPTION_WIDTH) out.splice(0, 2, { ...out[0], width: out[0].width + out[1].width });
  const last = out.length - 1;
  if (last > 0 && out[last].width < MIN_CAPTION_WIDTH) out.splice(last - 1, 2, { ...out[last - 1], width: out[last - 1].width + out[last].width });
  return out;
}

export function buildAxis(from: string, to: string, dayWidth = DAY_WIDTH): Axis {
  const span = daysBetween(from, to) + 1;
  const days: AxisDay[] = [];
  for (let i = 0; i < span; i++) {
    const key = addDays(from, i);
    days.push({ key, x: i * dayWidth, weekend: isWeekend(key) });
  }

  // A caption is a date at a pixel (ux round S6-04). A band whose Monday sits
  // before the window is KEYED to that Monday — it is still that week, and the
  // spec reads the weekday off the key — but its caption is drawn at x 0, and
  // x 0 is the window's first day, not the Monday. Printing "7 Sep" on the
  // column the ticks said was the 10th put the date three days from the
  // pixel, with the now-rule beside it saying so. So a clipped band is
  // captioned with the window's own first day, which is the WINDOW START
  // caption DISCREPANCIES row 7 asked the axis to carry; every band whose
  // Monday is on the plot keeps that Monday's date.
  const weeks: AxisBand[] = [];
  for (let monday = weekStart(from); monday <= to; monday = addDays(monday, 7)) {
    weeks.push(band(monday, 7, from, to, dayWidth, formatShort(monday < from ? from : monday)));
  }
  // …and a clipped end can be a SINGLE day, which is narrower than the caption
  // it has to carry (S6-04b). The window opens today, so that happens whenever
  // today is a Sunday — one day in seven, which is how three green boards ran
  // either side of it.
  const captioned = absorbNarrowEnds(weeks);

  // months are walked from one 1st to the next rather than by a table of
  // lengths, so February and a leap year are the calendar's problem, not this
  // file's. The band is keyed on the month's own first day even when the
  // window opens mid-month — `AxisBand.key` is the band's first day, always.
  const months: AxisBand[] = [];
  for (let monthFirst = firstOfMonth(from); monthFirst <= to; monthFirst = nextMonth(monthFirst)) {
    months.push(band(monthFirst, daysBetween(monthFirst, nextMonth(monthFirst)), from, to, dayWidth, monthLabel(monthFirst)));
  }

  // MONTHS are not absorbed the same way, and deliberately: a week band's
  // caption is the date of its own first visible day, so a widened band still
  // names where it starts — but a month band's caption names the MONTH, and a
  // September band grown over October's days would caption them "Sep". A
  // month sliver keeps its own band; `GanttAxis` holds it to one line, and the
  // week captions below it carry the month anyway ("5 Oct").
  return { from, to, dayWidth, width: span * dayWidth, days, weeks: captioned, months };
}

/** a day key's own month, from the string — slicing a key is not reading a
 * date field (TD-05 allows it; the guard's own cases say so). */
function firstOfMonth(key: string): string {
  return `${key.slice(0, 8)}01`;
}

/** the first of the month after `monthFirst`: step 28 days, which never
 * overshoots even in February, then walk to the 1st. */
function nextMonth(monthFirst: string): string {
  let d = addDays(monthFirst, 28);
  while (d.slice(8, 10) !== "01") d = addDays(d, 1);
  return d;
}

/**
 * GT-04/GT-05: where a bar DRAWS while a drag is in flight — the whole bar
 * shifted by the days travelled, or one edge moved with the other held, and
 * never narrower than a day. `GanttBar` carried this as a nested ternary in
 * render (F-49, P-13); it is arithmetic, so it is here with the rest.
 */
export function shiftedBox(base: { x: number; width: number }, flight: { edge: "start" | "end" | null; days: number } | null, dayWidth = DAY_WIDTH): { x: number; width: number } {
  if (flight == null) return base;
  const shift = flight.days * dayWidth;
  if (flight.edge === null) return { x: base.x + shift, width: base.width };
  if (flight.edge === "start") return { x: base.x + shift, width: Math.max(dayWidth, base.width - shift) };
  return { x: base.x, width: Math.max(dayWidth, base.width + shift) };
}

/**
 * Which edge a press takes, from WHERE it landed within a bar of `width`:
 * within a handle's width of the left edge is the start, the same of the right
 * edge is the end, anything between is the bar itself. A bar narrower than
 * three handles has no room for two handles and a middle, so the whole of it
 * moves — moving is what a one-day bar is usually for (B-46's design).
 */
export function edgeAtX(x: number, width: number, handleWidth: number): "start" | "end" | null {
  if (width < handleWidth * 3) return null;
  if (x <= handleWidth) return "start";
  if (x >= width - handleWidth) return "end";
  return null;
}
