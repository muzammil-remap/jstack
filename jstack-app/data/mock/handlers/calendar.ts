/** §4.4 Calendar. */
import { addDays, addMonths, atTime, dayKey } from "@/lib/time";
import * as db from "@/data/mock/db";
import { err, inFocus, ok } from "@/data/mock/util";
import type { FreeGap } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 20;
const MIN_GAP_MINUTES = 60;

function rangeFor(view: string, anchor: string): { start: Date; end: Date } {
  // D-1: local midnight to local midnight. The window a person means by "this
  // week" is their own week, and comparing instants against a UTC midnight put
  // the boundary ten hours into the wrong day for a Brisbane reader.
  const endKey = view === "3day" ? addDays(anchor, 3) : view === "week" ? addDays(anchor, 7) : view === "month" ? addMonths(anchor, 1) : addDays(anchor, 1);
  return { start: atTime(anchor, 0), end: atTime(endKey, 0) };
}

/** TD-04's free gaps — the idle stretches (≥60 min) between DAY_START_HOUR
 * and DAY_END_HOUR on `anchor`'s day, only meaningful for a single day
 * (the "Calendar" list card always shows today). */
export function gapsFor(anchor: string, events: { startsAt: string; endsAt: string }[]): FreeGap[] {
  // WPF-11: the reader's day, as `rangeFor` above builds it. These were UTC hours,
  // which put the working day at 4pm to 6am for a Brisbane reader
  const dayStart = atTime(anchor, DAY_START_HOUR);
  const dayEnd = atTime(anchor, DAY_END_HOUR);
  const busy = events
    .map((e) => ({ s: new Date(e.startsAt), e: new Date(e.endsAt) }))
    .filter((b) => b.e > dayStart && b.s < dayEnd)
    .sort((a, b) => a.s.getTime() - b.s.getTime());

  const gaps: FreeGap[] = [];
  let cursor = dayStart;
  for (const b of busy) {
    if (b.s.getTime() - cursor.getTime() >= MIN_GAP_MINUTES * 60_000) {
      gaps.push({ startsAt: cursor.toISOString(), endsAt: b.s.toISOString() });
    }
    if (b.e > cursor) cursor = b.e;
  }
  if (dayEnd.getTime() - cursor.getTime() >= MIN_GAP_MINUTES * 60_000) {
    gaps.push({ startsAt: cursor.toISOString(), endsAt: dayEnd.toISOString() });
  }
  return gaps;
}

export function getCalendar(req: TransportRequest): TransportResponse {
  const state = db.get();
  const view = req.query?.view ?? "today";
  const anchor = req.query?.anchor ?? dayKey(db.now());
  const { start, end } = rangeFor(view, anchor);
  let events = state.calendarEvents.filter((e) => {
    const s = new Date(e.startsAt);
    return s >= start && s < end;
  });
  events = inFocus(events, req.query?.focus);
  const gaps = view === "today" ? gapsFor(anchor, events) : [];
  return ok({ events, gaps });
}

export function getEvent(_req: TransportRequest, id: string): TransportResponse {
  const event = db.get().calendarEvents.find((e) => e.id === id);
  return event ? ok(event) : err(404, "not found");
}

export function patchEvent(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.calendarEvents.findIndex((e) => e.id === id);
  if (idx === -1) return err(404, "not found");
  state.calendarEvents[idx] = { ...state.calendarEvents[idx], ...(req.body as Record<string, unknown>) };
  return ok(state.calendarEvents[idx]);
}

export function deleteEvent(_req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  state.calendarEvents = state.calendarEvents.filter((e) => e.id !== id);
  return ok(null);
}

export function postCalendarPropose(_req: TransportRequest): TransportResponse {
  return ok({ status: "drafted-not-sent" });
}
