/**
 * One time library, one basis: **the device's own time zone** (ADR-47, D-1).
 *
 * This replaces `lib/date-utils.ts`, `lib/calendarMath.ts` and `lib/clock.ts`,
 * which between them ran two date bases, and then replaces V2.1's answer to
 * that — a fixed Brisbane offset held in a `Date`'s UTC fields. Both of those
 * were the same shape of decision: pick one zone for everybody and make every
 * reader agree. Josh's is simpler and truer. "Device set timezone now."
 *
 * ## The one rule
 *
 * Every instant on the wire is a real instant (ISO with an offset). Every
 * rendered day, hour and caption is that instant read in the DEVICE's zone,
 * through the platform's own local getters — which follow the zone and its
 * daylight saving without anybody computing an offset. `Intl` is used once,
 * to NAME the zone for Settings › General, and never to do arithmetic.
 *
 * Nothing outside this file touches a `Date` getter. That is a grep guard
 * (`tests/unit/time.test.ts`, TD-05), not a convention: the previous two
 * bases both died of one module reading a field the others did not, and the
 * bug it produced — the Gantt's axis saying `30 Aug │ today │ 27 Sep` beside
 * Today's `Saturday 5 September`, in the same capture run — is invisible
 * until somebody looks at two surfaces at once.
 *
 * ## What the server sends
 *
 * Instants, and label PARTS. No clock string is composed anywhere on the wire
 * (`Task.metaParts`, `FeedEvent.at`, `Activity.at`, `LatestIn.at`), so there
 * is no server prose to disagree with the device — which is what retired
 * §1.11's Brisbane rule for server strings: there are none left.
 *
 * ## Testing it
 *
 * The formatter table runs twice, under `TZ=America/New_York` and
 * `JSTACK_TZ=Australia/Brisbane`, asserting the wall clock each zone should
 * show for the SAME instant (TD-01). Playwright pins
 * `timezoneId: "Australia/Brisbane"` on every project and one case overrides
 * it to Los Angeles. A mocked offset would have tested the mock.
 */

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * The clock offset seam, injected rather than imported.
 *
 * `lib/clock.ts` read `useSessionStore` directly, which was fine while
 * nothing else imported it. This module has to be usable from
 * `data/mock/db.ts` as well, and `stores/session.ts` imports
 * `@/data/provider` → the mock server → its handlers → `db.ts`: importing
 * the store here would close that ring. Keeping this file free of app
 * imports also keeps it trivially testable, which matters for the one file
 * every rendered date in the app now goes through.
 *
 * `stores/session.ts` registers the real source at module load. The mock uses
 * its own (`db.clockOffsetMs`) for the same reason.
 */
let readOffsetMs: () => number = () => 0;

export function setClockOffsetSource(source: () => number): void {
  readOffsetMs = source;
}

/**
 * Now, through the test clock offset — a real instant, not a shifted one.
 *
 * Every surface must call this rather than `new Date()`: the rig moves the
 * clock to drive TD-13's 14:00 escalation and the undo window, and a surface
 * reading the real clock would disagree with the rest of the app for the
 * length of the test.
 */
export function now(): Date {
  return new Date(Date.now() + readOffsetMs());
}

/** The device's zone, for Settings › General (TD-07). The ONE `Intl` call in
 *  the app — naming, never arithmetic. */
export function zoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// ---------------------------------------------------------------- day keys

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" for an instant, read in the device's zone. */
export function dayKey(d: Date = now()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's day key, on this device. */
export function todayKey(): string {
  return dayKey(now());
}

/**
 * A day key back to local midnight.
 *
 * `new Date(y, m, d)` rather than `new Date("…T00:00:00")`: the string form is
 * parsed as local time by every engine we ship on, but the component form says
 * so rather than relying on it, and it is the same call `addDays` walks with.
 */
function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Day-key arithmetic. Keys, not Dates, because every caller wants a key back
 * and a round trip through a Date is where an off-by-one creeps in.
 *
 * `setDate`, never `+ n * DAY_MS`: a device in a DST zone has 23- and 25-hour
 * days, and adding milliseconds across one of them lands on the wrong date.
 * The old fixed-offset basis could get away with the arithmetic; this cannot.
 */
export function addDays(key: string, days: number): string {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

/**
 * The same key n calendar months later, clamped to the end of the month —
 * 31 January plus one month is 28 February, not 3 March.
 *
 * `setMonth` alone rolls over, which is how a "next month" button on the 31st
 * skips a month entirely. The clamp is one line and the bug it prevents is
 * invisible for eleven months of the year.
 */
export function addMonths(key: string, months: number): string {
  const d = fromDayKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastOfMonth));
  return dayKey(d);
}

/** Mon=0 … Sun=6, the order every calendar surface in this app uses. */
export function mondayIndex(key: string): number {
  return (fromDayKey(key).getDay() + 6) % 7;
}

/** The Monday of the week containing `key`. */
export function weekStart(key: string): string {
  return addDays(key, -mondayIndex(key));
}

/** The seven day keys of the week containing `key`, Monday first. */
export function weekOf(key: string): string[] {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function monthStart(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

/** The 5×7 month grid — 35 keys, Monday-first, spilling into the
 * neighbouring months at both ends. */
export function monthGrid(key: string): string[] {
  const start = weekStart(monthStart(key));
  return Array.from({ length: 35 }, (_, i) => addDays(start, i));
}

/** Every day key in the calendar month containing `key`. */
export function monthDays(key: string): string[] {
  const start = monthStart(key);
  const out: string[] = [];
  for (let d = start; d.slice(0, 7) === key.slice(0, 7); d = addDays(d, 1)) out.push(d);
  return out;
}

// ------------------------------------------------------------- the anchor

/**
 * The anchor value meaning "the period containing TODAY", resolved on every
 * read rather than baked in once (CD-09).
 *
 * ux-review R14-D1/R14-D2: the calendar and habits stores seeded their range
 * anchors with today's key inside zustand's `create()` initialiser. That
 * literal evaluates at MODULE LOAD, strictly before any clock offset can be
 * installed, so a week window derived from it was pinned to the machine's
 * real date for the life of the process however the seam was moved. The demo
 * captured `Tuesday 25 August` in the header beside a `31 – 6 Sep` board with
 * none of its data in range.
 *
 * A stored anchor is now only ever a week the user actually navigated to.
 */
export const FOLLOW_TODAY = "";

export function resolveAnchor(anchor: string): string {
  return anchor === FOLLOW_TODAY ? todayKey() : anchor;
}

// -------------------------------------------------------------- formatting

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_ABBR = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const dayNum = (key: string) => fromDayKey(key).getDate();
const monthNum = (key: string) => fromDayKey(key).getMonth();
const yearNum = (key: string) => fromDayKey(key).getFullYear();

/** "Thursday 4 September" — README Content's long form, for the Today header. */
export function formatDay(key: string): string {
  return `${DAY_FULL[mondayIndex(key)]} ${dayNum(key)} ${MONTH_FULL[monthNum(key)]}`;
}

/**
 * A DAY-ONLY value: "Thu 11 Sep" this year, "11 Sep 2025" outside it (TD-02,
 * resolution #6).
 *
 * `due` day keys, `Goal.targetDate` and the range chip go through here rather
 * than through `formatWhen` with an invented midnight — a due date has no
 * clock, and printing "Thu 11 Sep, 12:00am" would be the app making one up.
 * The weekday is in it because that is what Josh plans by; the year appears
 * only when it is not the current one, because a year on every date is noise.
 */
export function formatDate(key: string, nowDate: Date = now()): string {
  const day = `${dayNum(key)} ${MONTH_LABELS[monthNum(key)]}`;
  if (yearNum(key) !== nowDate.getFullYear()) return `${day} ${yearNum(key)}`;
  return `${DAY_LABELS[mondayIndex(key)]} ${day}`;
}

/** "19 Sep" — the abbreviated form the pack uses in card titles and axis
 * ticks, with no weekday and no year (R23-01: one basis, two renderings). */
export function formatShort(key: string): string {
  return `${dayNum(key)} ${MONTH_LABELS[monthNum(key)]}`;
}

/** "15:00" — 24-hour, which is what README Content specifies for lists and
 * the calendar rails. */
export function formatTime(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

/**
 * The fractional hour of a day, in the device's zone — 9:30am is 9.5.
 *
 * The calendar grid and `lib/timeGrid.ts` place a box by multiplying this by
 * a pixel height, so it is arithmetic rather than formatting; it lives here
 * anyway, because "which hour is this instant" is exactly the question the
 * zone answers and the two callers reading it themselves is how the grid and
 * the header came to disagree once already.
 */
export function hourOfDay(at: string | Date): number {
  const d = typeof at === "string" ? new Date(at) : at;
  return d.getHours() + d.getMinutes() / 60;
}

/** "3:00pm" — the 12-hour form, for prose that reads better with one. */
export function formatTime12(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const h = d.getHours();
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(d.getMinutes())}${suffix}`;
}

/**
 * An instant, as a person would say it (TD-01): "Today 2:14pm", "Tomorrow
 * 9:00am", "Yesterday 4:30pm", "Thu 11 Sep, 9:00am" inside the year,
 * "11 Sep 2025, 9:00am" outside it.
 *
 * Relative words stop at yesterday/tomorrow on purpose (ADR-47's rejects):
 * "in 3 days" hides the weekday, and the weekday is what a week is planned
 * by. Everything on screen that carries a time goes through here, so two
 * surfaces cannot describe the same instant differently.
 */
export function formatWhen(at: string | Date, nowDate: Date = now()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const key = dayKey(d);
  const today = dayKey(nowDate);
  const time = formatTime12(d);
  if (key === today) return `Today ${time}`;
  if (key === addDays(today, 1)) return `Tomorrow ${time}`;
  if (key === addDays(today, -1)) return `Yesterday ${time}`;
  if (yearNum(key) !== nowDate.getFullYear()) return `${dayNum(key)} ${MONTH_LABELS[monthNum(key)]} ${yearNum(key)}, ${time}`;
  return `${DAY_LABELS[mondayIndex(key)]} ${dayNum(key)} ${MONTH_LABELS[monthNum(key)]}, ${time}`;
}

/**
 * A span (TD-02): "Thu 11 Sep, 9:00am – 5:00pm" within one day, "Thu 11 –
 * Fri 12 Sep" across days.
 *
 * The multi-day form drops the clock deliberately. A three-day task does not
 * start at a minute anyone cares about, and "Thu 11 Sep, 9:00am – Fri 12 Sep,
 * 5:00pm" is a line nobody reads to the end of.
 */
export function formatSpan(startsAt: string | Date, endsAt: string | Date): string {
  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  const startKey = dayKey(start);
  const endKey = dayKey(end);
  if (startKey === endKey) {
    return `${DAY_LABELS[mondayIndex(startKey)]} ${dayNum(startKey)} ${MONTH_LABELS[monthNum(startKey)]}, ${formatTime12(start)} – ${formatTime12(end)}`;
  }
  const sameMonth = monthNum(startKey) === monthNum(endKey) && yearNum(startKey) === yearNum(endKey);
  const startPart = `${DAY_LABELS[mondayIndex(startKey)]} ${dayNum(startKey)}${sameMonth ? "" : ` ${MONTH_LABELS[monthNum(startKey)]}`}`;
  return `${startPart} – ${DAY_LABELS[mondayIndex(endKey)]} ${dayNum(endKey)} ${MONTH_LABELS[monthNum(endKey)]}`;
}

/**
 * How long ago (TD-03): "just now", "4 min ago", "2 h ago", and past a day it
 * hands over to `formatWhen` — because "37 h ago" is arithmetic a reader has
 * to do, and "Yesterday 4:30pm" is not.
 */
export function formatAgo(at: string | Date, nowDate: Date = now()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const ms = nowDate.getTime() - d.getTime();
  if (ms < 0) return formatWhen(d, nowDate); // the future is not "ago"
  if (ms < MIN_MS) return "just now";
  if (ms < HOUR_MS) return `${Math.floor(ms / MIN_MS)} min ago`;
  if (ms < DAY_MS) return `${Math.floor(ms / HOUR_MS)} h ago`;
  return formatWhen(d, nowDate);
}

/** "Fri 28 – Sun 30 Aug" */
export function threeDayCaption(key: string): string {
  const end = addDays(key, 2);
  return `${DAY_LABELS[mondayIndex(key)]} ${dayNum(key)} – ${DAY_LABELS[mondayIndex(end)]} ${dayNum(end)} ${MONTH_LABELS[monthNum(end)]}`;
}

/** "24 – 30 Aug" */
export function weekCaption(key: string): string {
  const start = weekStart(key);
  const end = addDays(start, 6);
  return `${dayNum(start)} – ${dayNum(end)} ${MONTH_LABELS[monthNum(end)]}`;
}

/** "August 2026" */
export function monthCaption(key: string): string {
  return `${MONTH_FULL[monthNum(key)]} ${yearNum(key)}`;
}

/** "Aug 24 – Aug 30" */
export function habitsWeekCaption(key: string): string {
  const start = weekStart(key);
  const end = addDays(start, 6);
  return `${MONTH_LABELS[monthNum(start)]} ${dayNum(start)} – ${MONTH_LABELS[monthNum(end)]} ${dayNum(end)}`;
}

/** "Thu" — the short weekday alone, for an axis tick or a fixture token. */
export function weekdayShort(key: string): string {
  return DAY_LABELS[mondayIndex(key)];
}

/** "Thursday" — the long weekday alone. */
export function weekdayLong(key: string): string {
  return DAY_FULL[mondayIndex(key)];
}

/** "4 September" — the long day-and-month, with no weekday and no year. */
export function formatMonthDay(key: string): string {
  return `${dayNum(key)} ${MONTH_FULL[monthNum(key)]}`;
}

/** "Sep" — the month alone, for the Gantt's month band (G-1, GT-01), where the
 *  day is already written on the week band underneath it. */
export function monthLabel(key: string): string {
  return MONTH_LABELS[monthNum(key)];
}

/**
 * The same wall-clock time, `days` days later (G-1, GT-04/GT-05).
 *
 * Here rather than in `lib/ganttAxis.ts` because it is the one part of moving
 * a Gantt bar that reads a date field, and TD-05's guard is absolute: no file
 * but this one touches one. It also has to be, to be correct — adding
 * `days * 86_400_000` to an instant is right for exactly as long as no clock
 * changes underneath it. Dragging a task from 30 October to 2 November in New
 * York would have moved a 9:00 start to 8:00, in one zone, on two days of the
 * year (the family B-20 came from). Going through the day key and re-applying
 * the wall time cannot drift, because a key is already a local date.
 */
export function shiftDays(at: string | Date, days: number): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return atTime(addDays(dayKey(d), days), d.getHours(), d.getMinutes()).toISOString();
}

/** Saturday or Sunday. The mock's fixtures use it to keep a school pickup off
 *  a weekend (CD-18); nothing about a weekend is a display concern, but the
 *  answer depends on the zone, so it belongs here with everything else that
 *  reads a date field. */
export function isWeekend(key: string): boolean {
  return mondayIndex(key) >= 5;
}

/**
 * An instant at a wall-clock time on a given day, in the device's zone —
 * `atTime("2026-09-11", 9, 0)` is 9am that morning, wherever the device is.
 *
 * This is the one constructor the mock's fixture tokens need (`{{NOW;09:00}}`,
 * `{{SCHOOLDAY+1;08:31}}`): a template says a wall-clock time and the server
 * has to turn it into an instant. Here rather than there so the grep guard
 * stays absolute — no file but this one touches a `Date` field (TD-05).
 */
export function atTime(key: string, hours: number, minutes = 0): Date {
  const d = fromDayKey(key);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

const LONG_WEEKDAY = /\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b/g;
const SHORT_STEM: Record<string, string> = { Tues: "Tue", Wednes: "Wed", Thurs: "Thu", Satur: "Sat" };

/**
 * A long weekday in prose becomes the pack's short one — "expires Thursday
 * 5pm · then proposes 1" → "expires Thu 5pm · then proposes 1". The mock
 * composes expiry text with the long day (CD-18, `{{WEEKDAY:expiresAt}}`)
 * and README Content's one worked example is short ("expires Wed 5pm ·
 * then proposes 1"), so the app shortens wherever it shows an expiry: the
 * waiting row (ux-review R1-08) and the open card (R2-06). A backend that
 * sends the long form is shortened the same way. "Mondays" is not a day.
 */
export function shortWeekday(text: string): string {
  return text.replace(LONG_WEEKDAY, (_m, stem: string) => SHORT_STEM[stem] ?? stem);
}
