/**
 * GanttBar — one task on the timeline, and the three gestures it answers
 * (G-1, GT-04/GT-05/GT-06/GT-08).
 *
 * The bar body MOVES the task (both dates, so it keeps its length); the two
 * handles RESIZE it (one date each, and neither may cross the other); a press
 * that never travels 4px OPENS the card. Which of the three a pointer sequence
 * meant is decided by `lib/drag.ts` — the same arithmetic the board uses, with
 * `holdMs` set because this surface scrolls sideways underneath the finger and
 * the board's does not.
 *
 * Nothing here computes a date. The gesture reports pixels, `DAY_WIDTH` turns a
 * pixel delta into a number of DAYS, and `moveSpan`/`resizeSpan` turn days into
 * instants that keep their wall-clock time. This file's whole job is to hold
 * the in-flight offset so the bar follows the finger before the write lands.
 *
 * Two things here are less obvious than they look:
 *
 * 1. The offset is held in DAYS, not pixels, so the bar moves in the same steps
 *    the drop will be snapped to. A bar that slides continuously and then jumps
 *    on release has told the person the wrong thing for the whole gesture.
 * 2. `onMove` is ignored until the gesture is actually picked up. `lib/drag.ts`
 *    reports every move, including the ones before the threshold and before the
 *    long press — which is right for a caller drawing a pointer ghost and wrong
 *    for one drawing the subject itself. On the board `onMove` is a no-op, so
 *    this only becomes visible here: without the guard the bar creeps during
 *    the 600ms hold and then snaps back if the finger turns out to be scrolling.
 */
import React, { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { isTouchClass } from "@/lib/autoLock";
import { webData } from "@/lib/webData";
import { createDrag } from "@/lib/drag";
import { DAY_WIDTH, barGeometry, clampToWindow, edgeAtX, moveSpan, resizeSpan, shiftedBox, type Span } from "@/lib/ganttAxis";
import { useTokens } from "@/theme/ThemeProvider";

/**
 * How long a finger rests before the timeline lets go of it (GT-08). 600ms is
 * the platform's own long press, and the e2e drives exactly that.
 *
 * ON TOUCH ONLY, and the distinction is not cosmetic. The hold exists because a
 * horizontal swipe on a phone is ambiguous — scroll the timeline, or move this
 * task — and waiting is the only thing that can separate them. A mouse has no
 * such ambiguity: dragging a bar is the only thing a press-and-move on it can
 * mean, and making a desktop user hold still for 600ms first would be a delay
 * charged for nothing. `isTouchClass()` is ADR-41's own test, so the Gantt and
 * the lock agree about what kind of device this is (a touch laptop is a
 * desktop).
 */
const HOLD_MS = 600;
const BAR_H = 8;
/**
 * 44, not 36 (ux round 1, G1R1-03). The label column wraps a long title to two
 * meta lines rather than clipping it mid-word, and the two halves of the chart
 * are aligned by arithmetic — both walk the same lanes at the same row height —
 * so the row has to be tall enough for the taller of the two. Still well over
 * GL-05's 36px floor, which the bar's own hit area has to clear anyway.
 */
export const ROW_H = 44;
/** the grab area at each end. Narrower than the 36px floor on purpose: it is
 * not a control of its own, it is an EDGE of one — GL-05 sweeps interactive
 * elements, and the element here is the bar, 36px tall, with the handles
 * inside it. */
const HANDLE_W = 12;

type Edge = "start" | "end" | null;
/** what the finger is doing right now: which edge it took, and how many whole
 * days it has travelled. `null` when nothing is in flight. */
type InFlight = { edge: Edge; days: number };

export function GanttBar({
  taskId,
  title,
  span,
  ea,
  from,
  axisWidth,
  onOpen,
  onCommit,
}: {
  taskId: string;
  title: string;
  span: Span;
  ea: boolean;
  from: string;
  axisWidth: number;
  onOpen: (id: string) => void;
  onCommit: (id: string, next: Span) => void;
}) {
  const c = useTokens();
  const [flight, setFlight] = useState<InFlight | null>(null);
  const grabbed = useRef<Edge>(null);
  const startX = useRef(0);
  const live = useRef(false);
  /** the last value `onMove` saw. `onDrop` cannot read state — the setter it
   * would be reading was queued in the same tick. */
  const days = useRef(0);
  /** the drawn width, for `edgeAt` — read in the responder, which runs outside
   * the render that computed it. */
  const boxWidth = useRef(0);

  const base = barGeometry(span.startsAt, span.endsAt, from);

  const drag = useMemo(
    () =>
      createDrag({
        targets: () => [],
        ...(isTouchClass() ? { holdMs: HOLD_MS } : {}),
        onStart: () => {
          live.current = true;
          days.current = 0;
          setFlight({ edge: grabbed.current, days: 0 });
        },
        onMove: (at) => {
          if (!live.current) return;
          const d = Math.round((at.x - startX.current) / DAY_WIDTH);
          if (d === days.current) return;
          days.current = d;
          setFlight({ edge: grabbed.current, days: d });
        },
        onTap: () => onOpen(taskId),
        onDrop: () => {
          const moved = days.current;
          const edge = grabbed.current;
          live.current = false;
          days.current = 0;
          grabbed.current = null;
          setFlight(null);
          if (moved === 0) return;
          onCommit(taskId, edge == null ? moveSpan(span, moved) : resizeSpan(span, edge, moved));
        },
      }),
    // `span` is read inside `onDrop`, so the gesture is rebuilt when the dates
    // change: otherwise a second drag would be applied to the dates the bar
    // held before the first one landed.
    [taskId, span, onOpen, onCommit],
  );

  /**
   * ONE responder on the bar, and the edge decided from WHERE the press landed.
   *
   * The handles used to carry responders of their own, which does not work and
   * fails in the most misleading way available: a parent whose
   * `onMoveShouldSetResponder` returns true may STEAL the gesture from its child
   * on the first move, so a drag on a handle became a press the parent then
   * reported as a tap — the card opened and the date never moved, with the right
   * element under the pointer the whole time (B-46).
   *
   * `locationX` is the offset within this View, which is exactly the question:
   * within a handle's width of the left edge is the start, the same of the right
   * edge is the end, anything between is the bar itself. The handles stay as
   * visual affordances with `pointerEvents="none"` — they show where to grab
   * without competing for the grab.
   */
  const edgeAt = (locationX: number, width: number): Edge => edgeAtX(locationX, width, HANDLE_W);

  const responder = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: { nativeEvent: { pageX: number; pageY: number; locationX?: number } }) => {
      grabbed.current = edgeAt(e.nativeEvent.locationX ?? 0, boxWidth.current);
      startX.current = e.nativeEvent.pageX;
      drag.down(taskId, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
    },
    onResponderMove: (e: { nativeEvent: { pageX: number; pageY: number } }) => drag.move({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }),
    onResponderRelease: (e: { nativeEvent: { pageX: number; pageY: number } }) => drag.up({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }),
    // picked up means picked up: the scrolling axis underneath may ask for the
    // gesture back, and while a bar is in flight the answer is no (GT-07's
    // lesson, applied to the bars for the same reason).
    onResponderTerminationRequest: () => !live.current,
    onResponderTerminate: () => {
      live.current = false;
      days.current = 0;
      grabbed.current = null;
      setFlight(null);
      drag.cancel();
    },
  };

  // the in-flight geometry is the axis's arithmetic (F-49): the whole bar or one edge, never under a day
  const moved = shiftedBox(base, flight);

  // cut to the window: a task can start before the range opens or run past its
  // close, and the part outside is not this chart's to draw. Clamped for
  // DRAWING only — the drag's day delta is measured from the pointer, so a
  // clipped bar still moves by what the finger did (B-45).
  const box = clampToWindow(moved, axisWidth);
  const dragging = flight != null;
  boxWidth.current = box?.width ?? 0;
  if (box == null) return <View style={{ height: ROW_H }} />;

  return (
    <View style={{ height: ROW_H, justifyContent: "center" }}>
      <View
        testID={`gantt-bar-${taskId}`}
        accessibilityRole="button"
        accessibilityLabel={title}
        aria-label={title}
        // B-10's lesson, applied one step further. `accessibilityState` is not
        // mapped by react-native-web, and neither — measured, not assumed — is a
        // bare `aria-grabbed` prop: it read `null` in the DOM even when the
        // component was passing "false". `webData` is what this build already
        // uses for a state a test must see (`data-animating` on the orb), so the
        // grabbed state is emitted the same way and can actually be asserted.
        {...webData({ dragging: dragging ? "on" : "off" })}
        style={{ position: "absolute", left: box.x, width: box.width, height: ROW_H, justifyContent: "center", opacity: dragging ? 0.85 : 1 }}
        {...responder}
      >
        <View
          style={{
            height: BAR_H,
            borderRadius: BAR_H / 2,
            backgroundColor: ea ? c.accentSoft : c.accent,
            ...(ea ? { borderWidth: 1, borderStyle: "dashed" as const, borderColor: c.accentInk } : {}),
          }}
        />
        {/* visual affordances only — `pointerEvents="none"` so the press reaches
            the bar, which decides from `locationX` which edge was grabbed */}
        <View pointerEvents="none" testID={`gantt-handle-start-${taskId}`} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: HANDLE_W }} />
        <View pointerEvents="none" testID={`gantt-handle-end-${taskId}`} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: HANDLE_W }} />
      </View>
    </View>
  );
}
