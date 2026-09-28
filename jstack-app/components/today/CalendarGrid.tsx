/**
 * CalendarGrid — Today's "All calendars" (CG-01..08): a segmented Today/
 * 3 days/Week/Month control over a time-grid or a month dot-grid, from
 * `GET /calendar`. design/handoff.md's "All calendars card" spec + mock
 * v11's `calGrid()` (jstack-mock-v11.html lines 424-450).
 */
import React, { useEffect, useMemo } from "react";
import { View } from "react-native";
import { Card, IconBtn, Section, Seg, Txt } from "@/theme/ui";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useTodayStore } from "@/stores/today";
import {
  DAY_ABBR, formatTime, hourOfDay, mondayIndex, monthCaption, monthGrid,
  resolveAnchor, threeDayCaption, todayKey, weekCaption,
} from "@/lib/time";
import {
  HOUR_LINE_STEP, HOUR_START, HOUR_END, PX_PER_HOUR, TRACK_HEIGHT,
  daysFor, eventsOn, gridPosition,
} from "@/lib/timeGrid";
import { radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import type { CalendarView, CalEvent } from "@/data/types";

const VIEW_OPTIONS: { key: CalendarView; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "3day", label: "3 days" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

function rangeCaption(view: CalendarView, anchor: string): string {
  if (view === "month") return monthCaption(anchor);
  if (view === "week") return weekCaption(anchor);
  if (view === "3day") return threeDayCaption(anchor);
  return anchor;
}

function EventBlock({ e }: { e: CalEvent }) {
  const c = useTokens();
  const { top, height, showTime } = gridPosition(e.startsAt, e.endsAt);
  const ruleColor = e.source === "personal" ? c.accent : e.source === "work" ? c.accentInk : c.muted;
  return (
    <View
      testID={`cal-event-${e.id}`}
      style={{
        position: "absolute",
        top,
        height,
        left: 2,
        right: 2,
        borderRadius: 5,
        borderLeftWidth: 3,
        borderLeftColor: ruleColor,
        backgroundColor: e.source === "family" ? c.hairline : c.accentSoft,
        paddingHorizontal: 3,
        // D16: 1px, not 3 — a 45-minute block is 16px tall by CG-02's duration
        // math, and 3px either side left 10px of box for a ~14px line
        paddingVertical: 1,
        overflow: "hidden",
        ...(e.protectedByEa ? { borderWidth: 1.5, borderStyle: "dashed" as const, borderColor: c.accentInk } : {}),
      }}
    >
      <Txt numberOfLines={1} kind="micro" style={{ lineHeight: 11 }}>
        {e.title}
      </Txt>
      {showTime && (
        <Txt kind="gridMicro">{formatTime(e.startsAt)}</Txt>
      )}
    </View>
  );
}

function DayColumn({ date, isToday }: { date: string; isToday: boolean }) {
  const c = useTokens();
  const allEvents = useTodayStore((s) => s.calendar.events);
  const events = eventsOn(allEvents, date);
  const clockOffsetMs = useSessionStore((s) => s.clockOffsetMs);
  const nowTop = (hourOfDay(new Date(Date.now() + clockOffsetMs)) - HOUR_START) * PX_PER_HOUR;
  const label = `${isToday ? "TODAY · " : ""}${DAY_ABBR[mondayIndex(date)]} ${Number(date.slice(8, 10))}`;
  return (
    <View style={{ flex: 1 }} testID={`cal-day-${date}`}>
      <Txt kind="gridLabel" style={{ marginBottom: 4, color: isToday ? c.accentInk : c.muted }}>{label}</Txt>
      <View
        testID={`cal-track-${date}`}
        style={{
          position: "relative",
          height: TRACK_HEIGHT,
          borderWidth: 1,
          borderColor: c.hairline,
          borderTopWidth: isToday ? 2 : 1,
          borderTopColor: isToday ? c.accentInk : c.hairline,
          borderRadius: radius.control,
        }}
      >
        {/* D15: a repeating 1px Hairline rule every two hours (handoff.md,
            Today Column 2). Without them the events float against a flat
            surface and the only way to read a time is the 24px-away gutter. */}
        {Array.from({ length: Math.floor((HOUR_END - HOUR_START) / HOUR_LINE_STEP) }, (_, i) => (HOUR_START + (i + 1) * HOUR_LINE_STEP)).map((h) => (
          <View
            key={`rule-${h}`}
            testID={`cal-hour-rule-${h}`}
            pointerEvents="none"
            style={{ position: "absolute", top: (h - HOUR_START) * PX_PER_HOUR, left: 0, right: 0, height: 1, backgroundColor: c.hairline }}
          />
        ))}
        {events.map((e) => (
          <EventBlock key={e.id} e={e} />
        ))}
        {isToday && nowTop >= 0 && nowTop <= TRACK_HEIGHT && (
          <View testID="cal-now-line" style={{ position: "absolute", top: nowTop, left: 0, right: 0, height: 1, backgroundColor: c.accentInk }} />
        )}
      </View>
    </View>
  );
}

function TimeGrid({ view, anchor, todayStr }: { view: CalendarView; anchor: string; todayStr: string }) {
  const days = daysFor(view, anchor);
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      <View style={{ width: 24, marginTop: 17 }}>
        {[6, 8, 10, 12, 14, 16, 18, 20].map((h) => (
          <Txt key={h} kind="gridMicro" style={{ position: "absolute", top: (h - HOUR_START) * PX_PER_HOUR - 5 }}>
            {h}
          </Txt>
        ))}
      </View>
      <View style={{ flex: 1, flexDirection: "row", gap: 4 }}>
        {days.map((d) => (
          <DayColumn key={d} date={d} isToday={d === todayStr} />
        ))}
      </View>
    </View>
  );
}

function MonthGrid({ anchor, todayStr }: { anchor: string; todayStr: string }) {
  const c = useTokens();
  const events = useTodayStore((s) => s.calendar.events);
  const days = monthGrid(anchor);
  const monthNum = Number(anchor.slice(5, 7));
  return (
    <View testID="cal-month" style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {days.map((d) => {
        const inMonth = Number(d.slice(5, 7)) === monthNum;
        const dots = Math.min(2, eventsOn(events, d).length);
        return (
          <View key={d} style={{ width: `${100 / 7}%`, paddingVertical: 6 }}>
            {inMonth && (
              <>
                <Txt kind="small" style={{ color: d === todayStr ? c.accentInk : c.ink }}>{Number(d.slice(8, 10))}</Txt>
                <View style={{ flexDirection: "row", gap: 2, marginTop: 2 }}>
                  {Array.from({ length: dots }, (_, i) => (
                    <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.accentInk }} />
                  ))}
                </View>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

function Legend() {
  const c = useTokens();
  const item = (color: string, label: string, dashed = false) => (
    <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: dashed ? "transparent" : color, borderWidth: dashed ? 1.5 : 0, borderStyle: dashed ? "dashed" : "solid", borderColor: color }} />
      <Txt kind="gridLabel">{label}</Txt>
    </View>
  );
  // CD-16: free `flexWrap` let the browser choose the break point, and at
  // 1024 it broke after four items, leaving "Now" to wrap alone onto its
  // own line — an orphan. Two fixed rows make the grouping deterministic at
  // every width: "Now" always sits beside "EA protects", never alone.
  return (
    <View testID="cal-legend" style={{ gap: 6, marginTop: space[3] }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {item(c.accent, "Personal")}
        {item(c.accentInk, "Work")}
        {item(c.muted, "Family · shared")}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {item(c.accentInk, "EA protects", true)}
        {/* D17: "Now is a 1px Accent-ink line" (README Components) — drawn as
            the same swatch as Personal, the two keys were indistinguishable. */}
        <View key="Now" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View testID="cal-legend-now" style={{ width: 10, height: 1, backgroundColor: c.accentInk }} />
          <Txt kind="gridLabel">Now</Txt>
        </View>
      </View>
    </View>
  );
}

export function CalendarGrid() {
  const calView = useTodayStore((s) => s.calView);
  // FOLLOW_TODAY ("") means "the period containing today" — resolved here,
  // at read time, off the same Brisbane clock as `todayStr` below (CD-09)
  const calAnchor = resolveAnchor(useTodayStore((s) => s.calAnchor));
  const setCalView = useTodayStore((s) => s.setCalView);
  const navCalendar = useTodayStore((s) => s.navCalendar);
  const loadCalendar = useTodayStore((s) => s.loadCalendar);
  const activeFocus = useSettingsStore((s) => s.activeFocus);
  const calendarViewsOn = useSettingsStore((s) => s.capabilities.calendarViews);
  // subscribe to the clock so a rig offset change re-renders the grid —
  // `todayKey()` reads the same offset but is not reactive by itself, and
  // without this the header kept yesterday's TODAY column after a clock move
  const clockOffsetMs = useSessionStore((s) => s.clockOffsetMs);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- clockOffsetMs IS the dependency: todayKey() reads it through lib/time's injected source, which the rule cannot see
  const todayStr = useMemo(() => todayKey(), [clockOffsetMs]);

  useEffect(() => {
    void loadCalendar(activeFocus);
  }, [loadCalendar, activeFocus]);

  const options = calendarViewsOn ? VIEW_OPTIONS : VIEW_OPTIONS.filter((o) => o.key === "today" || o.key === "3day");

  return (
    <Section testID="calendar-grid" style={{ gap: 8 }} sectionId="calendar" title={"All calendars"} hint="the empty space is the point" labelTestID="allcal-label">
      <Card>
        <Seg testID="cal-seg" options={options} value={calView} onChange={(v) => void setCalView(v, activeFocus)} />
        {calView !== "today" && (
          <View testID="cal-range" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: space[3] }}>
            <IconBtn icon="chevron_left" accessibilityLabel="Previous" onPress={() => void navCalendar(-1, activeFocus)} inCard />
            <Txt>{rangeCaption(calView, calAnchor)}</Txt>
            <IconBtn icon="chevron_right" accessibilityLabel="Next" onPress={() => void navCalendar(1, activeFocus)} inCard />
          </View>
        )}
        <View style={{ marginTop: space[3] }}>
          {calView === "month" ? <MonthGrid anchor={calAnchor} todayStr={todayStr} /> : <TimeGrid view={calView} anchor={calAnchor} todayStr={todayStr} />}
        </View>
        <Legend />
      </Card>
    </Section>
  );
}
