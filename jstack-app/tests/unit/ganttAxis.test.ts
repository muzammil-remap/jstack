/**
 * GT-01, GT-02, GT-04, GT-05, GT-07 — the Gantt's arithmetic (G-1, ADR-46).
 *
 * The axis is measured in PIXELS PER DAY, not in percentages of whatever the
 * container happens to be. That is the whole reason this file exists: a
 * percentage axis cannot scroll, cannot put a tick on a day, and silently
 * rescales every bar when a lane label changes width — F-1 already had to
 * apologise for a chip that said "Next 90 days" over four weeks of track.
 * A day is a fixed number of pixels; the range decides how many days; if that
 * is wider than the viewport the viewport scrolls (GT-02).
 *
 * Tested as arithmetic rather than through a browser, for `lib/drag.ts`'s
 * reason: a geometry tested only at one viewport is a geometry tested at one
 * pixel ratio. Every expectation below is worked out by hand from a calendar —
 * 7 September 2026 is a Monday — and never re-derived from the function under
 * test (hard rule 11).
 *
 * The suite runs in BOTH zones (`TZ=America/New_York`, then Brisbane). Day-key
 * arithmetic is identical in both because a key is already a local date; the
 * two cases that touch instants say so and hold in each, which is the point of
 * running it twice.
 */
import {
  DAY_WIDTH,
  MIN_CAPTION_WIDTH,
  barGeometry,
  buildAxis,
  clampToWindow,
  dayForX,
  edgeAtX,
  fitWindow,
  miniWindow,
  minimumBar,
  moveSpan,
  resizeSpan,
  scheduleOnDay,
  shiftedBox,
  xForDay,
  xForInstant,
} from "@/lib/ganttAxis";
import { addDays, atTime, dayKey, formatTime } from "@/lib/time";

const MON = "2026-09-07"; // a Monday
const W = 28; // DAY_WIDTH, written out so a change to the constant fails loudly

/**
 * The LOCAL day an instant falls on.
 *
 * Written out because the obvious `iso.slice(0, 10)` is a day key spelled in
 * UTC, and these assertions caught it doing exactly what B-18 says it does:
 * every one of them passed under `America/New_York` and five failed by one day
 * under Brisbane, where 9:00 on the 10th is 23:00 UTC on the 9th. The guard in
 * `time.test.ts` bans that slice in `lib/` and `components/`; it does not scope
 * `tests/`, so the only thing standing between a UTC assumption and a green
 * suite here is running the second zone. It was worth running.
 */
const localDay = (at: string) => dayKey(new Date(at));

describe("GT-01 · the axis is a row of days", () => {
  it("spans from..to inclusive, and is that many days wide", () => {
    const axis = buildAxis(MON, "2026-09-20", W);
    expect(axis.days.length).toBe(14);
    expect(axis.days[0].key).toBe("2026-09-07");
    expect(axis.days[13].key).toBe("2026-09-20");
    expect(axis.width).toBe(14 * W);
  });

  it("each day sits one day-width further along", () => {
    const axis = buildAxis(MON, "2026-09-20", W);
    expect(axis.days[0].x).toBe(0);
    expect(axis.days[1].x).toBe(W);
    expect(axis.days[13].x).toBe(13 * W);
  });

  it("shades Saturdays and Sundays, and nothing else", () => {
    const axis = buildAxis(MON, "2026-09-20", W);
    const weekend = axis.days.filter((d) => d.weekend).map((d) => d.key);
    expect(weekend).toEqual(["2026-09-12", "2026-09-13", "2026-09-19", "2026-09-20"]);
  });

  it("bands the weeks from MONDAY, labelled with that Monday's date", () => {
    const axis = buildAxis(MON, "2026-09-20", W);
    expect(axis.weeks).toEqual([
      { key: "2026-09-07", x: 0, width: 7 * W, label: "7 Sep" },
      { key: "2026-09-14", x: 7 * W, width: 7 * W, label: "14 Sep" },
    ]);
  });

  it("a window starting mid-week gets a SHORT first band, keyed to its Monday and captioned with the day at its own pixel", () => {
    // the band is still the week of 7 Sep — its KEY says so, and GT-01's spec
    // reads the weekday off that key — but its caption is the window's own
    // first day. The caption is drawn at x = 0, and x = 0 is Wednesday the
    // 9th: printing "7 Sep" there put a date on a pixel that is not that
    // date, three days out, with the now-rule beside it saying so (ux round
    // S6-04). DISCREPANCIES row 7's axis names the WINDOW START, and this is
    // it.
    const axis = buildAxis("2026-09-09", "2026-09-20", W);
    expect(axis.weeks).toEqual([
      { key: "2026-09-07", x: 0, width: 5 * W, label: "9 Sep" },
      { key: "2026-09-14", x: 5 * W, width: 7 * W, label: "14 Sep" },
    ]);
  });

  it("the first caption is the date at its pixel: a window opening on Thursday the 10th says '10 Sep' at x 0, not the off-plot Monday (S6-04)", () => {
    // measured on the pass: `7 Sep` stood on the column the ticks said was
    // the 10th, 84px (three days) right of the date it named, and the
    // now-rule crossed it. Every band whose Monday IS on the plot keeps that
    // Monday's date — 14 Sep is still 14 Sep, seven days on.
    const axis = buildAxis("2026-09-10", "2026-09-20", W);
    expect(axis.weeks[0]).toEqual({ key: "2026-09-07", x: 0, width: 4 * W, label: "10 Sep" });
    expect(axis.weeks[1]).toEqual({ key: "2026-09-14", x: 4 * W, width: 7 * W, label: "14 Sep" });
    // a window that opens ON a Monday is captioned with that Monday, as before
    expect(buildAxis(MON, "2026-09-20", W).weeks[0].label).toBe("7 Sep");
  });

  it("S6-04b: a band too narrow to CARRY its caption is merged into the neighbour it was clipped against", () => {
    // Found by the A-6 certifying board, on the one weekday that shows it.
    // A window opens TODAY, so when today is a SUNDAY the lead band is the
    // single last day of its week: 28px, of which the caption gets 23 after
    // the band's hairline and gap. "13 Sep" needs 35, so it WRAPPED — two
    // lines in a 16px band, hanging 13px below it, through the day ticks and
    // under the now-rule S6-04 had just moved clear of the captions. The
    // board was green on the Saturday either side of it, which is why three
    // full boards missed it: the defect is in the calendar, not in the run.
    //
    // The caption is a fixed number of pixels and the band is not, so the
    // band is what gives. A clipped end too narrow to caption is absorbed by
    // the week beside it, keeping that end's own key, x and caption — the
    // lead band still says the window's first day at the window's first pixel,
    // which is S6-04's whole claim.
    const sunday = buildAxis("2026-09-13", "2026-10-04", W); // opens on a Sunday
    expect(sunday.weeks[0]).toEqual({ key: "2026-09-07", x: 0, width: 8 * W, label: "13 Sep" });
    expect(sunday.weeks[1]).toEqual({ key: "2026-09-21", x: 8 * W, width: 7 * W, label: "21 Sep" });

    // and the same at the other end: a window CLOSING on a Monday leaves a
    // one-day tail band, which the week before it absorbs. Its caption is its
    // own Monday's date either way, so nothing moves off its pixel.
    const tail = buildAxis("2026-09-14", "2026-10-05", W); // closes on a Monday
    expect(tail.weeks[tail.weeks.length - 1]).toEqual({ key: "2026-09-28", x: 14 * W, width: 8 * W, label: "28 Sep" });

    // the class, not the two instances: no band on any window may be too
    // narrow for the caption it carries
    for (const from of ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"]) {
      for (const days of [7, 21, 29, 89]) {
        const axis = buildAxis(from, addDays(from, days), W);
        const narrow = axis.weeks.filter((w) => w.width < MIN_CAPTION_WIDTH).map((w) => w.key);
        expect({ from, days, narrow }).toEqual({ from, days, narrow: [] });
      }
    }
  });

  it("labels the months, splitting the band where the month turns", () => {
    // `key` is the band's OWN first day, exactly as it is for a week band that
    // starts before the window — September's band is keyed 1 Sep even though
    // the window opens on the 28th. Only `x` and `width` are clamped to what
    // is visible.
    const axis = buildAxis("2026-09-28", "2026-10-04", W);
    expect(axis.months).toEqual([
      { key: "2026-09-01", x: 0, width: 3 * W, label: "Sep" },
      { key: "2026-10-01", x: 3 * W, width: 4 * W, label: "Oct" },
    ]);
  });
});

describe("GT-01 · where an instant falls, and where a day starts", () => {
  it("a day's x is whole day-widths from the window start", () => {
    expect(xForDay("2026-09-07", MON, W)).toBe(0);
    expect(xForDay("2026-09-10", MON, W)).toBe(3 * W);
  });

  it("an INSTANT is fractional — which is what makes the today line true rather than snapped", () => {
    // noon on the second day is 1.5 day-widths along, in either zone: both
    // sides of the subtraction are local
    expect(xForInstant(atTime("2026-09-08", 12).toISOString(), MON, W)).toBeCloseTo(1.5 * W, 6);
    expect(xForInstant(atTime("2026-09-07", 6).toISOString(), MON, W)).toBeCloseTo(0.25 * W, 6);
  });

  it("the today line lands within 1% of the axis width (GT-01's tolerance), not on a day boundary", () => {
    const axis = buildAxis(MON, "2026-09-20", W);
    const at = atTime("2026-09-13", 18).toISOString();
    const x = xForInstant(at, MON, W);
    const truth = (6 + 18 / 24) * W;
    expect(Math.abs(x - truth)).toBeLessThan(axis.width * 0.01);
    // and it is NOT the snapped position — a snapped "today" is the bug the
    // tolerance exists to catch
    expect(x).not.toBe(xForDay("2026-09-13", MON, W));
  });

  it("a pixel anywhere inside a day snaps to that day (GT-04's day snapping)", () => {
    expect(dayForX(0, MON, W)).toBe("2026-09-07");
    expect(dayForX(W - 1, MON, W)).toBe("2026-09-07");
    expect(dayForX(W, MON, W)).toBe("2026-09-08");
    expect(dayForX(3 * W + 14, MON, W)).toBe("2026-09-10");
  });

  it("a pixel before the window start resolves backwards rather than clamping to day one", () => {
    // dragging a bar left off the visible window must move it left, not pin it
    expect(dayForX(-1, MON, W)).toBe("2026-09-06");
    expect(dayForX(-W, MON, W)).toBe("2026-09-06");
    expect(dayForX(-W - 1, MON, W)).toBe("2026-09-05");
  });
});

describe("GT-01 · a bar occupies whole days", () => {
  it("a task inside one day is one day wide, not nine pixels of a 9-to-5", () => {
    const g = barGeometry(atTime("2026-09-09", 9).toISOString(), atTime("2026-09-09", 17).toISOString(), MON, W);
    expect(g).toEqual({ x: 2 * W, width: W });
  });

  it("a three-day task covers all three days, end included", () => {
    const g = barGeometry(atTime("2026-09-09", 9).toISOString(), atTime("2026-09-11", 17).toISOString(), MON, W);
    expect(g).toEqual({ x: 2 * W, width: 3 * W });
  });
});

/**
 * GT-01 — a bar that runs past the window is CUT at the window, and one that
 * misses it entirely is not drawn.
 *
 * Found by the e2e, not by reasoning: the default range starts TODAY, fixture
 * `t1` started two days earlier, so its bar was laid out at x = -56 and painted
 * straight over the frozen label column — where it swallowed every tap and drag
 * meant for the bars, including its own. `boundingBox()` still reported a
 * sensible-looking rectangle, which is why the symptom was five failing gesture
 * cases and no complaint about the layout (BUGLOG_v22.md B-45).
 */
describe("GT-01 · a bar is clipped to the window it is drawn in", () => {
  const AXIS = 14 * W;

  it("leaves a bar that fits exactly where it is", () => {
    expect(clampToWindow({ x: 2 * W, width: 3 * W }, AXIS)).toEqual({ x: 2 * W, width: 3 * W });
  });

  it("cuts a bar that started before the window at the left edge, keeping the part inside", () => {
    // two days before a window that is 14 long: 3 days of it are visible
    expect(clampToWindow({ x: -2 * W, width: 5 * W }, AXIS)).toEqual({ x: 0, width: 3 * W });
  });

  it("cuts a bar that runs past the right edge", () => {
    expect(clampToWindow({ x: 12 * W, width: 6 * W }, AXIS)).toEqual({ x: 12 * W, width: 2 * W });
  });

  it("does not draw a bar that ends before the window opens", () => {
    expect(clampToWindow({ x: -5 * W, width: 3 * W }, AXIS)).toBeNull();
  });

  it("does not draw a bar that starts after the window closes", () => {
    expect(clampToWindow({ x: 15 * W, width: 3 * W }, AXIS)).toBeNull();
  });

  it("a bar touching the edge exactly is not drawn — zero width is nothing to see", () => {
    expect(clampToWindow({ x: -3 * W, width: 3 * W }, AXIS)).toBeNull();
    expect(clampToWindow({ x: AXIS, width: 2 * W }, AXIS)).toBeNull();
  });
});

describe("GT-04/GT-05 · moving and resizing, in days", () => {
  const span = { startsAt: atTime("2026-09-09", 9).toISOString(), endsAt: atTime("2026-09-11", 17).toISOString() };

  it("a move shifts BOTH dates by the same number of days", () => {
    const moved = moveSpan(span, 3);
    expect(localDay(moved.startsAt)).toBe("2026-09-12");
    expect(localDay(moved.endsAt)).toBe("2026-09-14");
  });

  it("a move keeps the wall-clock time it had — across a DST boundary too", () => {
    // 1 November 2026 is when New York leaves DST; Brisbane never does. A
    // shift that added 86,400,000ms per day would print 8:00 on one side of
    // that date and 9:00 on the other, in one zone only (B-20's family).
    const autumn = { startsAt: atTime("2026-10-30", 9).toISOString(), endsAt: atTime("2026-10-30", 17).toISOString() };
    const moved = moveSpan(autumn, 3);
    expect(localDay(moved.startsAt)).toBe("2026-11-02");
    expect(formatTime(moved.startsAt)).toBe("9:00");
    expect(formatTime(moved.endsAt)).toBe("17:00");
  });

  it("resizing the end moves only the end", () => {
    const r = resizeSpan(span, "end", 2);
    expect(r.startsAt).toBe(span.startsAt);
    expect(localDay(r.endsAt)).toBe("2026-09-13");
  });

  it("resizing the start moves only the start", () => {
    const r = resizeSpan(span, "start", -2);
    expect(r.endsAt).toBe(span.endsAt);
    expect(localDay(r.startsAt)).toBe("2026-09-07");
  });

  it("the end cannot cross the start — it stops on the start's day", () => {
    const r = resizeSpan(span, "end", -10);
    expect(localDay(r.endsAt)).toBe("2026-09-09");
    expect(r.startsAt).toBe(span.startsAt);
  });

  it("nor can the start cross the end", () => {
    const r = resizeSpan(span, "start", 10);
    expect(localDay(r.startsAt)).toBe("2026-09-11");
    expect(r.endsAt).toBe(span.endsAt);
  });
});

describe("GT-07 · scheduling something that had no dates", () => {
  it("a drop on a day schedules it 9:00 to 17:00 on that day", () => {
    const s = scheduleOnDay("2026-09-10");
    expect(localDay(s.startsAt)).toBe("2026-09-10");
    expect(formatTime(s.startsAt)).toBe("9:00");
    expect(formatTime(s.endsAt)).toBe("17:00");
  });
});

describe("GT-02 · Fit", () => {
  it("snaps the window to the first and last day anything is scheduled on", () => {
    const w = fitWindow([
      { startsAt: atTime("2026-09-09", 9).toISOString(), endsAt: atTime("2026-09-11", 17).toISOString() },
      { startsAt: atTime("2026-09-04", 9).toISOString(), endsAt: atTime("2026-09-05", 17).toISOString() },
    ]);
    expect(w).toEqual({ from: "2026-09-04", to: "2026-09-11" });
  });

  it("has nothing to fit to when nothing is scheduled, and says so rather than inventing today", () => {
    expect(fitWindow([])).toBeNull();
  });
});

/**
 * S6-24 (ux round, Stage 6) — the compact card's own window.
 *
 * The mini Gantt drew the ACTIVE RANGE on a fixed track: 90 days across 308px
 * is 3.4px a day, so four one-day tasks in four different weeks were four
 * identical specks with no axis to tell them apart. The card is a glance, and
 * a glance at nothing is not one. So the track is the union of the bars' own
 * days plus a margin either side, a bar is never narrower than the minimum
 * the caller asks for, and the two ends of the track are dated.
 */
describe("S6-24 · the compact card's window is the bars' own, and a bar is never a speck", () => {
  const day = (key: string) => ({ startsAt: atTime(key, 9).toISOString(), endsAt: atTime(key, 17).toISOString() });

  it("the window is the union of the bars' days with a margin either side", () => {
    expect(miniWindow([day("2026-09-10"), day("2026-09-13"), day("2026-09-16")], 1)).toEqual({ from: "2026-09-09", to: "2026-09-17" });
    // a single day still gets a track it can be seen on
    expect(miniWindow([day("2026-09-10")], 1)).toEqual({ from: "2026-09-09", to: "2026-09-11" });
    // the margin is the caller's number, not this file's
    expect(miniWindow([day("2026-09-10")], 3)).toEqual({ from: "2026-09-07", to: "2026-09-13" });
  });

  it("no bars, no window — the caller keeps the range's own rather than inventing one", () => {
    expect(miniWindow([], 1)).toBeNull();
  });

  it("a bar narrower than the minimum is widened to it, one already wider is left alone", () => {
    expect(minimumBar({ x: 100, width: 3.4 }, 6, 308)).toEqual({ x: 100, width: 6 });
    expect(minimumBar({ x: 100, width: 40 }, 6, 308)).toEqual({ x: 100, width: 40 });
  });

  it("widening a bar at the track's right edge pulls it back inside rather than past the end", () => {
    expect(minimumBar({ x: 305, width: 3 }, 6, 308)).toEqual({ x: 302, width: 6 });
    // and never past the LEFT edge on a track narrower than the minimum
    expect(minimumBar({ x: 0, width: 1 }, 6, 4)).toEqual({ x: 0, width: 6 });
  });
});

describe("the constant the pack is drawn to", () => {
  it("DAY_WIDTH is what every expectation above was worked out against", () => {
    expect(DAY_WIDTH).toBe(W);
  });
});

describe("GT-04/GT-05 · where a bar draws while a drag is in flight, and which edge a press takes (P-13, F-49)", () => {
  const base = { x: 100, width: 3 * DAY_WIDTH };
  it("nothing in flight draws the bar where it is", () => {
    expect(shiftedBox(base, null)).toBe(base);
  });
  it("a move shifts the whole bar by the days travelled and keeps its width", () => {
    expect(shiftedBox(base, { edge: null, days: 2 })).toEqual({ x: 100 + 2 * DAY_WIDTH, width: 3 * DAY_WIDTH });
  });
  it("the start edge moves and the end holds; the end edge moves and the start holds; neither goes under a day", () => {
    expect(shiftedBox(base, { edge: "start", days: 1 })).toEqual({ x: 100 + DAY_WIDTH, width: 2 * DAY_WIDTH });
    expect(shiftedBox(base, { edge: "end", days: -1 })).toEqual({ x: 100, width: 2 * DAY_WIDTH });
    expect(shiftedBox(base, { edge: "start", days: 5 })).toEqual({ x: 100 + 5 * DAY_WIDTH, width: DAY_WIDTH });
    expect(shiftedBox(base, { edge: "end", days: -5 })).toEqual({ x: 100, width: DAY_WIDTH });
  });
  it("a press within a handle of either edge takes that edge; the middle takes the bar; a one-day bar has no edges", () => {
    expect(edgeAtX(4, 100, 12)).toBe("start");
    expect(edgeAtX(95, 100, 12)).toBe("end");
    expect(edgeAtX(50, 100, 12)).toBeNull();
    expect(edgeAtX(2, 30, 12)).toBeNull();
  });
});
