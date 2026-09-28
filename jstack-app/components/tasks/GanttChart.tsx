/**
 * GanttChart — the scrolling half of the timeline, and everything that shares
 * its coordinate space (G-1, GT-02/GT-03/GT-07).
 *
 * A frozen label column beside a chart that scrolls. That is what makes a
 * 90-day range usable on a 393px phone: the axis is `days × DAY_WIDTH` wide,
 * and the header scrolls WITH the bars because a header that did not would
 * put every label over the wrong day.
 *
 * The two halves are aligned by ARITHMETIC, not by luck: both sides walk the
 * same lanes and both use `LANE_H` for a heading and `ROW_H` for a task, so
 * row n on the left is row n on the right. A layout that aligned by eye would
 * drift the moment a title wrapped.
 *
 * The unscheduled lane lives here rather than beside it because it drops onto
 * THIS chart, and the page→chart conversion it needs is two numbers only this
 * component has: where the scroller sits on the page, and how far it has
 * scrolled. Keeping them in one file is what stops that conversion being
 * written twice.
 */
import React, { useCallback, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Txt } from "@/theme/ui";
import { GanttAxis, AXIS_HEIGHT } from "@/components/tasks/GanttAxis";
import { GanttBar, ROW_H } from "@/components/tasks/GanttBar";
import { GanttUnscheduled, type UnscheduledItem } from "@/components/tasks/GanttUnscheduled";
import { WorkMark } from "@/components/tasks/WorkMark";
import type { DropTarget } from "@/lib/drag";
import { DAY_WIDTH, dayForX, type Axis, type Span } from "@/lib/ganttAxis";
import { space } from "@/theme/tokens";
import type { Work } from "@/data/types";

/**
 * The label column is a SHARE of the width, not a constant (ux round 1,
 * G1R1-03/G1R1-04).
 *
 * A fixed 160px was two defects at once. At 393 it took 49% of a 326px card and
 * left a 166px porthole — 5.9 days of a 90-day range — and at 1920 it clipped
 * "Recruitment risk memo, Bund…" with 640px of the card standing empty beside
 * it. One number cannot be right at both ends of a five-times width range.
 *
 * A quarter of the width, floored at 104 so a title still has room to say
 * something and capped at 240 so a wide desktop spends its pixels on the
 * timeline. Titles wrap to two lines rather than clipping, which is hard rule
 * 24's own remedy ("keeps at least twenty characters of its title or takes two
 * lines") and is why the rows are sized from the wrap rather than from a
 * constant.
 */
const LABEL_MIN = 104;
const LABEL_MAX = 200;
/**
 * ...and the share is of the CARD, not the window (ux round 2, G1R2-01).
 *
 * Round 1's fix took a quarter of `useLayout().width`, which is the viewport.
 * At 1024 the Tasks card is 417px inside a 1024px window, so a quarter of the
 * window was 240px — 61% of the card — and the plot fell to 153px, worse than
 * the constant it replaced. The card is the only width that means anything
 * here, and the component can measure it.
 *
 * The cap came down 240 → 200 as well: R-18's rule is that a fixed column is
 * sized to the widest word it must hold, measured, and the longest title in the
 * fixture renders about 170px. 240 was 70px taken from the plot for nothing.
 */
const labelWidth = (cardWidth: number) => Math.max(LABEL_MIN, Math.min(LABEL_MAX, Math.round(cardWidth * 0.25)));
const LANE_H = 26;

export type Bar = { taskId: string; title: string; span: Span; ea: boolean; work: Work | undefined };
export type Lane = { project: string; bars: Bar[] };

export function GanttChart({
  axis,
  lanes,
  unscheduled,
  from,
  nowX,
  onOpen,
  onCommit,
}: {
  axis: Axis;
  lanes: Lane[];
  unscheduled: UnscheduledItem[];
  from: string;
  nowX: number | null;
  onOpen: (id: string) => void;
  onCommit: (id: string, next: Span) => void;
}) {
  /**
   * Where the chart is on the page, and how far it has scrolled.
   *
   * Measured into a ref rather than read on demand because `measureInWindow`
   * answers through a callback and a drop cannot wait; refreshed on every
   * layout, which covers the first paint, a resize and a lane appearing.
   * `null` until something has been measured, so a drop before the first
   * layout schedules nothing rather than silently scheduling day one.
   */
  const frame = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const scrollX = useRef(0);
  const box = useRef<View>(null);

  const measure = useCallback(() => {
    box.current?.measureInWindow((x, y, width, height) => {
      frame.current = { x, y, width, height };
    });
  }, []);

  const chartTarget = useCallback((): DropTarget[] => {
    const f = frame.current;
    return f == null ? [] : [{ id: "chart", x: f.x, y: f.y, width: f.width, height: f.height }];
  }, []);

  const dayAtPageX = useCallback(
    (pageX: number): string | null => {
      const f = frame.current;
      if (f == null) return null;
      return dayForX(pageX - f.x + scrollX.current, from, DAY_WIDTH);
    },
    [from],
  );

  // measured, not assumed: this is the card's inner width, and the label column
  // is a share of it. Zero until the first layout, which floors to LABEL_MIN.
  const [cardW, setCardW] = useState(0);
  const LABEL_W = labelWidth(cardW);
  const chartHeight = lanes.reduce((n, l) => n + LANE_H + l.bars.length * ROW_H, 0);

  return (
    <View style={{ gap: space[2] }} onLayout={(e) => setCardW(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: LABEL_W }}>
          <View style={{ height: AXIS_HEIGHT }} />
          {lanes.map((lane) => (
            <View key={lane.project}>
              {/* G1R1-02: a LANE is not a task, and the column said they were.
                  Both were `Txt kind="meta"` six lines apart, so "Home" and
                  "Bundaberg" read as tasks with no bar. The lane takes the
                  label kind — the pack's own section voice — and the task keeps
                  meta, which is Principle 4's three levels doing their job. */}
              <View style={{ height: LANE_H, justifyContent: "flex-end" }}>
                <Txt kind="label" testID={`gantt-lane-${slug(lane.project)}`} numberOfLines={1}>
                  {lane.project}
                </Txt>
              </View>
              {lane.bars.map((b) => (
                <View key={b.taskId} style={{ height: ROW_H, justifyContent: "center", paddingRight: space[2] }}>
                  {/* two lines, never a mid-word cut (hard rule 24, G1R1-03) */}
                  <Txt numberOfLines={2} kind="meta">
                    {b.title}
                  </Txt>
                  {b.work != null && <WorkMark work={b.work} taskId={b.taskId} />}
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* `overflow: hidden` is a second line of defence behind
            `clampToWindow`: nothing drawn for the chart may paint over the
            frozen label column beside it, whatever its own arithmetic says
            (B-45). */}
        <View ref={box} onLayout={measure} style={{ flex: 1, overflow: "hidden" }}>
          <ScrollView
            horizontal
            testID="gantt-scroll"
            showsHorizontalScrollIndicator
            scrollEventThrottle={16}
            onScroll={(e) => (scrollX.current = e.nativeEvent.contentOffset.x)}
            contentContainerStyle={{ width: axis.width }}
          >
            <View style={{ width: axis.width }}>
              <GanttAxis axis={axis} nowX={nowX} height={chartHeight} />
              {lanes.map((lane) => (
                <View key={lane.project}>
                  <View style={{ height: LANE_H }} />
                  {lane.bars.map((b) => (
                    <GanttBar
                      key={b.taskId}
                      taskId={b.taskId}
                      title={b.title}
                      span={b.span}
                      ea={b.ea}
                      from={from}
                      axisWidth={axis.width}
                      onOpen={onOpen}
                      onCommit={onCommit}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      {unscheduled.length > 0 && (
        <GanttUnscheduled items={unscheduled} chartTarget={chartTarget} dayAtPageX={dayAtPageX} onOpen={onOpen} onSchedule={onCommit} />
      )}
    </View>
  );
}

/** a lane's testID half. A project is Josh's word ("No project", "JSTACK"), and
 * a testID with a space in it is a selector nobody can write. */
function slug(project: string): string {
  return project.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
