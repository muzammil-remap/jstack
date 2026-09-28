/**
 * HistoryDialog — DC-01's "history" link: every answered/later/expired
 * decision, searchable by title (mock v11 `acts.history()` line 625).
 * Read-only: there is no server-side "reopen" for an item outside the
 * 10s undo window (only `postActionUndo`, which 409s past it) — an open
 * item, not a fake control (BUGLOG_v2.md A-18).
 *
 * S-4: the field, the list and the "No matches." come from
 * `SearchableListDialog`. The rows are `stores/today.ts`'s `history`, loaded by
 * `loadHistory(q)` — the query goes to the server (`?q=` is the backend's
 * index), which is why this is the `fetch` shape and not an archive (P-4,
 * F-47; it used to fetch straight from the adapter).
 */
import React from "react";
import { View } from "react-native";
import { Meta, Row, Txt } from "@/theme/ui";
import { SearchableListDialog } from "@/components/chrome/SearchableListDialog";
import { useSessionStore } from "@/stores/session";
import { useTodayStore } from "@/stores/today";
import type { ActionItem } from "@/data/types";

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const history = useTodayStore((s) => s.history);
  const loadHistory = useTodayStore((s) => s.loadHistory);
  const openModal = useSessionStore((s) => s.openModal);

  return (
    <SearchableListDialog<ActionItem>
      testID="history"
      title="Decision history"
      placeholder="Search the cards you have answered"
      fetch={(q) => void loadHistory(q)}
      rows={history}
      onClose={onClose}
      renderRow={(row, _i, last) => {
        const lastEntry = row.history.at(-1);
        return (
          // OP-04: the same `decision` detail the Agents history opens. One
          // detail per record, not one per surface that lists it — and
          // `openModal` alone, since the detail replaces this dialog.
          <Row key={row.id} testID={`history-row-${row.id}`} last={last} onPress={() => openModal("decision", row.id)}>
            <View style={{ flex: 1 }}>
              <Txt>{row.title}</Txt>
              <Meta>
                {row.type} · {lastEntry?.verb ?? row.state} · via {lastEntry?.via ?? "—"}
              </Meta>
            </View>
          </Row>
        );
      }}
    />
  );
}
