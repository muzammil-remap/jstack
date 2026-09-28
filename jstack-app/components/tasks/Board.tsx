/**
 * Board — Tasks' Board segment (TK-05, B-1, ADR-45): the lanes are TWENTY'S
 * COLUMNS now, in Twenty's order, on the mock's Hairline lane surface
 * (`.board .bcol{background:var(--hairline);border-radius:var(--r-card);
 * padding:8px}`); Done dimmed; a card opens the task, or moves.
 *
 * `bucketOf` is gone. It read "Now" off a due LABEL — a string the server
 * writes for people to read — and had no lane at all for `in_progress`, so a
 * task the EA was actively working sat in "Next" beside things nobody had
 * started. A card lands in the first column whose `statuses` contains its own,
 * and `Task.column` overrides that when Twenty has been told otherwise.
 *
 * `filters.columns` chooses which of them to show (BD-02), so Josh can see less
 * than Twenty holds without changing anything in Twenty.
 *
 * The mock scrolls the strip horizontally at EVERY width
 * (`.board{overflow-x:auto}`), so this does too — the old `columns < 3` branch
 * left the lanes to overflow their column at 1180+, where column 2 then painted
 * over them, and hid the scrollbar below it so the lanes simply ended mid-word
 * with nothing to say a fourth lane existed (ux-review D2/D3).
 *
 * This file is the strip and the gesture; a lane's own dress — its label,
 * its badge, and how it says it will take the card in the air — is
 * `BoardLane.tsx` (S6-20, S6-35).
 */
import React, { useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { BoardLane } from "@/components/tasks/BoardLane";
import { Txt } from "@/theme/ui";
import { TWENTY_URL } from "@/components/tasks/Gantt";
import { createDrag, type DropTarget } from "@/lib/drag";
import { useSessionStore } from "@/stores/session";
import { packPayload } from "@/layout/dialogKit";
import { useTaskEditsStore } from "@/stores/taskEdits";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTasksStore } from "@/stores/tasks";
import { pagePadPhone, space } from "@/theme/tokens";
import { useLayout } from "@/theme/useLayout";
import type { Column, Task } from "@/data/types";

/**
 * A lane is 200px minimum, which is the mock's own `.board
 * {grid-auto-columns:minmax(200px,1fr)}` and not a number this file chose.
 *
 * Round 1 measured the consequence of the fifth column and asked for 256:
 * V2.1's four lanes took 256 each from the `1fr` branch at wide widths, and
 * five take 203. Raising the MINIMUM to 256 would have fixed the symptom by
 * contradicting the grid the pack specifies, so it was not done here — the
 * card's own geometry was fixed instead (B1-01, see `BoardCard`), which is
 * where B-1 had actually spent the title's width.
 *
 * B1-05 IS CARRIED AND UNFIXED. At the 1024 tier the strip is 408px and two
 * lanes plus their gap are exactly 408, so the board ends flush with the
 * viewport and nothing bleeds past it: only a 5px scrollbar says three more
 * lanes exist, and the first one hidden is In progress — the lane this row was
 * built to add. Every honest fix for that changes `minmax(200px,1fr)`, which is
 * the design pack's decision and not this row's. Named in STATE for A-2.
 */
const COLUMN_MIN_WIDTH = 200;

/** the first column whose statuses contain this task's, unless Twenty has
 * already said which one it is in. A task whose status no column claims is
 * shown in the first column rather than hidden: a board that silently drops a
 * task is worse than one with a card in an odd place. */
function laneOf(task: Task, columns: Column[]): string | undefined {
  if (task.column != null && columns.some((c) => c.id === task.column)) return task.column;
  return (columns.find((c) => c.statuses.includes(task.status)) ?? columns[0])?.id;
}

export function Board() {
  const { phone } = useLayout();
  const list = useTasksStore((s) => s.list);
  const allColumns = useTasksStore((s) => s.columns);
  const hidden = useTasksStore((s) => s.filters.columns);
  const loadColumns = useTasksStore((s) => s.loadColumns);
  const moveTask = useTaskEditsStore((s) => s.moveTask);
  const openModal = useSessionStore((s) => s.openModal);
  const showToast = useSessionStore((s) => s.showToast);

  // BD-02: `filters.columns` is the VISIBLE set, and absent means all — an
  // empty list would otherwise be indistinguishable from "hide everything",
  // which is a board nobody asked for.
  const columns = useMemo(
    () => [...allColumns].sort((a, b) => a.order - b.order).filter((col) => hidden == null || hidden.length === 0 || hidden.includes(col.id)),
    [allColumns, hidden],
  );

  const [stripWidth, setStripWidth] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  /** the lane under the pointer while a card is in the air (S6-35) */
  const [over, setOver] = useState<string | null>(null);
  const frames = useRef<Record<string, DropTarget>>({});
  const lanes = useRef<Record<string, View | null>>({});

  /**
   * Lanes are measured in WINDOW coordinates, which is the space the responder
   * reports its pointer in. `onLayout`'s own rectangle is relative to the
   * PARENT, and the parent here is a row inside a horizontal scroller — so the
   * first version compared a pointer at pageX 900 against a lane at x 200 and
   * every drop landed on nothing.
   *
   * `measureInWindow` is viewport-relative and `pageX` is document-relative,
   * which agree here because this app's document never scrolls: every screen
   * scrolls an inner div (the same fact `tools/capture-v2.mjs` had to learn to
   * take a full-page frame). If that ever stops being true, this is the line
   * that has to learn about scroll offsets.
   */
  const measureLane = (id: string) => {
    lanes.current[id]?.measureInWindow((x, y, width, height) => {
      frames.current[id] = { id, x, y, width, height };
    });
  };

  const landed = () => {
    setDragging(null);
    setOver(null);
  };

  const drag = useMemo(
    () =>
      createDrag({
        targets: () => Object.values(frames.current),
        onStart: (id) => setDragging(id),
        onMove: () => {},
        onOver: setOver,
        onDrop: (id, target) => {
          landed();
          const column = columns.find((col) => col.id === target);
          // dropped on nothing, or back where it started: the card goes home
          // and nothing is sent (`moveTask` answers a same-column drop with
          // null). A drag that guessed a column would move a task by
          // accident, which is the one thing it must never do.
          if (column != null) void moveTask(id, column).then((refusal) => refusal != null && showToast(refusal.reason));
        },
        onTap: (id) => {
          landed();
          useTaskCardStore.getState().openTask(id);
        },
      }),
    [columns, moveTask, showToast],
  );

  /** RNW's responder events, wired to the arithmetic. `onStartShouldSetResponder`
   * claims the gesture on touch-down so a card can be picked up; the strip's own
   * horizontal scroll still wins when the finger moves before the threshold. */
  const responderFor = (taskId: string) => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: { nativeEvent: { pageX: number; pageY: number } }) => drag.down(taskId, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }),
    onResponderMove: (e: { nativeEvent: { pageX: number; pageY: number } }) => drag.move({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }),
    onResponderRelease: (e: { nativeEvent: { pageX: number; pageY: number } }) => drag.up({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }),
    // a terminated gesture did not happen: the dim and the drop dress go with it
    onResponderTerminate: () => {
      drag.cancel();
      landed();
    },
  });

  const gap = space[3];
  const laneWidth =
    columns.length > 0 && stripWidth >= columns.length * COLUMN_MIN_WIDTH + (columns.length - 1) * gap
      ? (stripWidth - (columns.length - 1) * gap) / columns.length
      : COLUMN_MIN_WIDTH;

  // whole lanes that fit in the strip; the rest are off the right edge
  const visibleLanes = stripWidth > 0 ? Math.floor((stripWidth + gap) / (laneWidth + gap)) : columns.length;
  const hiddenLanes = Math.max(0, columns.length - visibleLanes);

  // the lane the card in the air came from: never dressed as the drop, because
  // a drop there is a no-op and a highlight promises a move (S6-35)
  const held = dragging != null ? list.find((t) => t.id === dragging) : undefined;
  const home = held != null ? laneOf(held, columns) : null;

  const content = (
    <View testID="board" style={{ flexDirection: "row", gap }}>
      {columns.map((col) => (
        <BoardLane
          key={col.id}
          col={col}
          cards={list.filter((t) => laneOf(t, columns) === col.id)}
          columns={columns}
          width={laneWidth}
          dragging={dragging}
          isDrop={dragging != null && over === col.id && home !== col.id}
          laneRef={(node) => {
            lanes.current[col.id] = node;
          }}
          onLayout={() => measureLane(col.id)}
          onMove={(id, column) => void moveTask(id, column).then((refusal) => refusal != null && showToast(refusal.reason))}
          responderFor={responderFor}
        />
      ))}
    </View>
  );

  return (
    <View style={{ gap: space[2] }}>
      {/* B2-03 (P-9): on a phone the strip runs to the SCREEN edge — it used to
          clip 20 px inside it, against the page padding, with ground visible
          beyond, so a card was guillotined through a letter with room to
          spare. Scrolling still reaches every lane; the cut is now the edge. */}
      <ScrollView
        testID="board-scroll"
        horizontal
        showsHorizontalScrollIndicator
        style={phone ? { paddingBottom: space[1], marginHorizontal: -pagePadPhone.sides } : { paddingBottom: space[1] }}
        contentContainerStyle={phone ? { paddingHorizontal: pagePadPhone.sides } : undefined}
        onLayout={(e) => setStripWidth(e.nativeEvent.layout.width)}
      >
        {content}
      </ScrollView>
      {/* BD-03: the names are Twenty's, and the line says so rather than
          offering a rename this app cannot honour. */}
      {/* 24px apart, not 12: at 12 the two links read as one label with a wide
          word space in it (ux round 1, B1-06). */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[9] }}>
        {/* B1-05: how many lanes are off the right edge, said in words.
            At the 1024 tier two 200px lanes plus their gap come to exactly the
            408px strip, so the board ends flush with the viewport and three
            pixels of flat lane fill are all that hint at three more — the
            first of them In progress, the lane this row exists to add. The
            scrollbar cannot carry that: round 2 measured it at y855 on a 768px
            viewport, 87px below the fold. This says it in the one place a
            person is already reading, and costs the mock's
            `minmax(200px,1fr)` nothing. */}
        {/* A4-11: Muted, and no tap height. Rule 20 gives Accent ink to the
            TAPPABLE phrase, and this is a cue — it was wearing the same ink,
            the same 36px target and an arrow as the two links beside it, both
            of which act. `lineHeight` alone keeps it on their baseline. */}
        {hiddenLanes > 0 && (
          <Txt testID="board-more-lanes" kind="meta" tone="muted" style={{ lineHeight: 36 }}>
            {`${hiddenLanes} more →`}
          </Txt>
        )}
        <Txt testID="board-columns-twenty" onPress={() => openModal("external-link", packPayload(TWENTY_URL, "Twenty"))} kind="meta" tone="accentInk" style={{ minHeight: 36, lineHeight: 36 }}>
          Columns · edit in Twenty
        </Txt>
        <Txt testID="board-refresh" onPress={() => void loadColumns()} kind="meta" tone="accentInk" style={{ minHeight: 36, lineHeight: 36 }}>
          Refresh
        </Txt>
      </View>
    </View>
  );
}
