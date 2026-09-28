/**
 * MemoryHistoryDialog (O-1, OP-03) — Memory's "all".
 *
 * Every correction the Librarian was given: what was proposed, what was
 * decided, when, by whom, and WHAT IT WAS BEFORE. The previous value is the
 * point — a memory system you cannot audit is one you have to trust, and the
 * whole reason Memory shows proposals at all is that Josh does not.
 *
 * It is `SearchableListDialog` like every other "all" (OP-08): an archive,
 * fetched whole on open and narrowed by the dialog's own needle over the
 * correction's text (P-4, F-55).
 */
import React from "react";
import { View } from "react-native";
import { SearchableListDialog } from "@/components/chrome/SearchableListDialog";
import { Meta, Row, Txt } from "@/theme/ui";
import { formatWhen } from "@/lib/time";
import type { MemoryHistoryEntry } from "@/data/types";

const DECISION_LABEL: Record<MemoryHistoryEntry["decision"], string> = {
  accepted: "accepted",
  edited: "edited",
  declined: "declined",
};

export function MemoryHistoryDialog({ onClose }: { onClose: () => void }) {
  return (
    <SearchableListDialog<MemoryHistoryEntry>
      testID="memory-history"
      title="Memory history"
      placeholder="Search corrections"
      source={(adapter) => adapter.getMemoryHistory()}
      text={(entry) => entry.text}
      onClose={onClose}
      emptyText="No corrections yet."
      renderRow={(row, _i, last) => (
        <Row key={row.id} testID={`memory-history-row-${row.id}`} last={last}>
          <View style={{ flex: 1 }}>
            <Txt kind="body">{row.text}</Txt>
            <Meta>
              {DECISION_LABEL[row.decision]} · {formatWhen(row.at)} · {row.by}
            </Meta>
            {/* the value it replaced — the thing you came here to check */}
            {row.was != null && <Meta testID={`memory-history-was-${row.id}`}>was: {row.was}</Meta>}
          </View>
        </Row>
      )}
    />
  );
}
