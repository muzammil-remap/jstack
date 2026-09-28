/**
 * CalendarList — Today's "Calendar" list card (TD-04): time, title, a
 * prep line in accent ink, free gaps as muted lines; hint "today · 3
 * days · google". This card's own "today"/"3 days" toggle is local
 * (BUGLOG_v2.md B-10: it used to share CalendarGrid.tsx's view/anchor
 * state, so switching the grid to Week or Month also broke this list
 * into showing a whole week/month flattened into one time-of-day list) —
 * "today" is free (reads the composite's own `calendar`, already
 * fetched), "3 days" makes its own `GET /calendar` call. "google" opens
 * the external-link confirmation.
 */
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { LINK_SLOP, ListCard, Meta, Row, Section, Txt } from "@/theme/ui";
import { useSessionStore } from "@/stores/session";
import { packPayload } from "@/layout/dialogKit";
import { useSettingsStore } from "@/stores/settings";
import { useTodayStore } from "@/stores/today";
import { formatTime } from "@/lib/time";
import { useTokens } from "@/theme/ThemeProvider";

const GOOGLE_CALENDAR_URL = "https://calendar.google.com/";

export function CalendarList() {
  const c = useTokens();
  const [listView, setListView] = useState<"today" | "3day">("today");
  const threeDay = useTodayStore((s) => s.threeDay);
  const loadThreeDay = useTodayStore((s) => s.loadThreeDay);
  const composite = useTodayStore((s) => s.composite);
  const activeFocus = useSettingsStore((s) => s.activeFocus);
  const openModal = useSessionStore((s) => s.openModal);

  // "3 days" is the store's second window (P-4, F-47): fetched when the
  // toggle asks for it, from the composite's own day
  useEffect(() => {
    if (listView !== "3day" || composite == null) return;
    void loadThreeDay(activeFocus);
  }, [listView, composite, activeFocus, loadThreeDay]);

  const { events, gaps } = listView === "today" ? composite?.calendar ?? { events: [], gaps: [] } : threeDay ?? { events: [], gaps: [] };

  const rows: { key: string; at: number; time: string; node: React.ReactNode }[] = [
    ...events.map((e) => ({
      key: e.id,
      at: new Date(e.startsAt).getTime(),
      time: formatTime(e.startsAt),
      node: (
        <View style={{ flex: 1 }}>
          <Txt>{e.title}</Txt>
          {e.prep != null && <Txt kind="meta" tone="accentInk">{e.prep}</Txt>}
        </View>
      ),
    })),
    ...gaps.map((g, i) => ({
      key: `gap-${i}`,
      at: new Date(g.startsAt).getTime(),
      time: formatTime(g.startsAt),
      node: (
        <Txt kind="meta" style={{ flex: 1 }}>
          Free until {formatTime(g.endsAt)}
          {g.suggestion ? ` · ${g.suggestion}` : ""}
        </Txt>
      ),
    })),
  ].sort((a, b) => a.at - b.at);

  return (
    // S6-42 (ux round 2): the heading was a bare label with no disclosure —
    // CALENDAR and GANTT were the only two headings in the app without a
    // triangle. A Section with a collapse key of its own (`calendar` is the
    // grid's); the view links keep the right slot. B-49's class, found by
    // RL-11's overlap sweep the moment P-9 wired it: three `Txt onPress` links
    // 6 px apart have boxes 14 px wider on each side, so each overlapped the
    // next by 15 px and the later one took the tap. A slop's width between
    // each link and its dot keeps the boxes disjoint.
    <Section
      testID="calendar-list"
      style={{ gap: 8 }}
      sectionId="calendar-list"
      title={"Calendar"}
      labelTestID="calendar-label"
      right={
        <View style={{ flexDirection: "row", gap: LINK_SLOP }}>
          <Txt testID="cal-list-today" onPress={() => setListView("today")} kind="small" style={{ color: listView === "today" ? c.accentInk : c.muted }}>
            today
          </Txt>
          <Txt kind="small">·</Txt>
          <Txt testID="cal-list-3day" onPress={() => setListView("3day")} kind="small" style={{ color: listView === "3day" ? c.accentInk : c.muted }}>
            3 days
          </Txt>
          <Txt kind="small">·</Txt>
          <Txt testID="cal-list-google" onPress={() => openModal("external-link", packPayload(GOOGLE_CALENDAR_URL, "Google Calendar"))} kind="small">
            google
          </Txt>
        </View>
      }
    >
      {rows.length === 0 ? (
        <Meta>Nothing on the calendar.</Meta>
      ) : (
        <ListCard>
          {rows.map((r, i) => (
            <Row key={r.key} last={i === rows.length - 1}>
              <Meta style={{ width: 34 }}>{r.time}</Meta>
              {r.node}
            </Row>
          ))}
        </ListCard>
      )}
    </Section>
  );
}
