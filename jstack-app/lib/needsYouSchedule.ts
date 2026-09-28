/**
 * needsYouSchedule.ts (WPS-1, v2.3.2) — when Today raises Needs you.
 *
 * Josh: "add 'needs you' schedule to be adjustable, in the settings schedule like all the others". The schedule is
 * a field of quiet hours' record (`QuietHours.needsYou`, `GET/PUT /settings/quiet-hours`): the windows of the day
 * Needs you is raised in, whether these quiet hours hold it too, and paused. This file answers the one question
 * Today and the keys ask of it — do the cards wait now, and until when — and reads and writes the windows the way
 * Settings shows them.
 *
 * Every time of day is the device's zone (ADR-47): a window is `HH:MM` to `HH:MM`, an end before its start runs
 * past midnight as quiet hours do, and the instants come from `lib/time.ts`'s `atTime`, so nothing here reads a
 * date field (TD-05).
 *
 * Nothing waits unless a schedule says so: a record with no schedule, or a paused one, raises the cards as they
 * come, as before there was a schedule; and a schedule that can never open — no window, or every window inside
 * quiet hours — holds nothing, so no card is hidden for good.
 */
import type { QuietHours } from "@/data/types";
import { addDays, atTime, dayKey } from "@/lib/time";

type NeedsYouSchedule = NonNullable<QuietHours["needsYou"]>;
type NeedsYouWindow = NeedsYouSchedule["windows"][number];
/** whether the cards wait, the next time they are raised, and the next moment either answer can change */
type NeedsYouHold = { held: boolean; nextAt: Date | null; changesAt: Date | null };

const NOTHING_WAITS: NeedsYouHold = { held: false, nextAt: null, changesAt: null };
const TIME_OF_DAY = /^(\d{1,2}):(\d{2})$/;

/**
 * What Settings shows for a quiet-hours record that carries no schedule yet: paused, so nothing waits until it is
 * resumed, at the 8am and 4pm the mock's Needs you already batches at.
 */
export const PAUSED_SCHEDULE: NeedsYouSchedule = {
  windows: [
    { start: "08:00", end: "09:00" },
    { start: "16:00", end: "17:00" },
  ],
  respectsQuietHours: true,
  paused: true,
};

/** "8:00" or "08:00" → minutes after midnight; null for anything that is not a time of day */
function minutesOf(hhmm: string): number | null {
  const m = TIME_OF_DAY.exec(hhmm.trim());
  if (m == null) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** the stored form, `08:00` */
const storedTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
/** the Schedules card's form, `8:00` — the way `Voice.tsx` shows the brief's time */
function shownTime(hhmm: string): string {
  const minutes = minutesOf(hhmm);
  return minutes == null ? hhmm : `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

type Span = [from: number, to: number];

/** the stretch of a day key between two times of day, as instants: [from, to), running into the next day when `end` is not after `start` */
function spanOn(key: string, start: number, end: number): Span {
  const from = atTime(key, Math.floor(start / 60), start % 60).getTime();
  const to = atTime(end <= start ? addDays(key, 1) : key, Math.floor(end / 60), end % 60).getTime();
  return [from, to];
}

const within = (t: number, spans: Span[]) => spans.some(([from, to]) => from <= t && t < to);

/**
 * Do the cards wait at `at`, and until when.
 *
 * Open is inside a window and, when the schedule respects them, outside these quiet hours. The next raise is the
 * first open moment after `at`, and that can only be a window's start or quiet hours' end — so those are the
 * candidates, over the day before and the two after, which covers any pattern that repeats daily.
 */
export function needsYouHold(quietHours: QuietHours | null, at: Date): NeedsYouHold {
  const schedule = quietHours?.needsYou;
  if (quietHours == null || schedule == null || schedule.paused) return NOTHING_WAITS;
  const windows = schedule.windows.flatMap((w): [number, number][] => {
    const start = minutesOf(w.start);
    const end = minutesOf(w.end);
    return start != null && end != null && start !== end ? [[start, end]] : [];
  });
  if (windows.length === 0) return NOTHING_WAITS;
  const quietStart = schedule.respectsQuietHours ? minutesOf(quietHours.start) : null;
  const quietEnd = schedule.respectsQuietHours ? minutesOf(quietHours.end) : null;

  const today = dayKey(at);
  const days = [-1, 0, 1, 2].map((n) => addDays(today, n));
  const windowSpans = days.flatMap((key) => windows.map(([start, end]) => spanOn(key, start, end)));
  const quietSpans = quietStart != null && quietEnd != null && quietStart !== quietEnd ? days.map((key) => spanOn(key, quietStart, quietEnd)) : [];
  const open = (t: number) => within(t, windowSpans) && !within(t, quietSpans);

  const now = at.getTime();
  const after = (ts: number[]) => ts.filter((t) => t > now).sort((a, b) => a - b);
  const next = after([...windowSpans.map(([from]) => from), ...quietSpans.map(([, to]) => to)]).find(open);
  if (next == null) return NOTHING_WAITS;
  const changesAt = new Date(after([...windowSpans, ...quietSpans].flat())[0]);
  return open(now) ? { held: false, nextAt: null, changesAt } : { held: true, nextAt: new Date(next), changesAt };
}

/** "8:00–9:00, 12:30-13:30" → the windows as stored; null when any part is not a window, or there is none */
export function parseWindows(text: string): NeedsYouWindow[] | null {
  const parts = text.split(",").map((part) => part.trim()).filter((part) => part !== "");
  if (parts.length === 0) return null;
  const windows: NeedsYouWindow[] = [];
  for (const part of parts) {
    const ends = part.split(/\s*[–-]\s*/);
    const start = ends.length === 2 ? minutesOf(ends[0]) : null;
    const end = ends.length === 2 ? minutesOf(ends[1]) : null;
    if (start == null || end == null || start === end) return null;
    windows.push({ start: storedTime(start), end: storedTime(end) });
  }
  return windows;
}

/** the windows as Settings' field shows them: "8:00–9:00, 16:00–17:00" */
export function windowsText(windows: NeedsYouWindow[]): string {
  return windows.map((w) => `${shownTime(w.start)}–${shownTime(w.end)}`).join(", ");
}

/** the times it is raised, for the Schedules row's cadence: "8:00 · 16:00" */
export function raiseTimesText(windows: NeedsYouWindow[]): string {
  return windows.map((w) => shownTime(w.start)).join(" · ");
}
