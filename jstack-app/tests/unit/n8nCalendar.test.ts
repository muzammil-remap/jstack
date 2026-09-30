/**
 * ADR-76, Phase 3 — `GET /calendar` from the `calendar` webhook: the window it asks for, the reply
 * it accepts, and the `CalendarWindow` it answers, against the redacted real replies in
 * `tests/fixtures/n8n/`.
 *
 * The window runs local midnight to local midnight on the DEVICE (ADR-47): `rangeFor`'s for Today
 * and 3 days, the grid's own days for Week and Month (ADR-82). Every instant below is a literal for
 * each zone the board runs in (`jest.config.js`: New York by default, Brisbane under `JSTACK_TZ`) —
 * never recomputed with the functions under test. New York is on EDT (−04:00) until DST ends on
 * 1 November 2026, EST (−05:00) after.
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
  /** `calendar.cases.json`, today on 30 September: the ids that overlap the device's day */
  casesToday: string[];
  /** the same day's gaps: only the events that take time (not all-day, not marked free) */
  casesGaps: FreeGap[];
  /** Week and Month across a month boundary: anchor → [timeMin, timeMax) */
  boundary: Record<string, [string, string]>;
};

const ZONES: Record<string, Zone> = {
  "Australia/Brisbane": {
    offset: "+10:00",
    windows: {
      today: ["2026-09-29T14:00:00.000Z", "2026-09-30T14:00:00.000Z"],
      "3day": ["2026-09-29T14:00:00.000Z", "2026-10-02T14:00:00.000Z"],
      // Monday 28 September to Monday 5 October; September's grid, Monday 31 August to Monday 5 October
      week: ["2026-09-27T14:00:00.000Z", "2026-10-04T14:00:00.000Z"],
      month: ["2026-08-30T14:00:00.000Z", "2026-10-04T14:00:00.000Z"],
    },
    windowsDayBefore: {
      today: ["2026-09-28T14:00:00.000Z", "2026-09-29T14:00:00.000Z"],
      "3day": ["2026-09-28T14:00:00.000Z", "2026-10-01T14:00:00.000Z"],
      week: ["2026-09-27T14:00:00.000Z", "2026-10-04T14:00:00.000Z"],
      month: ["2026-08-30T14:00:00.000Z", "2026-10-04T14:00:00.000Z"],
    },
    midnight: ["2026-09-29T13:59:59.000Z", "2026-09-29T14:00:01.000Z"],
    allDay: ["2026-10-01T14:00:00.000Z", "2026-10-03T14:00:00.000Z"],
    day: ["2026-09-29T20:00:00.000Z", "2026-09-30T10:00:00.000Z"],
    casesToday: ["case-before", "case-overnight", "case-allday", "case-twoday", "case-free", "case-busy"],
    // busy: the overnight event until 08:00 and 15:00–16:00; the free 12:00 hour and the all-day ones do not count
    casesGaps: [
      { startsAt: "2026-09-29T22:00:00.000Z", endsAt: "2026-09-30T05:00:00.000Z" },
      { startsAt: "2026-09-30T06:00:00.000Z", endsAt: "2026-09-30T10:00:00.000Z" },
    ],
    boundary: {
      "week 2026-10-01": ["2026-09-27T14:00:00.000Z", "2026-10-04T14:00:00.000Z"],
      "week 2026-10-05": ["2026-10-04T14:00:00.000Z", "2026-10-11T14:00:00.000Z"],
      "month 2026-10-15": ["2026-09-27T14:00:00.000Z", "2026-11-01T14:00:00.000Z"],
      "month 2026-11-10": ["2026-10-25T14:00:00.000Z", "2026-11-29T14:00:00.000Z"],
    },
  },
  "America/New_York": {
    offset: "-04:00",
    windows: {
      today: ["2026-09-30T04:00:00.000Z", "2026-10-01T04:00:00.000Z"],
      "3day": ["2026-09-30T04:00:00.000Z", "2026-10-03T04:00:00.000Z"],
      week: ["2026-09-28T04:00:00.000Z", "2026-10-05T04:00:00.000Z"],
      month: ["2026-08-31T04:00:00.000Z", "2026-10-05T04:00:00.000Z"],
    },
    windowsDayBefore: {
      today: ["2026-09-29T04:00:00.000Z", "2026-09-30T04:00:00.000Z"],
      "3day": ["2026-09-29T04:00:00.000Z", "2026-10-02T04:00:00.000Z"],
      week: ["2026-09-28T04:00:00.000Z", "2026-10-05T04:00:00.000Z"],
      month: ["2026-08-31T04:00:00.000Z", "2026-10-05T04:00:00.000Z"],
    },
    midnight: ["2026-09-30T03:59:59.000Z", "2026-09-30T04:00:01.000Z"],
    allDay: ["2026-10-02T04:00:00.000Z", "2026-10-04T04:00:00.000Z"],
    day: ["2026-09-30T10:00:00.000Z", "2026-10-01T00:00:00.000Z"],
    // New York's 30 September is 04:00Z to 04:00Z: the Brisbane-offset timed cases fall elsewhere
    casesToday: ["case-before", "case-allday", "case-twoday", "case-busy", "case-tomorrow"],
    // busy: 01:00–02:00 (before the day) and 19:00–20:00 local
    casesGaps: [{ startsAt: "2026-09-30T10:00:00.000Z", endsAt: "2026-09-30T23:00:00.000Z" }],
    boundary: {
      "week 2026-10-01": ["2026-09-28T04:00:00.000Z", "2026-10-05T04:00:00.000Z"],
      "week 2026-10-05": ["2026-10-05T04:00:00.000Z", "2026-10-12T04:00:00.000Z"],
      // the grid's last day is 1 November, the night DST ends: its midnight after is EST
      "month 2026-10-15": ["2026-09-28T04:00:00.000Z", "2026-11-02T05:00:00.000Z"],
      "month 2026-11-10": ["2026-10-26T04:00:00.000Z", "2026-11-30T05:00:00.000Z"],
    },
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

  describe("Week and Month fetch exactly the days the grid draws (ADR-82)", () => {
    it.each(["week 2026-10-01", "week 2026-10-05", "month 2026-10-15", "month 2026-11-10"])("%s, across a month boundary", (label) => {
      const [view, anchor] = label.split(" ");
      const [timeMin, timeMax] = zone.boundary[label];
      expect(calendarAdapter.body(ask({ view, anchor }))).toEqual({ timeMin, timeMax, maxResults: view === "month" ? 500 : 250 });
    });

    it("a month grid is 35 days, inside the webhook's 45-day limit — and November 2026's 30th is not in it (the grid's own limit)", () => {
      const { timeMin, timeMax } = calendarAdapter.body(ask({ view: "month", anchor: "2026-11-10" })) as { timeMin: string; timeMax: string };
      const days = (Date.parse(timeMax) - Date.parse(timeMin)) / 86_400_000;
      expect(Math.round(days)).toBe(35);
      expect(days).toBeLessThanOrEqual(45);
    });
  });

  describe("the real reply maps to the contract", () => {
    /** ADR-82: the Week is Monday to Sunday now, so Monday 5 October's event is next week's */
    it("this week's sample: the two events of Mon 28 Sep – Sun 4 Oct, each field from its source, and a valid CalendarWindow", () => {
      const res = map(sample("calendar").data, { view: "week", anchor: "2026-09-30" });
      expect(res.status).toBe(200);
      expect(contractErrors(res.json, "/calendar")).toEqual([]);
      const events = (res.json as { events: CalEvent[]; gaps: FreeGap[] }).events;
      expect(events.map((e) => e.id)).toEqual(["event001", "event002"]);
      const next = (map(sample("calendar").data, { view: "week", anchor: "2026-10-05" }).json as { events: CalEvent[] }).events;
      expect(next.map((e) => e.id)).toEqual(["event003_20261005"]);
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

    it("the month sample is a valid CalendarWindow too (October's grid)", () => {
      const res = map(sample("calendar.month").data, { view: "month", anchor: "2026-10-15" });
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

  describe("the window's rules", () => {
    /** ADR-80 changed this from the mock's start-in-window rule: "before" used to be out */
    it("an event is in the window when it OVERLAPS it: begun the day before is in; ended at the start, or begun at the end, is out", () => {
      const events = [
        raw({ id: "ended", start: "2026-09-29", end: "2026-09-30", allDay: true }),
        raw({ id: "before", start: "2026-09-29", end: "2026-10-01", allDay: true }),
        raw({ id: "first", start: "2026-09-30", end: "2026-10-01", allDay: true }),
        raw({ id: "last", start: local("23:59:00"), end: null }),
        raw({ id: "after", start: "2026-10-01", end: "2026-10-02", allDay: true }),
      ];
      const ids = (map({ events }, { view: "today", anchor: "2026-09-30" }).json as { events: CalEvent[] }).events.map((e) => e.id);
      expect(ids).toEqual(["before", "first", "last"]);
    });

    it("the live-shaped cases: yesterday's two-day event and last night's overnight one count today", () => {
      const res = map(sample("calendar.cases").data, { view: "today", anchor: "2026-09-30" });
      expect(contractErrors(res.json, "/calendar")).toEqual([]);
      expect((res.json as { events: CalEvent[] }).events.map((e) => e.id)).toEqual(zone.casesToday);
    });

    it("a two-day event counts on its second day too, and a one-day event does not spill into the next", () => {
      const ids = (map(sample("calendar.cases").data, { view: "today", anchor: "2026-10-01" }).json as { events: CalEvent[] }).events.map((e) => e.id);
      expect(ids).toContain("case-twoday");
      expect(ids).not.toContain("case-allday");
      expect(ids).not.toContain("case-before");
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

    it("gaps count only the events that take time: all-day and free (transparent) events leave them alone", () => {
      const iso = (clock: string) => new Date(local(clock)).toISOString();
      const whole = [{ startsAt: zone.day[0], endsAt: zone.day[1] }];
      const gapsOf = (events: unknown[]) => (map({ events }, { view: "today", anchor: "2026-09-30" }).json as { gaps: FreeGap[] }).gaps;
      expect(gapsOf([raw({ id: "a", start: "2026-09-30", end: "2026-10-01", allDay: true, transparency: "opaque" })])).toEqual(whole);
      expect(gapsOf([raw({ id: "f", transparency: "transparent" })])).toEqual(whole);
      expect(gapsOf([raw({ id: "b", transparency: "opaque" })])).toEqual([
        { startsAt: iso("06:00:00"), endsAt: iso("09:00:00") },
        { startsAt: iso("10:00:00"), endsAt: iso("20:00:00") },
      ]);
      expect(gapsOf([raw({ id: "c", transparency: undefined })]).length).toBe(2); // no transparency: busy, as Google's default is
    });

    it("the live-shaped cases' gaps", () => {
      expect((map(sample("calendar.cases").data, { view: "today", anchor: "2026-09-30" }).json as { gaps: FreeGap[] }).gaps).toEqual(zone.casesGaps);
    });

    it("?focus= narrows by silo: every event is personal", () => {
      const data = sample("calendar").data;
      const count = (focus?: string) => (map(data, { view: "week", anchor: "2026-09-30", focus }).json as { events: CalEvent[] }).events.length;
      expect({ all: count("all"), none: count(), personal: count("personal"), work: count("work"), family: count("family") }).toEqual({ all: 2, none: 2, personal: 2, work: 0, family: 0 });
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
