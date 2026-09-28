/**
 * GanttMini — the "this month" card in Waiting on's column (`<Gantt compact>`).
 *
 * A different SCALE, not a different geometry. The full timeline fixes a day at
 * `DAY_WIDTH` and scrolls; this card has a fixed width in a sidebar and has to
 * fit its window into it, so it measures itself and divides. Everything after
 * that — where a bar starts, how wide it is, which days it covers — comes from
 * `lib/ganttAxis.ts`, the same function the full view calls. That is the whole
 * reason the geometry is a library: two presentations, one answer about where
 * a task sits (rule 16).
 *
 * No lanes, no drag. This is a glance, and it says so by being one: the mock's
 * fixed 90px label column is kept because the alignment with the waiting rows
 * above it is the point (DISCREPANCIES row 7).
 *
 * S6-24 (ux round, Stage 6): the track is the BARS' OWN window — the parent
 * hands down `miniWindow`'s union plus a margin rather than the active range
 * — a bar is never under `MIN_BAR`, and the two ends of the track are dated.
 * Ninety days across 308px was 3.4px a day: four one-day tasks in four
 * different weeks were four identical specks with nothing to tell them apart,
 * and the wider the screen the smaller the bar. The dates are the smallest
 * honest axis, and the same one row 7 sanctioned for the full view.
 */
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Txt } from "@/theme/ui";
import { touchSlop } from "@/lib/webData";
import { barGeometry, daysBetween, minimumBar } from "@/lib/ganttAxis";
import { formatShort } from "@/lib/time";
import { useTokens } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

const LABEL_W = 90;
const BAR_H = 8;
/** a one-day task is a bar you can see, whatever the window (S6-24) */
const MIN_BAR = 6;

export type MiniBar = { taskId: string; title: string; startsAt: string; endsAt: string; ea: boolean };

export function GanttMini({ bars, from, to, onOpen }: { bars: MiniBar[]; from: string; to: string; onOpen: (id: string) => void }) {
  const c = useTokens();
  const [trackWidth, setTrackWidth] = useState(0);
  const days = daysBetween(from, to) + 1;
  // until the first layout there is no width to divide, so the bars have no
  // honest position — the track renders empty rather than at a guessed scale
  const dayWidth = trackWidth > 0 && days > 0 ? trackWidth / days : 0;

  return (
    <View testID="gantt" style={{ gap: space[2] }}>
      {bars.length === 0 ? (
        <Txt kind="meta">Nothing on the timeline for this focus.</Txt>
      ) : (
        <>
        {bars.map((b) => {
          const g = dayWidth > 0 ? minimumBar(barGeometry(b.startsAt, b.endsAt, from, dayWidth), MIN_BAR, trackWidth) : { x: 0, width: 0 };
          return (
            <View key={b.taskId} style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
              <View style={{ width: LABEL_W }}>
                <Txt numberOfLines={2} kind="meta">
                  {b.title}
                </Txt>
              </View>
              <Pressable
                testID={`gantt-bar-${b.taskId}`}
                accessibilityRole="button"
                accessibilityLabel={b.title}
                aria-label={b.title}
                onPress={() => onOpen(b.taskId)}
                {...touchSlop(15, { "gantt-bar": "1" })}
                onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                // GL-05: the TAP TARGET is a 36px row with the pack's 8px track
                // centred in it. `height: 8` plus padding cannot work — RNW
                // boxes are border-box, so padding compresses (AUDIT_v2 AA-01).
                style={{ flex: 1, minHeight: 36, justifyContent: "center" }}
              >
                <View style={{ height: BAR_H, borderRadius: BAR_H / 2, backgroundColor: c.hairline, overflow: "hidden" }}>
                  <View
                    style={{
                      position: "absolute",
                      left: g.x,
                      width: g.width,
                      height: BAR_H,
                      borderRadius: BAR_H / 2,
                      backgroundColor: b.ea ? c.accentSoft : c.accent,
                      ...(b.ea ? { borderWidth: 1, borderStyle: "dashed" as const, borderColor: c.accentInk } : {}),
                    }}
                  />
                </View>
              </Pressable>
            </View>
          );
        })}
        {/* the track's two ends, dated, under the track and aligned to it — the
            same 90px column the rows keep, so the left date sits on the track's
            first pixel and the right one on its last. Nine pixels is the
            grid's own dense kind (`gridMicro`), the size the review asked for;
            the two dates are the whole axis this card carries. */}
        <View style={{ flexDirection: "row", gap: space[3] }}>
          <View style={{ width: LABEL_W }} />
          <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between" }}>
            <Txt kind="gridMicro" testID="gantt-mini-from">
              {formatShort(from)}
            </Txt>
            <Txt kind="gridMicro" testID="gantt-mini-to">
              {formatShort(to)}
            </Txt>
          </View>
        </View>
        </>
      )}
    </View>
  );
}
