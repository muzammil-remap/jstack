/**
 * GoalsAllDialog (LG-04) — Goals' "all": every goal that is no longer in play.
 *
 * It is `SearchableListDialog` like every other "all" (OP-08): one component
 * parameterised by its route, so a second archive cannot grow its own query
 * box that behaves differently.
 *
 * The rows open the same `goal` detail the card's rows do, which is what makes
 * an archived goal READ-ONLY without a second component: `GoalDetail` shows
 * Done and Drop only while a goal is active, and its history only once it is
 * not (LG-02). One dialog, two states, no duplicate of the same nine fields.
 *
 * Filtered over the whole archive by the dialog's own needle rather than by a
 * `?q=` the route does not have: a goal archive is a handful of rows, and
 * inventing a server parameter this row does not need would be a claim with
 * nothing behind it (rule 15). `source` and `text` are all this file says
 * about that (P-4, F-55) — the same shape `MemoryHistoryDialog` and
 * `IssuesAllDialog` use.
 */
import React from "react";
import { View } from "react-native";
import { SearchableListDialog } from "@/components/chrome/SearchableListDialog";
import { Meta, Row, Txt } from "@/theme/ui";
import { goalMetaLine } from "@/lib/goalMeta";
import { useSessionStore } from "@/stores/session";
import type { Goal } from "@/data/types";

export function GoalsAllDialog({ onClose }: { onClose: () => void }) {
  const openModal = useSessionStore((s) => s.openModal);

  return (
    <SearchableListDialog<Goal>
      testID="goals-all"
      title="All goals"
      placeholder="Search goals"
      emptyText="No matches."
      source={(adapter) => adapter.getGoalsHistory()}
      text={(goal) => `${goal.area} ${goal.text}`}
      onClose={onClose}
      renderRow={(goal, _i, last) => (
        // `openModal` alone: the goal replaces this dialog in the one modal
        // slot (the header of `SearchableListDialog` says why nothing else)
        <Row key={goal.id} testID={`goals-all-row-${goal.id}`} last={last} onPress={() => openModal("goal", goal.id)}>
          <View style={{ flex: 1 }}>
            <Txt>{goal.text}</Txt>
            <Meta testID={`goals-all-meta-${goal.id}`}>
              {goal.area} · {goalMetaLine(goal)}
            </Meta>
          </View>
        </Row>
      )}
    />
  );
}
