/**
 * BoardLane — one of the board's columns (B-1, ADR-45; out of `Board.tsx` at
 * ux round S6-20/S6-35, which took that file past its 250-line cap).
 *
 * A lane is the mock's Hairline surface (`.board .bcol`) with a SECTION LABEL
 * for a heading — 11.5 tracked caps in Accent ink (ux-review R3-04) — and the
 * pack's Marker badge for its count. S6-20: "NOW · 1" printed the count as
 * text after a dot where every other counted label in the app carries the
 * badge ("Count badge: 16px tall pill, Marker fill, white 10px"); B-77 fixed
 * the same thing on Find, and the lanes were not part of that fix.
 *
 * While a card is in the air a lane is either the drop the card will take or
 * it is not, and it says which (S6-35). The drag state used to be a 15% dim on
 * everything except the held card — the pack's Pressed value, used for a
 * whole-board mode — with nothing to say where the drop would go. The lane
 * under the pointer takes an Accent-soft fill and a dashed Accent-ink border:
 * the pack's Inset and the EA-owned card's own border, no new token. The
 * card's OWN lane never does, because a drop there is a no-op and a highlight
 * promises a move. The state is emitted as `data-drop-target` so a spec can
 * read it mid-gesture; the border is always drawn (transparent at rest) so
 * becoming the drop moves no pixel of the cards inside.
 *
 * Done is NOT DIMMED (ux rounds 1 and 2, B1-09). It was 0.55, which put its
 * meta at 1.89:1; 0.7 moved that to 2.31:1; the pack asks 4.6:1, and no
 * opacity that still READS as dimmed gets there — a dim is a blunt instrument
 * that lands on the text as hard as on the surface. The lane is headed "Done"
 * and the card's own meta says when: the board does not have to whisper it as
 * well. 0.55 stays for the cards a drag is not carrying, where the dim is
 * momentary and nobody is reading them.
 */
import React from "react";
import { View } from "react-native";
import { BoardCard } from "@/components/tasks/BoardCard";
import { Label } from "@/theme/ui";
import { webData } from "@/lib/webData";
import { radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import type { Column, Task } from "@/data/types";

export function BoardLane({
  col,
  cards,
  columns,
  width,
  dragging,
  isDrop,
  laneRef,
  onLayout,
  onMove,
  responderFor,
}: {
  col: Column;
  cards: Task[];
  /** every visible column — a card's menu offers the others */
  columns: Column[];
  width: number;
  /** the id of the card in the air, if any */
  dragging: string | null;
  /** true while the pointer is over THIS lane with a card from another */
  isDrop: boolean;
  laneRef: (node: View | null) => void;
  onLayout: () => void;
  onMove: (taskId: string, column: Column) => void;
  responderFor: (taskId: string) => Record<string, unknown>;
}) {
  const c = useTokens();
  return (
    <View
      testID={`board-lane-${col.id}`}
      ref={laneRef}
      onLayout={onLayout}
      {...webData({ dropTarget: isDrop ? "on" : "off" })}
      style={{
        width,
        gap: space[2],
        backgroundColor: isDrop ? c.accentSoft : c.hairline,
        borderRadius: radius.card,
        padding: space[2],
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: isDrop ? c.accentInk : "transparent",
      }}
    >
      <Label badge={cards.length}>{col.name}</Label>
      {cards.map((t) => (
        <BoardCard
          key={t.id}
          task={t}
          columns={columns.filter((other) => other.id !== col.id)}
          opacity={dragging != null && dragging !== t.id ? 0.55 : 1}
          onMove={(target) => onMove(t.id, target)}
          responder={responderFor(t.id)}
        />
      ))}
    </View>
  );
}
