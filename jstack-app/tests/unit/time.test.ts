/**
 * TD-01..TD-05, CG-02..06 — `lib/time.ts`, the one date basis (ADR-47, D-1).
 *
 * The app formats in the DEVICE's zone. That makes a single-zone test suite
 * insufficient by construction: an implementation that quietly used UTC, or
 * one that kept a fixed offset, would agree with the correct one in exactly
 * one zone and disagree everywhere else. So this suite runs TWICE — under
 * `America/New_York` (the default) and under `Australia/Brisbane`
 * (`JSTACK_TZ=Australia/Brisbane pnpm test`, a matrix in `board.yml`) — and
 * every assertion about an INSTANT carries the answer for each.
 *
 * The two zones are chosen for what they disagree about: New York is behind
 * UTC and observes DST, Brisbane is ten hours ahead and never does. The same
 * instant is a different hour, a different day and a different weekday in
 * them, which is precisely what a bad implementation would hide.
 *
 * Everything about a day KEY — arithmetic, weeks, month grids, captions — is
 * the same in both, because a key is already a local date. Those cases have
 * one expectation, and that is not an oversight.
 *
 * Every expected string is written out by hand. Nothing here re-derives an
 * answer from the function under test (hard rule 11) — the point of a date
 * library test is that someone read the calendar and wrote down what a person
 * would see.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  FOLLOW_TODAY,
  addDays,
  addMonths,
  atTime,
  dayKey,
  formatAgo,
  formatDate,
  formatDay,
  formatMonthDay,
  formatShort,
  formatSpan,
  formatTime,
  formatTime12,
  formatWhen,
  habitsWeekCaption,
  hourOfDay,
  isWeekend,
  mondayIndex,
  monthCaption,
  monthDays,
  monthGrid,
  now,
  resolveAnchor,
  setClockOffsetSource,
  shortWeekday,
  threeDayCaption,
  todayKey,
  weekCaption,
  weekOf,
  weekStart,
  weekdayLong,
  weekdayShort,
  zoneName,
} from "@/lib/time";
import { HOUR_START, MIN_BLOCK_HEIGHT, PX_PER_HOUR, daysFor, gridPosition } from "@/lib/timeGrid";

const NEW_YORK = "America/New_York";
const BRISBANE = "Australia/Brisbane";
type Zone = typeof NEW_YORK | typeof BRISBANE;

const ZONE = process.env.TZ as Zone;
/** the expectation for the zone this run is in */
const inZone = <T,>(table: Record<Zone, T>): T => table[ZONE];

/**
 * SM-07 was "the Brisbane basis is UTC+10 all year". ADR-47 retired the basis
 * itself, so the ID has no implementation left to guard — what replaced it is
 * this block: the suite knows which clock it is reading, and the table below
 * asserts the same instant differently in each. The supersession is recorded
 * in `02_ACCEPTANCE_TESTS_v22.md` §4; the ID is named here so `QA_REPORT_v21.md`'s
 * citation still leads a reader to the truth rather than to a deleted case.
 */
describe("TD-01 / SM-07 (superseded) · the suite knows which clock it is reading", () => {
  it("runs in one of the two zones the table below has answers for", () => {
    // If this fails, every instant assertion in this file is worth less than
    // it looks: it would be checking a zone nobody wrote expectations for.
    expect([NEW_YORK, BRISBANE]).toContain(ZONE);
  });

  it("and the platform agrees — the process zone is the zone `Intl` resolves", () => {
    // `TZ` is what Node reads; `zoneName()` is what Settings › General shows.
    // A run where those two disagree would render a zone the app is not
    // actually formatting in, which is TD-07's whole claim.
    expect(zoneName()).toBe(ZONE);
  });

  it("the two zones really do disagree about this instant", () => {
    // the guard's own guard: New York is behind UTC, Brisbane is ten hours
    // ahead, and 04:00Z is midnight in one and mid-afternoon in the other
    expect(hourOfDay("2026-09-04T04:00:00.000Z")).toBe(inZone({ [NEW_YORK]: 0, [BRISBANE]: 14 }));
  });
});

/** 04:00Z — a Friday in both zones, and the anchor every case below uses. */
const NOW = new Date("2026-09-04T04:00:00.000Z");

describe("TD-01 · formatWhen — an instant, as a person would say it", () => {
  it("today, tomorrow and yesterday, in this device's zone", () => {
    // THE case in the acceptance row: one instant, two clocks. 04:14Z is
    // 12:14am on the 4th in New York and 2:14pm on the 4th in Brisbane.
    expect(formatWhen("2026-09-04T04:14:00.000Z", NOW)).toBe(inZone({ [NEW_YORK]: "Today 12:14am", [BRISBANE]: "Today 2:14pm" }));

    // 23:00Z is still the 4th in New York and already the 5th in Brisbane
    expect(formatWhen("2026-09-04T23:00:00.000Z", NOW)).toBe(inZone({ [NEW_YORK]: "Today 7:00pm", [BRISBANE]: "Tomorrow 9:00am" }));

    // and 20:30Z the previous day is yesterday afternoon in one, this
    // morning in the other
    expect(formatWhen("2026-09-03T20:30:00.000Z", NOW)).toBe(inZone({ [NEW_YORK]: "Yesterday 4:30pm", [BRISBANE]: "Today 6:30am" }));
  });

  it("further out it names the day, and only outside this year the year", () => {
    expect(formatWhen("2026-09-10T23:00:00.000Z", NOW)).toBe(inZone({ [NEW_YORK]: "Thu 10 Sep, 7:00pm", [BRISBANE]: "Fri 11 Sep, 9:00am" }));
    expect(formatWhen("2025-09-10T23:00:00.000Z", NOW)).toBe(inZone({ [NEW_YORK]: "10 Sep 2025, 7:00pm", [BRISBANE]: "11 Sep 2025, 9:00am" }));
    // the year boundary is the CURRENT year, not twelve months away
    expect(formatWhen("2026-12-31T04:00:00.000Z", NOW)).toBe(inZone({ [NEW_YORK]: "Wed 30 Dec, 11:00pm", [BRISBANE]: "Thu 31 Dec, 2:00pm" }));
  });

  it("takes a Date as readily as a string — every caller has one or the other", () => {
    expect(formatWhen(new Date("2026-09-04T04:14:00.000Z"), NOW)).toBe(formatWhen("2026-09-04T04:14:00.000Z", NOW));
  });
});

describe("TD-02 · formatSpan and the day-only forms", () => {
  it("a span inside one day keeps one date and two times", () => {
    // built from LOCAL wall times, so the case reads the same in both zones —
    // which is the point: a 9-to-5 day is 9 to 5 wherever you are
    expect(formatSpan(atTime("2026-09-11", 9), atTime("2026-09-11", 17))).toBe("Fri 11 Sep, 9:00am – 5:00pm");
  });

  it("a span across days drops the clock and names both ends", () => {
    expect(formatSpan(atTime("2026-09-11", 9), atTime("2026-09-12", 17))).toBe("Fri 11 – Sat 12 Sep");
    // across a month boundary both months appear, or the first end is a lie
    expect(formatSpan(atTime("2026-08-31", 9), atTime("2026-09-02", 17))).toBe("Mon 31 Aug – Wed 2 Sep");
  });

  it("formatDate is the DAY-ONLY form: weekday inside the year, year outside it", () => {
    expect(formatDate("2026-09-11", NOW)).toBe("Fri 11 Sep");
    expect(formatDate("2025-09-11", NOW)).toBe("11 Sep 2025");
    // no midnight is invented — a due date has no clock in it (resolution #6)
    expect(formatDate("2026-09-11", NOW)).not.toContain("am");
  });
});

describe("TD-03 · formatAgo", () => {
  it("counts up to a day, then hands over to formatWhen", () => {
    const ago = (ms: number) => formatAgo(new Date(NOW.getTime() - ms), NOW);
    expect(ago(30_000)).toBe("just now");
    expect(ago(4 * 60_000)).toBe("4 min ago");
    expect(ago(59 * 60_000)).toBe("59 min ago");
    expect(ago(2 * 3_600_000)).toBe("2 h ago");
    expect(ago(23 * 3_600_000)).toBe("23 h ago");
    // Past a day it hands over, because "37 h ago" is arithmetic the reader
    // has to do. Thirty hours before this instant is yesterday MORNING in
    // Brisbane and two days back in New York — where local "now" is midnight,
    // so nothing more than a day old can be yesterday. Both answers are right,
    // which is the reason the handover exists at all.
    expect(ago(30 * 3_600_000)).toBe(inZone({ [NEW_YORK]: "Wed 2 Sep, 6:00pm", [BRISBANE]: "Yesterday 8:00am" }));
  });

  it("the future is not 'ago'", () => {
    expect(formatAgo(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(inZone({ [NEW_YORK]: "Today 1:00am", [BRISBANE]: "Today 3:00pm" }));
  });
});

describe("TD-01 · the clock forms", () => {
  it("formatTime is 24-hour, formatTime12 is not — both in this device's zone", () => {
    expect(formatTime("2026-09-04T15:00:00.000Z")).toBe(inZone({ [NEW_YORK]: "11:00", [BRISBANE]: "1:00" }));
    expect(formatTime12("2026-09-04T15:00:00.000Z")).toBe(inZone({ [NEW_YORK]: "11:00am", [BRISBANE]: "1:00am" }));
    // midnight and noon are the two a 12-hour clock gets wrong
    expect(formatTime12(atTime("2026-09-04", 0, 30))).toBe("12:30am");
    expect(formatTime12(atTime("2026-09-04", 12))).toBe("12:00pm");
  });

  it("hourOfDay is fractional, and it is what the grid places by", () => {
    expect(hourOfDay(atTime("2026-09-04", 9, 30))).toBe(9.5);
    expect(hourOfDay(atTime("2026-09-04", 0))).toBe(0);
  });
});

describe("TD-07 · the zone has a name", () => {
  it("names the platform's resolved zone, not a constant", () => {
    expect(zoneName()).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/);
    expect(zoneName()).toBe(ZONE);
  });
});

/**
 * TZ-01 was "the suite is running away from Brisbane and UTC" — one foreign
 * zone, asserted process-wide. D-1 replaced it with the two-zone matrix at the
 * top of this file, which is the same intent asked of a device basis. Named
 * here so `QA_REPORT_v21.md`'s citation still lands somewhere true.
 */
describe("TZ-01 (superseded) / TZ-02 · now() and the clock seam", () => {
  afterEach(() => setClockOffsetSource(() => 0));

  it("now() is the real instant, and moves with the injected offset", () => {
    // 04:00Z: the 4th in both zones, so one expectation serves
    const fixed = new Date("2026-09-04T04:00:00.000Z").getTime();
    const spy = jest.spyOn(Date, "now").mockReturnValue(fixed);
    try {
      setClockOffsetSource(() => 0);
      expect(dayKey(now())).toBe("2026-09-04");
      expect(todayKey()).toBe("2026-09-04");

      // push the clock forward far enough to roll the day over in EITHER zone
      setClockOffsetSource(() => 24 * 60 * 60 * 1000);
      expect(todayKey()).toBe("2026-09-05");
    } finally {
      spy.mockRestore();
    }
  });

  it("dayKey reads the LOCAL date of an instant, which is the whole change", () => {
    // 02:00Z on the 4th: still the 3rd in New York, already mid-day on the
    // 4th in Brisbane. A UTC implementation would say the 4th in both.
    expect(dayKey(new Date("2026-09-04T02:00:00.000Z"))).toBe(inZone({ [NEW_YORK]: "2026-09-03", [BRISBANE]: "2026-09-04" }));
  });
});

describe("CD-09 the follow-today anchor", () => {
  it("FOLLOW_TODAY resolves at read time; a real key is left alone", () => {
    expect(FOLLOW_TODAY).toBe("");
    expect(resolveAnchor(FOLLOW_TODAY)).toBe(todayKey());
    expect(resolveAnchor("2026-08-24")).toBe("2026-08-24");
  });
});

describe("CG-02..06 day-key arithmetic (the same in every zone)", () => {
  it("addDays crosses months and years", () => {
    expect(addDays("2026-09-04", 1)).toBe("2026-09-05");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-09-04", 0)).toBe("2026-09-04");
  });

  it("addDays is right across a DST changeover in EITHER hemisphere", () => {
    // 1 Nov 2026 is the US fall-back and 8 Mar 2026 the spring-forward. A
    // millisecond-arithmetic implementation lands on the same calendar day
    // twice at one of them and skips a day at the other; `setDate` cannot.
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
  });

  it("addMonths clamps rather than rolling over", () => {
    expect(addMonths("2026-09-04", 1)).toBe("2026-10-04");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28"); // not 3 March
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("mondayIndex is Monday-first", () => {
    expect(mondayIndex("2026-09-07")).toBe(0); // a Monday
    expect(mondayIndex("2026-09-04")).toBe(4); // a Friday
    expect(mondayIndex("2026-09-06")).toBe(6); // a Sunday
  });

  it("isWeekend is Saturday and Sunday", () => {
    expect(isWeekend("2026-09-04")).toBe(false); // Friday
    expect(isWeekend("2026-09-05")).toBe(true);
    expect(isWeekend("2026-09-06")).toBe(true);
    expect(isWeekend("2026-09-07")).toBe(false); // Monday
  });

  it("weekStart and weekOf run Monday to Sunday", () => {
    expect(weekStart("2026-09-04")).toBe("2026-08-31");
    expect(weekStart("2026-08-31")).toBe("2026-08-31"); // already a Monday
    expect(weekStart("2026-09-06")).toBe("2026-08-31"); // Sunday belongs to the week before
    expect(weekOf("2026-09-04")).toEqual([
      "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06",
    ]);
  });

  it("monthGrid is 35 Monday-first cells that spill both ways", () => {
    const grid = monthGrid("2026-09-04");
    expect(grid).toHaveLength(35);
    expect(grid[0]).toBe("2026-08-31"); // 1 Sep 2026 is a Tuesday
    expect(grid[34]).toBe("2026-10-04");
    expect(mondayIndex(grid[0])).toBe(0);
  });

  it("monthDays is exactly the days of that month", () => {
    const days = monthDays("2026-09-04");
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-09-01");
    expect(days[29]).toBe("2026-09-30");
    expect(monthDays("2026-02-10")).toHaveLength(28);
  });

  it("atTime is a wall clock on a day, wherever the device is", () => {
    const nine = atTime("2026-09-11", 9, 30);
    expect(dayKey(nine)).toBe("2026-09-11");
    expect(formatTime(nine)).toBe("9:30");
  });
});

describe("TD-02 / TZ-03 the strings a person reads (day keys — one answer per zone)", () => {
  it("formatDay / formatMonthDay / formatShort / the weekday forms", () => {
    expect(formatDay("2026-09-04")).toBe("Friday 4 September");
    expect(formatDay("2026-09-03")).toBe("Thursday 3 September");
    expect(formatMonthDay("2026-09-04")).toBe("4 September");
    expect(formatShort("2026-09-19")).toBe("19 Sep");
    expect(formatShort("2026-01-01")).toBe("1 Jan");
    expect(weekdayShort("2026-09-04")).toBe("Fri");
    expect(weekdayLong("2026-09-04")).toBe("Friday");
  });

  it("the calendar captions", () => {
    expect(threeDayCaption("2026-08-28")).toBe("Fri 28 – Sun 30 Aug");
    expect(weekCaption("2026-08-26")).toBe("24 – 30 Aug");
    expect(monthCaption("2026-08-04")).toBe("August 2026");
    expect(habitsWeekCaption("2026-08-26")).toBe("Aug 24 – Aug 30");
  });

  it("a caption spanning two months names the right one at each end", () => {
    expect(weekCaption("2026-09-01")).toBe("31 – 6 Sep");
    expect(habitsWeekCaption("2026-09-01")).toBe("Aug 31 – Sep 6");
  });
});

describe("shortWeekday — the expiry's short day form (ux-review R1-08, R2-06)", () => {
  it("abbreviates every long weekday, in prose, and leaves everything else alone", () => {
    expect(shortWeekday("expires Thursday 5pm · then proposes 1")).toBe("expires Thu 5pm · then proposes 1");
    expect(shortWeekday("expires Tuesday 9am")).toBe("expires Tue 9am");
    expect(shortWeekday("expires Wednesday 5pm · then it goes away")).toBe("expires Wed 5pm · then it goes away");
    expect(shortWeekday("expires Saturday 7am")).toBe("expires Sat 7am");
    expect(shortWeekday("expires Sunday 6pm")).toBe("expires Sun 6pm");
    // already short, a date, or a day inside another word: untouched
    expect(shortWeekday("expires Thu 5pm")).toBe("expires Thu 5pm");
    expect(shortWeekday("expires 19 Sep · then reminds you")).toBe("expires 19 Sep · then reminds you");
    expect(shortWeekday("Mondays are busy")).toBe("Mondays are busy");
  });
});

describe("CG-02..06 the time grid", () => {
  it("daysFor returns the columns each view shows", () => {
    expect(daysFor("today", "2026-09-04")).toEqual(["2026-09-04"]);
    expect(daysFor("3day", "2026-09-04")).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
    expect(daysFor("week", "2026-09-04")).toHaveLength(7);
    expect(daysFor("week", "2026-09-04")[0]).toBe("2026-08-31");
  });

  it("gridPosition places an event by its LOCAL hours and floors the height", () => {
    const at = (h: number, m = 0) => atTime("2026-09-04", h, m).toISOString();
    const hour = gridPosition(at(9), at(10));
    expect(hour.top).toBe((9 - HOUR_START) * PX_PER_HOUR);
    expect(hour.height).toBe(PX_PER_HOUR - 2);
    expect(hour.showTime).toBe(false);

    const half = gridPosition(at(12, 30), at(13));
    expect(half.top).toBe((12.5 - HOUR_START) * PX_PER_HOUR);

    // a five-minute event still gets a tappable block
    expect(gridPosition(at(9), at(9, 5)).height).toBe(MIN_BLOCK_HEIGHT);

    // and a long one shows its time
    expect(gridPosition(at(9), at(11)).showTime).toBe(true);
  });
});

/**
 * TD-05 — the rule that keeps all of the above true.
 *
 * Every previous date basis in this codebase died the same way: one module
 * read a field the others did not. The bug that produced was the Gantt's axis
 * saying `30 Aug │ today │ 27 Sep` beside Today's `Saturday 5 September`, in
 * the same capture run, and it is invisible unless somebody looks at two
 * surfaces at once. A grep is the only guard that scales to "nobody, ever".
 */
describe("TD-05 · nothing outside lib/time.ts touches a Date field", () => {
  const APP_ROOT = join(__dirname, "..", "..");
  /** resolution #62: the app's own source. `tests/`, `e2e/` and `tools/` are
   *  excluded — a test may construct any instant it likes, and a build tool
   *  runs in Node with no user looking at its output. */
  const SCOPE = ["app", "components", "layout", "stores", "lib", "data"];
  const ALLOWED = ["lib/time.ts"];

  /**
   * `getTime` and `setTime` are absent from this list on purpose: they are
   * about the instant, not about a calendar field, and every caller of them is
   * doing arithmetic no zone can change.
   *
   * `toISOString().slice(0, 10)` IS on it, and earned its place the hard way.
   * It is a `dayKey` spelled in UTC, and under a device basis it names the
   * wrong day for ten to fourteen hours out of every twenty-four — which, in
   * Brisbane, emptied the calendar grid, the glance counts and the habit chips
   * for every event before 10am. Seventeen e2e cases found it; this line is so
   * that the eighteenth does not have to.
   */
  const FIELD_ACCESS =
    /\.(?:get|set)(?:UTC)?(?:Hours|Minutes|Seconds|Milliseconds|Date|Day|Month|FullYear|Year)\(|\.getTimezoneOffset\(|\.slice\(11|toISOString\(\)\.slice\(0, ?10\)/;

  /**
   * Blank out every comment, keeping the line numbering intact.
   *
   * Not fastidiousness: the first thing this guard caught was a COMMENT in
   * `Feed.tsx` explaining that the line used to be `.slice(11, 16)` — the
   * sentence that tells the next reader why the code is the way it is. A
   * guard that punishes an explanation teaches people to delete explanations.
   */
  function withoutComments(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  }

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
      else if (/\.tsx?$/.test(entry)) out.push(p);
    }
    return out;
  }

  const files = SCOPE.flatMap((d) => sourceFiles(join(APP_ROOT, d)));

  it("reads a real number of files — a guard over nothing is not a guard", () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it("finds no Date field access anywhere but lib/time.ts", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(APP_ROOT.length + 1).replaceAll("\\", "/");
      if (ALLOWED.includes(rel)) continue;
      withoutComments(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          if (FIELD_ACCESS.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("the pattern is not vacuous — it catches the thing it forbids", () => {
    expect(FIELD_ACCESS.test("const h = d.getUTCHours();")).toBe(true);
    expect(FIELD_ACCESS.test("const h = d.getHours();")).toBe(true);
    expect(FIELD_ACCESS.test("d.setUTCDate(d.getUTCDate() + 1);")).toBe(true);
    expect(FIELD_ACCESS.test("at.slice(11, 16)")).toBe(true);
    expect(FIELD_ACCESS.test("const key = d.toISOString().slice(0, 10);")).toBe(true);
    // and does not catch what it allows
    expect(FIELD_ACCESS.test("const ms = d.getTime();")).toBe(false);
    expect(FIELD_ACCESS.test('const key = iso.slice(0, 10);')).toBe(false);
  });
});
