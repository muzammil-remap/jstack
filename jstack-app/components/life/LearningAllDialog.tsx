/**
 * LearningAllDialog (LL-03) — Life › Learning "all".
 *
 * `SearchableListDialog`'s archive shape (P-4, F-55), the same one
 * `GoalsAllDialog` and `IssuesAllDialog` use: `source`/`text` rather than
 * `fetch`/`rows`. `/learning?q=` exists now (LL-01), but the whole list is a
 * handful of rows — the same reasoning `GoalsAllDialog`'s own header gives
 * for its archive: a round trip per keystroke would be a server parameter
 * this dialog does not need, not a route the app lacks. `text` below still
 * covers what the ROW shows — title and meta — so a search that finds a row
 * here finds it for the reason its own text says so; the route
 * (`data/mock/handlers/life.ts`) searches those same two fields plus body
 * and kind, which is right for a general `?q=` and not a mismatch: a row
 * with no body or an unremarkable kind loses nothing this dialog needed.
 *
 * The rows open the same `learning` detail the section's own rows do
 * (OP-06) — one component behind both, so an item read from "all" and one
 * read from the card look the same.
 */
import React from "react";
import { View } from "react-native";
import { SearchableListDialog } from "@/components/chrome/SearchableListDialog";
import { Meta, Row, Txt } from "@/theme/ui";
import { useSessionStore } from "@/stores/session";
import type { LearningItem } from "@/data/types";

export function LearningAllDialog({ onClose }: { onClose: () => void }) {
  const openModal = useSessionStore((s) => s.openModal);

  return (
    <SearchableListDialog<LearningItem>
      testID="learning-all"
      title="All learning"
      placeholder="Search learning"
      emptyText="No matches."
      source={(adapter) => adapter.getLearning()}
      text={(item) => `${item.title} ${item.meta}`}
      onClose={onClose}
      renderRow={(item, _i, last) => (
        // `openModal` alone: the detail replaces this dialog in the one
        // modal slot (`SearchableListDialog`'s header says why nothing else)
        <Row key={item.id} testID={`learning-all-row-${item.id}`} last={last} onPress={() => openModal("learning", item.id)}>
          <View style={{ flex: 1 }}>
            <Txt kind="body">{item.title}</Txt>
            <Meta testID={`learning-all-meta-${item.id}`}>{item.meta}</Meta>
          </View>
        </Row>
      )}
    />
  );
}
