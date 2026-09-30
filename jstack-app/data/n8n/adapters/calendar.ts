/**
 * `GET /calendar` from Google Calendar, through the `calendar` webhook (JSTACK-DASH-calendar-read)
 * — the request built, and the reply guarded and mapped into the contract's `CalendarWindow`.
 *
 * The mock is the spec (`data/mock/handlers/calendar.ts`), and its rules are copied here rather
 * than imported, because `data/n8n/` may not import `data/mock/` (CT-03) — with one exception:
 *
 *  - the window is `rangeFor`'s: local midnight on the anchor to local midnight after it — one day
 *    for `today`, three for `3day`, seven for `week`, a calendar month for `month`;
 *  - an event is in the window when it OVERLAPS it (ADR-80). The mock keeps only events that start
 *    in the window, which its fixtures never tested: on real data a two-day event would vanish on
 *    its second day, and yesterday's two-day event would be missing today. Google returns every
 *    event that overlaps the window, so this is the adapter's rule alone;
 *  - `?focus=` narrows by silo, as `inFocus` does (`data/n8n/focus.ts`);
 *  - `gaps` exist only for `today`: `gapsFor`'s idle stretches of an hour or more, 06:00 to 20:00.
 *
 * Dates go through `lib/time.ts`, and every instant out is ISO 8601 UTC. Anything in the reply that
 * is not the shape below is a 502 for this section alone — never a guess at what was meant.
 */
import { addDays, addMonths, atTime, now, todayKey } from "@/lib/time";
import { N8N_CALENDAR_SOURCE } from "@/data/config";
import type { Silo } from "@/data/labels";
import type { CalendarSource, CalendarView, CalEvent, FreeGap } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import type { Asked, WebhookAdapter } from "@/data/n8n/registry";
import { inFocus } from "@/data/n8n/focus";

/** `data/mock/handlers/calendar.ts` */
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 20;
const MIN_GAP_MINUTES = 60;
/** a timed event Google gives no end: shown as half an hour, a display assumption and nothing more */
const NO_END_MINUTES = 30;

const VIEWS: CalendarView[] = ["today", "3day", "week", "month"];
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** What the mock labels an event from each source with (`data/mock/fixtures/calendar.json`). */
const LABELLING: Record<CalendarSource, { silo: Silo; focus: string }> = {
  personal: { silo: "personal:josh", focus: "personal" },
  work: { silo: "work", focus: "work" },
  family: { silo: "family1", focus: "family" },
};

type RawEvent = { id: string; title: string; start: string; end: string | null; allDay: boolean; htmlLink?: unknown; updated?: unknown; protectedByEa?: unknown };

function asked(a: Asked): { view: CalendarView; anchor: string } {
  const view = VIEWS.includes(a.req.query?.view as CalendarView) ? (a.req.query?.view as CalendarView) : "today";
  const raw = a.req.query?.anchor;
  return { view, anchor: raw != null && DAY_KEY.test(raw) ? raw : todayKey() };
}

/** `data/mock/handlers/calendar.ts` `rangeFor` */
function rangeFor(view: CalendarView, anchor: string): { start: Date; end: Date } {
  const endKey = view === "3day" ? addDays(anchor, 3) : view === "week" ? addDays(anchor, 7) : view === "month" ? addMonths(anchor, 1) : addDays(anchor, 1);
  return { start: atTime(anchor, 0), end: atTime(endKey, 0) };
}

/** `data/mock/handlers/calendar.ts` `gapsFor` */
function gapsFor(anchor: string, events: { startsAt: string; endsAt: string }[]): FreeGap[] {
  const dayStart = atTime(anchor, DAY_START_HOUR);
  const dayEnd = atTime(anchor, DAY_END_HOUR);
  const busy = events
    .map((e) => ({ s: new Date(e.startsAt), e: new Date(e.endsAt) }))
    .filter((b) => b.e > dayStart && b.s < dayEnd)
    .sort((a, b) => a.s.getTime() - b.s.getTime());
  const gaps: FreeGap[] = [];
  let cursor = dayStart;
  for (const b of busy) {
    if (b.s.getTime() - cursor.getTime() >= MIN_GAP_MINUTES * 60_000) gaps.push({ startsAt: cursor.toISOString(), endsAt: b.s.toISOString() });
    if (b.e > cursor) cursor = b.e;
  }
  if (dayEnd.getTime() - cursor.getTime() >= MIN_GAP_MINUTES * 60_000) gaps.push({ startsAt: cursor.toISOString(), endsAt: dayEnd.toISOString() });
  return gaps;
}

/** ADR-80: in the window when it overlaps it; a zero-length event, when its instant is in it. */
function overlaps(e: CalEvent, start: Date, end: Date): boolean {
  const s = new Date(e.startsAt);
  const en = new Date(e.endsAt);
  return s < end && (en > start || (en.getTime() === s.getTime() && s >= start));
}

const isInstant = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

function isRawEvent(e: unknown): e is RawEvent {
  if (e == null || typeof e !== "object") return false;
  const r = e as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id === "" || typeof r.title !== "string" || typeof r.allDay !== "boolean") return false;
  if (typeof r.start !== "string" || (r.end !== null && typeof r.end !== "string")) return false;
  // an all-day event is a pair of day keys, the end exclusive; a timed one, two instants
  if (r.allDay) return DAY_KEY.test(r.start) && (r.end === null || DAY_KEY.test(r.end as string));
  return isInstant(r.start) && (r.end === null || isInstant(r.end));
}

function toEvent(r: RawEvent): CalEvent {
  const startsAt = r.allDay ? atTime(r.start, 0) : new Date(r.start);
  // Google's all-day end is the day AFTER the last one, so its midnight is the right instant as it is
  const endsAt = r.end == null ? new Date(startsAt.getTime() + NO_END_MINUTES * 60_000) : r.allDay ? atTime(r.end, 0) : new Date(r.end);
  const { silo, focus } = LABELLING[N8N_CALENDAR_SOURCE];
  return {
    id: r.id,
    title: r.title,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    source: N8N_CALENDAR_SOURCE,
    labels: { silo, types: [], setBy: "source" },
    setAt: isInstant(r.updated) ? new Date(r.updated).toISOString() : now().toISOString(),
    focus,
    ...(r.protectedByEa === true ? { protectedByEa: true } : {}),
    ...(typeof r.htmlLink === "string" && r.htmlLink !== "" ? { googleUrl: r.htmlLink } : {}),
  };
}

const unexpected = (why: string): TransportResponse => ({ status: 502, json: { reason: `the calendar answered in an unexpected shape: ${why}` } });

export const calendarAdapter: WebhookAdapter = {
  body: (a) => {
    const { view, anchor } = asked(a);
    const { start, end } = rangeFor(view, anchor);
    return { timeMin: start.toISOString(), timeMax: end.toISOString(), maxResults: view === "month" ? 500 : 250 };
  },
  toContract: (data, a) => {
    const events = (data as { events?: unknown } | null)?.events;
    if (!Array.isArray(events)) return unexpected("no events list");
    const bad = events.findIndex((e) => !isRawEvent(e));
    if (bad !== -1) return unexpected(`event ${bad} is not an event`);

    const { view, anchor } = asked(a);
    const { start, end } = rangeFor(view, anchor);
    const inWindow = (events as RawEvent[]).map(toEvent).filter((e) => overlaps(e, start, end));
    const shown = inFocus(inWindow, a.req.query?.focus);
    return { status: 200, json: { events: shown, gaps: view === "today" ? gapsFor(anchor, shown) : [] } };
  },
};
