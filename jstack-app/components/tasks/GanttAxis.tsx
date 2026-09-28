/**
 * GanttAxis — the timeline's scale (G-1, GT-01/GT-02).
 *
 * Three bands and a line, all measured by `lib/ganttAxis.ts` and none of them
 * decided here: months, then weeks from Monday, then the days themselves with
 * the weekends shaded. This component turns numbers into Views and nothing
 * else, which is why the geometry has a unit test and this has a spec.
 *
 * It replaces two captions and a rule. The old axis printed the window's first
 * and last day and put "today" somewhere between them, because a percentage
 * has no other way to say where you are — and F-1 then had to clamp the caption
 * away from both edges to stop it colliding with the dates it sat between. A
 * scale does not need clamping: every day has a place, so the label can sit on
 * its own day and the rule can sit on the true instant.
 *
 * The width is the axis's own (days × `DAY_WIDTH`), never the container's. The
 * parent scrolls it; it does not fit itself to anything.
 */
import React from "react";
import { View } from "react-native";
import { Txt } from "@/theme/ui";
import { useTokens } from "@/theme/ThemeProvider";
import type { Axis } from "@/lib/ganttAxis";

const MONTH_H = 18;
const WEEK_H = 16;
const DAY_H = 10;
export const AXIS_HEIGHT = MONTH_H + WEEK_H + DAY_H;

export function GanttAxis({ axis, nowX, height }: { axis: Axis; nowX: number | null; height: number }) {
  const c = useTokens();

  return (
    <View testID="gantt-axis" style={{ width: axis.width }}>
      {/* weekends run the WHOLE height, behind the bars — a weekend shaded only
          in the header strip tells you which column is Saturday exactly where
          there is nothing to read, and stops telling you the moment your eye
          moves down to the bar it was meant to explain. */}
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: axis.width, height: AXIS_HEIGHT + height }}>
        {axis.days
          .filter((d) => d.weekend)
          .map((d) => (
            <View
              key={d.key}
              testID={`gantt-weekend-${d.key}`}
              // on EACH band, not only on the container. react-native-web emits
              // an explicit `pointer-events: auto` on every View, so a child
              // does not inherit its parent's `none` — and this overlay runs the
              // full height of the chart, so without it the shading swallowed
              // every tap and drag on every bar underneath it. The bar's own
              // box was still where `boundingBox()` said it was, which is why
              // the symptom was five gesture failures and no layout complaint.
              pointerEvents="none"
              // G1R1-01: NOT `surfaceInset`. On a card that token computes to
              // the same pixel value as `accentSoft` — the EA bar's fill and the
              // Unscheduled row's — so a weekend, an owner and a state were all
              // painted the one colour, and the shading read as a selection.
              // `ground` is the page's own neutral: a recess behind the card,
              // which is what a weekend is (hard rule 20, one meaning per colour).
              style={{ position: "absolute", left: d.x, top: 0, width: axis.dayWidth, bottom: 0, backgroundColor: c.ground }}
            />
          ))}
      </View>

      <View style={{ height: MONTH_H, flexDirection: "row" }}>
        {axis.months.map((m) => (
          <View key={m.key} style={{ position: "absolute", left: m.x, width: m.width }}>
            {/* G1R1-05: month and week were the same family, size and colour,
                separated only by y — two bands reading as one caption. The month
                takes the label kind, the week keeps meta. */}
            {/* S6-04b: one line, always. A band is a fixed height and a
                caption is not — a label wider than the band it sits in wraps,
                and the second line hangs out of the band, through the row
                below and under the now-rule. `lib/ganttAxis.ts` keeps a WEEK
                band wide enough to caption; a month sliver at the window's
                edge can still be narrower than its own name, and this is what
                stops that from moving anything. */}
            <Txt kind="label" testID={`gantt-month-${m.key}`} numberOfLines={1}>
              {m.label}
            </Txt>
          </View>
        ))}
      </View>

      <View style={{ height: WEEK_H }}>
        {axis.weeks.map((w) => (
          <View key={w.key} style={{ position: "absolute", left: w.x, width: w.width, flexDirection: "row", alignItems: "center" }}>
            {/* the week's own hairline, so a band is a band and not just a
                label floating over the days it covers */}
            <View style={{ width: 1, height: WEEK_H - 4, backgroundColor: c.hairline }} />
            <Txt kind="meta" testID={`gantt-week-${w.key}`} numberOfLines={1} style={{ marginLeft: 4 }}>
              {w.label}
            </Txt>
          </View>
        ))}
      </View>

      <View style={{ height: DAY_H, flexDirection: "row" }}>
        {axis.days.map((d) => (
          <View key={d.key} testID={`gantt-day-${d.key}`} style={{ width: axis.dayWidth, height: DAY_H, justifyContent: "flex-end" }}>
            {/* Hairline on card measured 1.13:1 light and 1.27:1 dark — a tick
                nobody can see is a band that is missing. Muted is the meta
                tone, which is what a tick is. */}
            <View style={{ height: 4, width: 1, backgroundColor: c.muted, opacity: 0.5 }} />
          </View>
        ))}
      </View>

      {/* the today line, at the instant rather than at the day boundary. It
          runs the full height for the reason the weekend shading does: a mark
          that stops at the header cannot be compared with a bar. */}
      {nowX != null && (
        <View
          testID="gantt-today"
          pointerEvents="none"
          // G1R2-02: it starts BELOW the month band. Both the month caption and
          // this line are accent ink since round 1, so where they met they read
          // as one mark — the line drew straight through the "P" of "SEP" in all
          // eight frames. The month strip is a caption, not part of the plot;
          // the line loses nothing by starting under it and stops destroying a
          // label the way F-1's clamp was written to prevent.
          //
          // S6-04 moved it below the WEEK captions too, for the same reason
          // one row down: with the window opening today the rule sits 0.7 of a
          // day in, straight through the first caption's glyphs. Both caption
          // rows are captions; the plot starts at the day ticks, and so does
          // the rule.
          style={{ position: "absolute", left: nowX, top: MONTH_H + WEEK_H, width: 1, height: DAY_H + height, backgroundColor: c.accentInk }}
        />
      )}
    </View>
  );
}
