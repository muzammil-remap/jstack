/**
 * HistoryDialog — AG-09's "search" dialog: a search field over every
 * answered card, each row's "reopen" puts it back in Needs you
 * (`postActionReopen`, A-31). Root-mounted (`modal === "agents-history"`).
 *
 * S-4: the field, the list and the "No matches." come from
 * `SearchableListDialog`. What is left here is what makes this dialog itself —
 * where the rows come from, what a row says, and the reopen button Today's
 * history deliberately does not have.
 */
import React from "react";
import { View } from "react-native";
import { BtnSm, Meta, Row, Txt } from "@/theme/ui";
import { OFFLINE_REASON } from "@/lib/cardVerbs";
import { VERB_LABEL, VIA_LABEL } from "@/lib/enumLabels";
import { SearchableListDialog } from "@/components/chrome/SearchableListDialog";
import { useAgentsStore } from "@/stores/agents";
import { useSessionStore } from "@/stores/session";

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const history = useAgentsStore((s) => s.history);
  const loadHistory = useAgentsStore((s) => s.loadHistory);
  const reopenAction = useAgentsStore((s) => s.reopenAction);
  const openModal = useSessionStore((s) => s.openModal);
  const online = useSessionStore((s) => s.online);

  return (
    <SearchableListDialog
      testID="agents-history"
      title="Decision history"
      placeholder="Search the cards you have answered"
      fetch={(q) => void loadHistory(q)}
      rows={history}
      onClose={onClose}
      renderRow={(row, _i, last) => {
        const lastEntry = row.history.at(-1);
        return (
          // OP-04: the row opens the decision AS ANSWERED. It listed what had
          // been decided and gave no way to look at it; `reopen` beside it is
          // a different action and keeps its own control.
          <Row key={row.id} testID={`agents-history-row-${row.id}`} last={last} onPress={() => openModal("decision", row.id)}>
            <View style={{ flex: 1 }}>
              <Txt kind="body">{row.title}</Txt>
              <Meta>
                {lastEntry != null ? VERB_LABEL[lastEntry.verb] : row.state} · via {lastEntry != null ? VIA_LABEL[lastEntry.via] : "—"}
              </Meta>
            </View>
            <BtnSm
              testID={`agents-history-reopen-${row.id}`}
              label="reopen"
              {...(online ? { onPress: () => void reopenAction(row.id) } : { disabledReason: OFFLINE_REASON })}
            />
          </Row>
        );
      }}
    />
  );
}
