/**
 * BoardCard — one card on the board (B-1, BD-04/BD-05/BD-06, ADR-45).
 *
 * It is a card you can PICK UP, which is why it is not a `Pressable` with an
 * `onPress`: the same gesture has to be able to end as a tap that opens the
 * task or as a drag that moves it, and only `lib/drag.ts` knows which it was.
 * The responder events are wired straight to it; everything that decides what
 * a sequence means lives there, where a test can drive it as arithmetic.
 *
 * BD-06: an agent's card looks like an agent's card. The EA tag and the dashed
 * marker the list row has carried since T-2, the working pulse from T-5, and
 * for a person the initial in a circle — because "who is on this" is the first
 * question a board answers, and until this row every card looked the same.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Btn, IconBtn, ListCard, Row, Tag, Txt } from "@/theme/ui";
import { WorkMark } from "@/components/tasks/WorkMark";
import { OWNER_COL } from "@/lib/labelColumn";
import { ownerShort, taskMetaRuns } from "@/lib/taskMeta";
import { radius, sizes, space } from "@/theme/tokens";
import { useSessionStore } from "@/stores/session";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTasksStore } from "@/stores/tasks";
import { useTokens } from "@/theme/ThemeProvider";
import { webData } from "@/lib/webData";
import type { Column, Task } from "@/data/types";

/** The ⋮ button's own width, reserved on the title's right. It is absolutely
 * positioned so the META gets the card's full width — round 1 put it in the
 * title's row and left the title 106px, round 2 moved it to the meta's row and
 * left the META 103px, which was moving the problem rather than solving it
 * (ux round 2, B2-01). Out of the flow it costs one row's right edge instead
 * of every row's width.
 *
 * "One row's right edge" is only true if that row is at least as TALL as the
 * button (ux round S6-03). It was not: a one-line title is 17px and the
 * button is 36, so the meta row laid out under the button's lower half and
 * the three dots landed on `recurring` in every desktop board frame. The
 * title row is never shorter than the button now — the decision stands
 * (§4, BD-06: absolute, top-right, the gutter on the title only) and the
 * meta still gets the card's full width; a one-line card is 19px taller. */
const MENU_GUTTER = 40;

export function BoardCard({
  task,
  columns,
  opacity,
  onMove,
  responder,
}: {
  task: Task;
  /** the columns this card can be moved TO — its own is not offered */
  columns: Column[];
  /** 1 is undimmed. Two different dims mean two different things, so the board
   * passes the NUMBER rather than a boolean: a Done card is quiet (0.7) and a
   * card that is not the one being dragged is further back (0.55). */
  opacity: number;
  onMove: (column: Column) => void;
  /** the drag's own responder props, from `Board` */
  responder: Record<string, unknown>;
}) {
  const c = useTokens();
  const [menuOpen, setMenuOpen] = useState(false);
  const openTask = useTaskCardStore((s) => s.openTask);
  // The list's rule, not a second one (ux round 2, B2-04): a marker means
  // "somebody else's", so the person looking gets none. B-1 shipped a circle
  // drawn for EVERYONE, and a review counted ten identical "J"s on a board
  // whose list beside it marked two rows.
  const mine = useSessionStore((s) => s.isMine);
  // JQ-4, same source as the list row: one abbreviation per person, read
  // from the roster so the card and the row can never disagree.
  const roster = useTasksStore((s) => s.roster);
  const mark = task.owner === "ea" ? "EA" : mine(task.owner) ? null : ownerShort(task.owner, roster);
  const isAgent = task.owner === "ea" || task.owner === "dev";

  return (
    <View
      testID={`board-card-${task.id}`}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      {...responder}
      {...webData({ "board-card": task.id })}
      style={{
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.cardBorder,
        borderRadius: radius.card,
        padding: space[4],
        opacity,
        // T-2's dashed marker, on the board at last: an agent's card is
        // outlined the way an agent's checkbox is
        ...(isAgent ? { borderStyle: "dashed" as const, borderColor: c.accentInk } : {}),
      }}
    >
      {/* The TITLE gets the whole row, less the ⋮'s gutter on its right — and
          the row is the button's height at least, centred on its dots, so the
          meta below it starts under the button rather than beneath it (S6-03). */}
      <View style={{ minHeight: sizes.iconBtnCard, justifyContent: "center" }}>
        <Txt style={{ paddingRight: MENU_GUTTER }}>{task.title}</Txt>
      </View>
      {/* The meta gets the card's FULL width: the marker is a 25px tag, not a
          20px circle beside a 25px tag on a different baseline (B2-02). */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[1] }}>
        {/* S6-14: the mark's slot is fixed and empty when there is no mark, so
            the meta starts on one x from card to card — the list row's rule,
            the list row's constant */}
        <View style={{ width: OWNER_COL }}>{mark != null && <Tag testID={`board-tag-${task.id}`} label={mark} />}</View>
        {/* JQ-3 on the board too: one line, one treatment. A card whose meta
            read differently from the list row for the same task is exactly the
            drift B2-07 recorded. */}
        <Txt kind="meta" style={{ flex: 1 }} testID={`board-meta-${task.id}`}>
          {taskMetaRuns(task, undefined, { marks: true }).map((r, i) => (
            <Txt key={i} kind="meta" tone={r.accent ? "accentInk" : undefined}>
              {r.text}
            </Txt>
          ))}
        </Txt>
      </View>
      {/* BD-05: the same move, without a drag. A board that can only be
          rearranged by dragging is a board a keyboard, a screen reader and a
          thumb on a moving train cannot rearrange. */}
      <View style={{ position: "absolute", top: space[4], right: space[4] }}>
        <IconBtn
          testID={`board-menu-${task.id}`}
          icon="more_horiz"
          inCard
          strongGlyph
          accessibilityLabel={`More for ${task.title}`}
          onPress={() => setMenuOpen((v) => !v)}
        />
      </View>
      <WorkMark work={task.work} taskId={task.id} />

      {menuOpen && (
        <View testID={`board-card-menu-${task.id}`} style={{ marginTop: space[3], gap: space[2] }}>
          <Txt kind="meta">Move to…</Txt>
          <ListCard>
            {columns.map((col, i) => (
              <Row key={col.id} testID={`board-move-${task.id}-${col.id}`} last={i === columns.length - 1}>
                <Txt
                  style={{ flex: 1, minHeight: 36, lineHeight: 36 }}
                  accessibilityLabel={`Move ${task.title} to ${col.name}`}
                  onPress={() => {
                    setMenuOpen(false);
                    onMove(col);
                  }}
                >
                  {col.name}
                </Txt>
              </Row>
            ))}
          </ListCard>
          <Btn testID={`board-open-${task.id}`} label="Open" onPress={() => { setMenuOpen(false); openTask(task.id); }} />
        </View>
      )}
    </View>
  );
}
