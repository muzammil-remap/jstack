/**
 * Option C (Checkpoint 3) — the one shared test for "is this an all-day event" and "which days does
 * an event cover", which the grid's strip, the month dots and the Calendar card all read
 * (`lib/timeGrid.ts` `isAllDay`, `eventsCovering`).
 *
 * `CalEvent` has no all-day flag, so an all-day event is one that runs from a local midnight to a
 * later one — which is exactly what the n8n calendar adapter writes. The instants below are built
 * from each board zone's own offset on these dates, never with the functions under test.
 */
import { eventsCovering, isAllDay } from "@/lib/timeGrid";

const OFFSET: Record<string, string> = { "Australia/Brisbane": "+10:00", "America/New_York": "-04:00" };
const offset = OFFSET[process.env.TZ ?? ""];
const at = (local: string) => new Date(`${local}${offset}`).toISOString();
const ev = (id: string, from: string, to: string) => ({ id, startsAt: at(from), endsAt: at(to) });

(offset == null ? describe.skip : describe)(`all-day events and the days an event covers (${process.env.TZ})`, () => {
  describe("isAllDay", () => {
    it.each([
      ["one day, midnight to midnight", "2026-10-01T00:00:00", "2026-10-02T00:00:00", true],
      ["two days", "2026-10-01T00:00:00", "2026-10-03T00:00:00", true],
      ["a timed hour", "2026-10-01T09:00:00", "2026-10-01T10:00:00", false],
      ["ends at midnight, starts at eleven", "2026-10-01T23:00:00", "2026-10-02T00:00:00", false],
      ["starts at midnight, ends at noon", "2026-10-01T00:00:00", "2026-10-01T12:00:00", false],
      ["zero length at midnight", "2026-10-01T00:00:00", "2026-10-01T00:00:00", false],
    ])("%s → %s", (_label, from, to, expected) => {
      expect(isAllDay(ev("e", from, to))).toBe(expected);
    });
  });

  describe("eventsCovering", () => {
    const events = [
      ev("twoday", "2026-10-01T00:00:00", "2026-10-03T00:00:00"),
      ev("overnight", "2026-09-30T22:00:00", "2026-10-01T02:00:00"),
      ev("instant", "2026-10-02T09:00:00", "2026-10-02T09:00:00"),
    ];
    const on = (key: string) => eventsCovering(events, key).map((e) => e.id);

    it("a two-day event is on both of its days and neither neighbour", () => {
      expect({ sep30: on("2026-09-30").includes("twoday"), oct1: on("2026-10-01").includes("twoday"), oct2: on("2026-10-02").includes("twoday"), oct3: on("2026-10-03").includes("twoday") }).toEqual({
        sep30: false,
        oct1: true,
        oct2: true,
        oct3: false,
      });
    });

    it("an overnight event is on both nights' days; a zero-length one on the day of its instant", () => {
      expect(on("2026-09-30")).toEqual(["overnight"]);
      expect(on("2026-10-01")).toEqual(["twoday", "overnight"]);
      expect(on("2026-10-02")).toEqual(["twoday", "instant"]);
    });
  });
});
