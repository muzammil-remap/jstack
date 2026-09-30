/**
 * AllDayStrip — the all-day events covering one day of the calendar grid, in a strip above its hours
 * (REMAP, option C at Checkpoint 3): an all-day event has no hours, and drawn in the time track it
 * landed above the card. A two-day event sits in both days' strips (`eventsCovering`), and every
 * column reserves the tallest day's rows so the hours stay level across the grid.
 */
import React from "react";
import { View } from "react-native";
import { Txt } from "@/theme/ui";
import { useTodayStore } from "@/stores/today";
import { eventsCovering, isAllDay } from "@/lib/timeGrid";
import { useTokens } from "@/theme/ThemeProvider";

const CHIP_HEIGHT = 16;
const CHIP_GAP = 2;
const STRIP_FOOT = 4;

/** What the strip takes above a day's track — and what the hour gutter moves down by. */
export function allDayStripHeight(rows: number): number {
  return rows === 0 ? 0 : rows * CHIP_HEIGHT + (rows - 1) * CHIP_GAP + STRIP_FOOT;
}

/** How many all-day rows the fullest of these days needs, so every column's hours line up. */
export function useAllDayRows(days: string[]): number {
  const events = useTodayStore((s) => s.calendar.events);
  return Math.max(0, ...days.map((d) => eventsCovering(events, d).filter(isAllDay).length));
}

export function AllDayStrip({ date, rows }: { date: string; rows: number }) {
  const c = useTokens();
  const events = useTodayStore((s) => s.calendar.events);
  if (rows === 0) return null;
  const allDay = eventsCovering(events, date).filter(isAllDay);
  return (
    <View testID={`cal-allday-${date}`} style={{ height: allDayStripHeight(rows), gap: CHIP_GAP, paddingBottom: STRIP_FOOT }}>
      {allDay.map((e) => (
        <View
          key={e.id}
          testID={`cal-allday-event-${e.id}`}
          // the time grid's own colours for a source (`CalendarGrid.tsx` `EventBlock`)
          style={{ height: CHIP_HEIGHT, justifyContent: "center", borderRadius: 4, borderLeftWidth: 3, borderLeftColor: e.source === "personal" ? c.accent : e.source === "work" ? c.accentInk : c.muted, backgroundColor: e.source === "family" ? c.hairline : c.accentSoft, paddingHorizontal: 3 }}
        >
          <Txt numberOfLines={1} kind="micro" style={{ lineHeight: 11 }}>
            {e.title}
          </Txt>
        </View>
      ))}
    </View>
  );
}
