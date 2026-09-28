/**
 * IssuesAllDialog (O-1, OP-05) — Agents › Issues "all".
 *
 * The card shows what is failing NOW, which is the right thing for a card. The
 * list is everything, including what has since been dealt with — because the
 * question a person actually asks of an issues list is "has this happened
 * before", and a card that only ever shows the open ones cannot answer it.
 *
 * `SearchableListDialog` like every other "all" (OP-08): an archive, fetched
 * whole on open and narrowed by the dialog's own needle over the title and the
 * reason (P-4, F-55).
 */
import React from "react";
import { View } from "react-native";
import { SearchableListDialog } from "@/components/chrome/SearchableListDialog";
import { Dot, Meta, Row, Txt } from "@/theme/ui";
import { useSessionStore } from "@/stores/session";
import { formatWhen } from "@/lib/time";
import type { AgentIssue } from "@/data/types";

export function IssuesAllDialog({ onClose }: { onClose: () => void }) {
  const openModal = useSessionStore((s) => s.openModal);

  return (
    <SearchableListDialog<AgentIssue>
      testID="issues-all"
      title="Agent issues"
      placeholder="Search issues"
      source={(adapter) => adapter.getAgentIssues()}
      text={(issue) => `${issue.title} ${issue.why}`}
      onClose={onClose}
      emptyText="Nothing failing, and nothing has."
      renderRow={(row, _i, last) => (
        // `openModal` alone: the issue replaces this dialog in the one modal slot
        <Row key={row.id} testID={`issues-all-row-${row.id}`} last={last} onPress={() => openModal("issue", row.id)}>
          <Dot kind={row.state === "open" ? "alert" : "ok"} />
          <View style={{ flex: 1 }}>
            <Txt kind="body">{row.title}</Txt>
            <Meta>{row.lastSuccessAt != null ? `last worked · ${formatWhen(row.lastSuccessAt)}` : row.why}</Meta>
          </View>
        </Row>
      )}
    />
  );
}
