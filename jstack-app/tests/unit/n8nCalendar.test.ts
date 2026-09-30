/**
 * ADR-76, Phase 3 — `GET /calendar` from the `calendar` webhook: the window it asks for, the reply
 * it accepts, and the `CalendarWindow` it answers, against the redacted real replies in
 * `tests/fixtures/n8n/`.
 *
 * The window is `rangeFor`'s, local midnight to local midnight on the DEVICE (ADR-47), so every
 * instant below is a literal for each zone the board runs in (`jest.config.js`: New York by
 * default, Brisbane under `JSTACK_TZ`) — never recomputed with the functions under test. New York
 * is on EDT (−04:00) for every date here; DST ends on 1 November 2026.
 */
import { calendarAdapter } from "@/data/n8n/adapters/calendar";
import type { Asked } from "@/data/n8n/registry";
import type { CalEvent, FreeGap } from "@/data/types";
import { contractErrors, sample } from "./n8nContract";

type Zone = {
  /** the device's UTC offset on these dates, for building a local instant */
  offset: string;
  /** anchor 2026-09-30, each view's [timeMin, timeMax) */
  windows: Record<string, [string, string]>;
  /** anchor 2026-09-29 — the day before the midnight below */
  windowsDayBefore: Record<string, [string, string]>;
  /** one second either side of the device's midnight into 30 September */
  midnight: [string, string];
  /** local midnight of 2 Oct and of 4 Oct (the sample's two-day all-day event, end exclusive) */
  allDay: [string, string];
  /** 06:00 and 20:00 on 30 September */
  day: [string, string];
};

const ZONES: Record<string, Zone> = {
  "Australia/Brisbane": {
    offset: "+10:00",
    windows: {
      today: ["2026-09-29T14:00:00.000Z", "2026-09-30T14:00:00.000Z"],
      "3day": ["2026-09-29T14:00:00.000Z", "2026-10-02T14:00:00.000Z"],
      week: ["2026-09-29T14:00:00.000Z", "2026-10-06T14:00:00.000Z"],
      month: ["2026-09-29T14:00:00.000Z", "2026-10-29T14:00:00.000Z"],
    },
    windowsDayBefore: {
      today: ["2026-09-28T14:00:00.000Z", "2026-09-29T14:00:00.000Z"],
      "3day": ["2026-09-28T14:00:00.000Z", "2026-10-01T14:00:00.000Z"],
      week: ["2026-09-28T14:00:00.000Z", "2026-10-05T14:00:00.000Z"],
      month: ["2026-09-28T14:00:00.000Z", "2026-10-28T14:00:00.000Z"],
    },
    midnight: ["2026-09-29T13:59:59.000Z", "2026-09-29T14:00:01.000Z"],
    allDay: ["2026-10-01T14:00:00.000Z", "2026-10-03T14:00:00.000Z"],
    day: ["2026-09-29T20:00:00.000Z", "2026-09-30T10:00:00.000Z"],
  },
  "America/New_York": {
    offset: "-04:00",
    windows: {
      today: ["2026-09-30T04:00:00.000Z", "2026-10-01T04:00:00.000Z"],
      "3day": ["2026-09-30T04:00:00.000Z", "2026-10-03T04:00:00.000Z"],
      week: ["2026-09-30T04:00:00.000Z", "2026-10-07T04:00:00.000Z"],
      month: ["2026-09-30T04:00:00.000Z", "2026-10-30T04:00:00.000Z"],
    },
    windowsDayBefore: {
      today: ["2026-09-29T04:00:00.000Z", "2026-09-30T04:00:00.000Z"],
      "3day": ["2026-09-29T04:00:00.000Z", "2026-10-02T04:00:00.000Z"],
      week: ["2026-09-29T04:00:00.000Z", "2026-10-06T04:00:00.000Z"],
      month: ["2026-09-29T04:00:00.000Z", "2026-10-29T04:00:00.000Z"],
    },
    midnight: ["2026-09-30T03:59:59.000Z", "2026-09-30T04:00:01.000Z"],
    allDay: ["2026-10-02T04:00:00.000Z", "2026-10-04T04:00:00.000Z"],
    day: ["2026-09-30T10:00:00.000Z", "2026-10-01T00:00:00.000Z"],
  },
};

const zone = ZONES[process.env.TZ ?? ""];
const VIEWS = ["today", "3day", "week", "month"] as const;

const ask = (query: Record<string, string | undefined>): Asked => ({ req: { method: "GET", path: "/calendar", query }, params: [] });
const map = (data: unknown, query: Record<string, string | undefined>) => calendarAdapter.toContract(data, ask(query));
const local = (clock: string) => `2026-09-30T${clock}${zone.offset}`;
const raw = (over: Record<string, unknown>) => ({ id: "e1", title: "Event", start: local("09:00:00"), end: local("10:00:00"), allDay: false, htmlLink: null, updated: "2026-09-01T00:00:00.000Z", protectedByEa: false, ...over });

(zone == null ? describe.skip : describe)(`Phase 3 · GET /calendar through the calendar webhook (${process.env.TZ})`, () => {
  afterEach(() => jest.useRealTimers());

  describe("the request is rangeFor's window", () => {
    it.each(VIEWS)("%s, anchored on 30 September", (view) => {
      const [timeMin, timeMax] = zone.windows[view];
      expect(calendarAdapter.body(ask({ view, anchor: "2026-09-30" }))).toEqual({ timeMin, timeMax, maxResults: view === "month" ? 500 : 250 });
    });

    it.each(VIEWS)("%s, with no anchor, turns over at the device's midnight — not UTC's", (view) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(zone.midnight[0]));
      expect(calendarAdapter.body(ask({ view }))).toMatchObject({ timeMin: zone.windowsDayBefore[view][0], timeMax: zone.windowsDayBefore[view][1] });
      jest.setSystemTime(new Date(zone.midnight[1]));
      expect(calendarAdapter.body(ask({ view }))).toMatchObject({ timeMin: zone.windows[view][0], timeMax: zone.windows[view][1] });
    });

    it("an unknown view is today's, and a malformed anchor is today", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(zone.midnight[1]));
      expect(calendarAdapter.body(ask({ view: "year", anchor: "30/09/2026" }))).toEqual({ timeMin: zone.windows.today[0], timeMax: zone.windows.today[1], maxResults: 250 });
    });
  });

  describe("the real reply maps to the contract", () => {
    it("this week's sample: three events, each field from its source, and a valid CalendarWindow", () => {
      const res = map(sample("calendar").data, { view: "week", anchor: "2026-09-30" });
      expect(res.status).toBe(200);
      expect(contractErrors(res.json, "/calendar")).toEqual([]);
      const events = (res.json as { events: CalEvent[]; gaps: FreeGap[] }).events;
      expect(events.map((e) => e.id)).toEqual(["event001", "event002", "event003_20261005"]);
      expect(events[1]).toEqual({
        id: "event002",
        title: "Event B",
        startsAt: "2026-10-02T06:00:00.000Z",
        endsAt: "2026-10-02T09:00:00.000Z",
        source: "personal",
        labels: { silo: "personal:josh", types: [], setBy: "source" },
        setAt: "2026-09-08T23:45:53.586Z",
        focus: "personal",
        googleUrl: "https://www.google.com/calendar/event?eid=REDACTED002",
      });
      expect((res.json as { gaps: FreeGap[] }).gaps).toEqual([]);
    });

    it("an all-day event runs from local midnight to local midnight, Google's end date exclusive", () => {
      const events = (map(sample("calendar").data, { view: "week", anchor: "2026-09-30" }).json as { events: CalEvent[] }).events;
      expect({ startsAt: events[0].startsAt, endsAt: events[0].endsAt }).toEqual({ startsAt: zone.allDay[0], endsAt: zone.allDay[1] });
    });

    it("the month sample is a valid CalendarWindow too", () => {
      const res = map(sample("calendar.month").data, { view: "month", anchor: "2026-09-30" });
      expect(res.status).toBe(200);
      expect(contractErrors(res.json, "/calendar")).toEqual([]);
      expect((res.json as { events: CalEvent[] }).events.length).toBeGreaterThan(10);
    });

    it("the empty reply: no events, and today's one gap is the whole working day", () => {
      const today = map(sample("calendar.empty").data, { view: "today", anchor: "2026-09-30" });
      expect(today).toEqual({ status: 200, json: { events: [], gaps: [{ startsAt: zone.day[0], endsAt: zone.day[1] }] } });
      expect(contractErrors(today.json, "/calendar")).toEqual([]);
      expect(map(sample("calendar.empty").data, { view: "week", anchor: "2026-09-30" })).toEqual({ status: 200, json: { events: [], gaps: [] } });
    });

    it("a timed event with no end is shown as half an hour", () => {
      const [e] = (map({ events: [raw({ end: null })] }, { view: "today", anchor: "2026-09-30" }).json as { events: CalEvent[] }).events;
      expect({ startsAt: e.startsAt, endsAt: e.endsAt }).toEqual({ startsAt: new Date(local("09:00:00")).toISOString(), endsAt: new Date(local("09:30:00")).toISOString() });
    });

    it("protectedByEa passes through only when true; no link and no `updated` leave googleUrl out and setAt at now", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-09-30T00:00:00.000Z"));
      const [plain, guarded] = (map({ events: [raw({ updated: null }), raw({ id: "e2", protectedByEa: true })] }, { view: "today", anchor: "2026-09-30" }).json as { events: CalEvent[] }).events;
      expect(plain.protectedByEa).toBeUndefined();
      expect(plain.googleUrl).toBeUndefined();
      expect(plain.setAt).toBe("2026-09-30T00:00:00.000Z");
      expect(guarded.protectedByEa).toBe(true);
    });
  });

  describe("the mock's rules", () => {
    it("an event is in the window when it STARTS in it: begun the day before is out, at the end instant is out", () => {
      const events = [
        raw({ id: "before", start: "2026-09-29", end: "2026-10-01", allDay: true }),
        raw({ id: "first", start: "2026-09-30", end: "2026-10-01", allDay: true }),
        raw({ id: "last", start: local("23:59:00"), end: null }),
        raw({ id: "after", start: "2026-10-01", end: "2026-10-02", allDay: true }),
      ];
      const ids = (map({ events }, { view: "today", anchor: "2026-09-30" }).json as { events: CalEvent[] }).events.map((e) => e.id);
      expect(ids).toEqual(["first", "last"]);
    });

    it("gaps are the idle hour-plus stretches between 06:00 and 20:00, today only", () => {
      const events = [raw({ id: "a", start: local("09:00:00"), end: local("10:00:00") }), raw({ id: "b", start: local("10:30:00"), end: local("11:00:00") }), raw({ id: "c", start: local("13:00:00"), end: local("15:00:00") })];
      const iso = (clock: string) => new Date(local(clock)).toISOString();
      expect((map({ events }, { view: "today", anchor: "2026-09-30" }).json as { gaps: FreeGap[] }).gaps).toEqual([
        { startsAt: iso("06:00:00"), endsAt: iso("09:00:00") },
        { startsAt: iso("11:00:00"), endsAt: iso("13:00:00") },
        { startsAt: iso("15:00:00"), endsAt: iso("20:00:00") },
      ]);
      expect((map({ events }, { view: "3day", anchor: "2026-09-30" }).json as { gaps: FreeGap[] }).gaps).toEqual([]);
    });

    it("?focus= narrows by silo: every event is personal", () => {
      const data = sample("calendar").data;
      const count = (focus?: string) => (map(data, { view: "week", anchor: "2026-09-30", focus }).json as { events: CalEvent[] }).events.length;
      expect({ all: count("all"), none: count(), personal: count("personal"), work: count("work"), family: count("family") }).toEqual({ all: 3, none: 3, personal: 3, work: 0, family: 0 });
    });
  });

  describe("anything else is this section's 502, never a guess", () => {
    it.each([
      ["no data", null],
      ["no events list", { count: 0 }],
      ["an event without an id", { events: [raw({ id: undefined })] }],
      ["a title that is not text", { events: [raw({ title: 3 })] }],
      ["an all-day event with a clock in it", { events: [raw({ allDay: true, start: local("09:00:00"), end: null })] }],
      ["a start that is not a date", { events: [raw({ start: "soon" })] }],
      ["an end that is a number", { events: [raw({ end: 5 })] }],
      ["no allDay flag", { events: [raw({ allDay: undefined })] }],
    ])("%s", (_label, data) => {
      const res = map(data, { view: "today", anchor: "2026-09-30" });
      expect(res.status).toBe(502);
      expect((res.json as { reason: string }).reason).toMatch(/^the calendar answered in an unexpected shape/);
    });
  });
});
