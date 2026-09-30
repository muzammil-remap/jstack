/**
 * Option C (Checkpoint 3) — all-day events drawn where they belong: in a strip above the grid's
 * hours on every day they cover, never in the time track (where one landed above the card), and as
 * "all day" in the Calendar card instead of "0:00".
 *
 * The store is seeded directly and its loaders held still, so the mock cannot replace the events
 * the case is about. The instants come from each board zone's own offset on these dates.
 */
import React from "react";
import { act, render, within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { CalendarGrid } from "@/components/today/CalendarGrid";
import { CalendarList } from "@/components/today/CalendarList";
import { useTodayStore } from "@/stores/today";
import type { CalEvent, TodayComposite } from "@/data/types";

const OFFSET: Record<string, string> = { "Australia/Brisbane": "+10:00", "America/New_York": "-04:00" };
const offset = OFFSET[process.env.TZ ?? ""];
const at = (local: string) => new Date(`${local}${offset}`).toISOString();
const event = (id: string, from: string, to: string): CalEvent => ({
  id,
  title: id,
  startsAt: at(from),
  endsAt: at(to),
  source: "personal",
  labels: { silo: "personal:josh", types: [], setBy: "source" },
  setAt: at("2026-09-01T00:00:00"),
  focus: "personal",
});

async function draw(node: React.ReactElement) {
  const utils = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <GestureHandlerRootView>
        <ThemeProvider>{node}</ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>,
  );
  await act(async () => {
    for (let i = 0; i < 24; i++) await Promise.resolve();
  });
  return utils;
}

(offset == null ? describe.skip : describe)(`all-day events in the calendar (${process.env.TZ})`, () => {
  const twoDay = event("twoday", "2026-10-01T00:00:00", "2026-10-03T00:00:00");
  const timed = event("timed", "2026-10-01T09:00:00", "2026-10-01T10:00:00");

  const seed = (events: CalEvent[]) =>
    useTodayStore.setState({
      calView: "week",
      calAnchor: "2026-09-30",
      calendar: { events, gaps: [] },
      composite: { todayDate: "2026-10-01", calendar: { events, gaps: [] } } as unknown as TodayComposite,
      loadCalendar: async () => {},
      loadThreeDay: async () => {},
    });

  it("Week: the two-day event is in the strip on Thursday and Friday, not in a track; the timed one stays in its track", async () => {
    seed([twoDay, timed]);
    const { getByTestId, queryByTestId } = await draw(<CalendarGrid />);
    expect(within(getByTestId("cal-allday-2026-10-01")).queryByTestId("cal-allday-event-twoday")).not.toBeNull();
    expect(within(getByTestId("cal-allday-2026-10-02")).queryByTestId("cal-allday-event-twoday")).not.toBeNull();
    // every column keeps the strip's height, so the hours stay level — Saturday's is there and empty
    expect(within(getByTestId("cal-allday-2026-10-03")).queryByTestId("cal-allday-event-twoday")).toBeNull();
    expect(queryByTestId("cal-event-twoday")).toBeNull();
    expect(within(getByTestId("cal-track-2026-10-01")).queryByTestId("cal-event-timed")).not.toBeNull();
  });

  it("with no all-day event there is no strip at all", async () => {
    seed([timed]);
    const { queryByTestId } = await draw(<CalendarGrid />);
    expect(queryByTestId("cal-allday-2026-10-01")).toBeNull();
  });

  it("the Calendar card says 'all day', never '0:00'", async () => {
    seed([twoDay, timed]);
    const { queryByText } = await draw(<CalendarList />);
    expect(queryByText("all day")).not.toBeNull();
    expect(queryByText("0:00")).toBeNull();
  });
});
