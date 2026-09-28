/**
 * GanttUnscheduled — the lane for tasks with no dates, and the drag that gives
 * them one (G-1, GT-07).
 *
 * Unscheduled is not an error state. It is where a task waits to be given a
 * place, so the lane sits last, after "No project" (resolution #16), and a row
 * leaves it by being dragged onto the chart: the day under the finger becomes
 * the task's day, 9 to 5.
 *
 * TWO COORDINATE SPACES meet here, which is the only hard part. The responder
 * reports PAGE pixels; `lib/ganttAxis.ts` answers in CHART pixels, measured
 * from the window's first day. The chart's page origin and its scroll offset
 * are both the parent's to know, so the parent passes down one function that
 * converts — this file never measures anything, and the conversion is written
 * once rather than once per row.
 *
 * A drop outside the chart schedules nothing. That is the same rule the board
 * follows for a card dropped on the page: a drag that guesses moves a task by
 * accident, and this one would invent a date as well as a place.
 *
 * ONE BOX, NOT SEVEN (ux round S6-29). Every row used to draw its own dashed
 * outline, so between any two rows there were two dashed rules 3px apart —
 * which the pack forbids twice over ("borders: hairlines only"; "rows inside
 * separated by 1px Hairline") — and each row carried a title and nothing
 * else in a box 1,180px wide. The lane is the pack's Ghost now: one dashed
 * Hairline box at the card radius, rows inside separated by a solid hairline,
 * each row carrying the meta line every other task surface carries. The
 * finished tasks the lane used to list are the parent's to exclude
 * (`Gantt.tsx`), and it does.
 */
import React, { useMemo } from "react";
import { View } from "react-native";
import { Txt } from "@/theme/ui";
import { isTouchClass } from "@/lib/autoLock";
import { createDrag, type DropTarget } from "@/lib/drag";
import { scheduleOnDay, type Span } from "@/lib/ganttAxis";
import { useTokens } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

const ROW_H = 36;
/** matches `GanttBar`'s hold — one gesture grammar for the whole timeline. */
const HOLD_MS = 600;

/** `meta` is `taskMetaRuns`' output — the one composer's line, split around
 * the high-priority phrase so the row can draw it in the accent tone (JQ-3). */
export type UnscheduledItem = { id: string; title: string; meta: { text: string; accent: boolean }[] };

export function GanttUnscheduled({
  items,
  chartTarget,
  dayAtPageX,
  onOpen,
  onSchedule,
}: {
  items: UnscheduledItem[];
  /** the chart's frame in PAGE coordinates, read once at the start of each
   * gesture — the same rule the board follows, so a lane that reflows under
   * the finger cannot change where the drop lands. */
  chartTarget: () => DropTarget[];
  /** page x → the day under it, or null when the chart has not been measured */
  dayAtPageX: (pageX: number) => string | null;
  onOpen: (id: string) => void;
  onSchedule: (id: string, span: Span) => void;
}) {
  const c = useTokens();
  return (
    <View testID="gantt-unscheduled" style={{ gap: space[3], marginTop: space[3] }}>
      {/* G1R2-05: the G1R1-02 fix landed in one file of two, so the fifth lane
          was still typeset as a caption while the other four were headings. */}
      <Txt kind="label" testID="gantt-lane-unscheduled">
        Unscheduled
      </Txt>
      {/* the pack's Ghost — "1px dashed Hairline, radius 10" — for a box of
          things not placed yet, which is what these are (G1R1-06's reading of
          the dashed outline, kept; the seven boxes it was drawn as, not).
          Horizontal padding on the box and none on the rows, so the hairlines
          are inset the way a card's are. */}
      <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: c.hairline, borderRadius: radius.card, paddingHorizontal: space[6] }}>
        {items.map((it, i) => (
          <UnscheduledRow key={it.id} item={it} last={i === items.length - 1} chartTarget={chartTarget} dayAtPageX={dayAtPageX} onOpen={onOpen} onSchedule={onSchedule} />
        ))}
      </View>
    </View>
  );
}

function UnscheduledRow({
  item,
  last,
  chartTarget,
  dayAtPageX,
  onOpen,
  onSchedule,
}: {
  item: UnscheduledItem;
  last: boolean;
  chartTarget: () => DropTarget[];
  dayAtPageX: (pageX: number) => string | null;
  onOpen: (id: string) => void;
  onSchedule: (id: string, span: Span) => void;
}) {
  const c = useTokens();
  const [dragging, setDragging] = React.useState(false);
  /** whether the gesture has actually been picked up. A ref, because
   *  `onResponderTerminationRequest` is asked outside the render that set it. */
  const live = React.useRef(false);

  const drag = useMemo(
    () =>
      createDrag({
        targets: chartTarget,
        // the same gate the bars use, and for the same reason (GT-08). Lifting
        // a row out of this lane means dragging it UP onto the chart — 250px of
        // vertical travel at 393 — and the page's own scroller reads that as a
        // scroll and terminates the gesture. On touch the finger waits first;
        // on a desktop there is nothing to disambiguate and no delay is charged.
        ...(isTouchClass() ? { holdMs: HOLD_MS } : {}),
        onStart: () => {
          live.current = true;
          setDragging(true);
        },
        onMove: () => {},
        onTap: () => onOpen(item.id),
        onDrop: (_id, target, at) => {
          live.current = false;
          setDragging(false);
          if (target == null) return;
          const day = dayAtPageX(at.x);
          if (day == null) return;
          onSchedule(item.id, scheduleOnDay(day));
        },
      }),
    [item.id, chartTarget, dayAtPageX, onOpen, onSchedule],
  );

  return (
    <View
      testID={`gantt-unscheduled-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      aria-label={item.title}
      style={{
        minHeight: ROW_H,
        justifyContent: "center",
        paddingVertical: space[4],
        // the row's only border is the hairline under it, and the last row
        // has none: the box draws the outline (S6-29)
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.hairline,
        // picked up: the pack's Inset (Accent soft), the same dress the board
        // gives the lane a card is over (S6-35). It was `selected` — the undo
        // toast's near-black ink, with Muted text on it.
        backgroundColor: dragging ? c.accentSoft : "transparent",
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => drag.down(item.id, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      onResponderMove={(e) => drag.move({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      onResponderRelease={(e) => drag.up({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      /**
       * Once the row is PICKED UP it does not let go (GT-07).
       *
       * The hold gates how this component reads a gesture; it does nothing
       * about who owns it. Lifting a row onto the chart is ~250px of vertical
       * travel at 393, and the page's scroller asks to take exactly that — so
       * the drag was being terminated mid-flight and the drop never arrived,
       * hold or no hold. Refusing the request only while live keeps both
       * behaviours: before pickup the page still scrolls normally, after it the
       * finger is moving a task and the page holds still.
       */
      onResponderTerminationRequest={() => !live.current}
      onResponderTerminate={() => {
        live.current = false;
        setDragging(false);
        drag.cancel();
      }}
    >
      <Txt>{item.title}</Txt>
      {/* JQ-3 on this lane too: one line, one treatment — the runs rejoin to
          exactly the list row's line, with the high-priority phrase accented */}
      <Txt kind="meta">
        {item.meta.map((r, i) => (
          <Txt key={i} kind="meta" tone={r.accent ? "accentInk" : undefined}>
            {r.text}
          </Txt>
        ))}
      </Txt>
    </View>
  );
}
