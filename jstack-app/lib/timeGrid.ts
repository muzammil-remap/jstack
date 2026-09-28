/**
 * The calendar time grid's geometry (S-8).
 *
 * Pulled out of `lib/time.ts` ahead of D-1, which moves every formatter in that
 * file onto the device's zone (ADR-47) and is a smaller, safer change against a
 * smaller file.
 *
 * The split is not arbitrary. Everything left in `lib/time.ts` answers "what
 * time is it, and how is that written"; everything here answers "where does
 * that sit on screen" — pixels, hours of the visible day, the floor a block
 * cannot render below. The first of those is about to change its basis; the
 * second is unaffected by what zone the clock is in, and should not be caught
 * up in a rewrite it has nothing to do with.
 *
 * The UTC getters in `gridPosition` are deliberate and stay: a grid position is
 * arithmetic on an instant already resolved to the day being drawn, not a
 * reading of a wall clock (`tests/unit/date-basis.test.ts`).
 */
import { addDays, addMonths, dayKey, hourOfDay, weekOf } from "@/lib/time";
import type { CalendarView } from "@/data/types";

export const HOUR_START = 6;
export const HOUR_END = 20;
export const PX_PER_HOUR = 24;
export const TRACK_HEIGHT = (HOUR_END - HOUR_START) * PX_PER_HOUR;
export const HOUR_LINE_STEP = 2;
export const MIN_BLOCK_HEIGHT = 12;

/** The day columns a time-grid view shows. */
export function daysFor(view: CalendarView, anchor: string): string[] {
  if (view === "today") return [anchor];
  if (view === "3day") return [0, 1, 2].map((i) => addDays(anchor, i));
  return weekOf(anchor);
}

/**
 * CG-08 anchor step: Today has no navigation; 3-day steps by 3, week by 7,
 * month by one calendar month — all through `lib/time.ts`, matching
 * `rangeFor()` in `data/mock/handlers/calendar.ts`.
 *
 * D-1: day-key arithmetic rather than UTC setters on a parsed midnight, and
 * `isoDate` — a private `toISOString().slice(0, 10)` — went with them. It was
 * the store's own idea of what day an instant falls on, which is the one thing
 * this app is not allowed to have twice (ADR-47).
 *
 * A-2 (v2.3) moved it here from `stores/today.ts`, which needed the room: it is
 * the calendar's arithmetic, and this is the calendar's file.
 */
export function stepAnchor(anchor: string, view: CalendarView, dir: 1 | -1): string {
  if (view === "3day") return addDays(anchor, 3 * dir);
  if (view === "week") return addDays(anchor, 7 * dir);
  if (view === "month") return addMonths(anchor, dir);
  return anchor;
}

/** top/height in px for an event block; height floors at MIN_BLOCK_HEIGHT. */
export function gridPosition(startsAt: string, endsAt: string): { top: number; height: number; showTime: boolean } {
  // D-1: `hourOfDay` rather than two `getUTC*` reads. This file used to be
  // exempt from TD-05's grep guard for these two lines; it does not need to be
  // any more, and an exemption nobody needs is a hole somebody will use.
  const startHour = hourOfDay(startsAt);
  const endHour = hourOfDay(endsAt);
  const top = (startHour - HOUR_START) * PX_PER_HOUR;
  const height = Math.max(MIN_BLOCK_HEIGHT, (endHour - startHour) * PX_PER_HOUR - 2);
  return { top, height, showTime: height >= 36 };
}

/** The events that fall on one day key. */
export function eventsOn<T extends { startsAt: string }>(events: T[], key: string): T[] {
  // D-1: the LOCAL day of the instant, not the UTC date its ISO string
  // starts with. In Brisbane a 9am event is 23:00Z the day before, so the
  // slice put every morning on the previous column and the grid rendered
  // empty for the day it was showing.
  return events.filter((e) => dayKey(new Date(e.startsAt)) === key);
}
