/**
 * History — Agents' "Decision history" card (AG-09): two rows inline
 * (title · verb at 500 · via {channel} — the exact fields Today's own
 * `HistoryDialog.tsx` already renders from `ActionHistoryEntry`; "via
 * door" in the acceptance text doesn't map to any wire field or fixture
 * value, so it isn't reproduced literally — A-33), "search" opens the
 * full searchable dialog with reopen.
 */
import React, { useEffect } from "react";
import { View } from "react-native";
import { ListCard, Meta, Row, Section, Strong, Txt } from "@/theme/ui";
import { useAgentsStore } from "@/stores/agents";
import { useSessionStore } from "@/stores/session";
import { VERB_LABEL, VIA_LABEL } from "@/lib/enumLabels";

export function History() {
  const history = useAgentsStore((s) => s.history);
  const loadHistory = useAgentsStore((s) => s.loadHistory);
  const openModal = useSessionStore((s) => s.openModal);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const rows = history.slice(0, 2);

  return (
    <Section testID="agents-history-section" sectionId="agents-history-section" title={"Decision history"} right={<Txt testID="history-search" kind="meta" tone="accentInk" onPress={() => openModal("agents-history")}>search</Txt>}>
      <ListCard style={{ marginTop: 8 }}>
        {rows.map((row, i) => {
          const last = row.history.at(-1);
          return (
            <Row key={row.id} testID={`history-row-${row.id}`} last={i === rows.length - 1}>
              <View style={{ flex: 1 }}>
                <Txt kind="body">
                  {row.title} · <Strong>{last != null ? VERB_LABEL[last.verb] : row.state}</Strong>
                </Txt>
                <Meta>via {last != null ? VIA_LABEL[last.via] : "—"}</Meta>
              </View>
            </Row>
          );
        })}
      </ListCard>
    </Section>
  );
}
