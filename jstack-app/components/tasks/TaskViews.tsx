/**
 * TaskViews — Tasks' column-1 section (TK-01/02): the List/Board/
 * Gantt/Done segmented control, the slicer row (F-1: on ALL FOUR views, not
 * List only), the active-filter chip row under it, and the active segment's
 * body. Footer: "Tasks live in Twenty · open in
 * Twenty". Filter and the Twenty link both open through `session.ts`'s
 * root-mounted modal (BUGLOG_v2.md B-14) — never render a `Dialog`
 * inline inside this scrolled section.
 */
import React from "react";
import { Text, View } from "react-native";
import { ActiveFilters } from "@/components/tasks/ActiveFilters";
import { Card, ListCard, Meta, Seg, Txt } from "@/theme/ui";
import { Board } from "@/components/tasks/Board";
import { DoneSearch } from "@/components/tasks/DoneSearch";
import { Gantt, TWENTY_URL } from "@/components/tasks/Gantt";
import { SlicerRow } from "@/components/tasks/SlicerRow";
import { TaskRow } from "@/components/tasks/TaskRow";
import { useSessionStore } from "@/stores/session";
import { packPayload } from "@/layout/dialogKit";
import { useSettingsStore } from "@/stores/settings";
import { useTasksStore, type TaskSegment } from "@/stores/tasks";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";

const SEGMENTS: { key: TaskSegment; label: string }[] = [
  { key: "list", label: "List" },
  { key: "board", label: "Board" },
  { key: "gantt", label: "Gantt" },
  { key: "done", label: "Done" },
];

export function TaskViews() {
  const c = useTokens();
  const view = useTasksStore((s) => s.view);
  const list = useTasksStore((s) => s.list);
  const setView = useTasksStore((s) => s.setView);
  const activeFocus = useSettingsStore((s) => s.activeFocus);
  const openModal = useSessionStore((s) => s.openModal);

  return (
    <View testID="task-views" style={{ gap: space[3] }}>
      <Seg testID="task-seg" options={SEGMENTS} value={view} onChange={(v) => void setView(v, activeFocus)} />

      {/* F-1/TF-05: the same row on all four views. It was List-only, so the
          Board, the Gantt and Done showed whatever the List had last been
          narrowed to with no way to see it or change it. */}
      <SlicerRow />
      <ActiveFilters />

      {view === "list" &&
        (list.length === 0 ? (
          <Meta>Nothing here for this focus.</Meta>
        ) : (
          <ListCard testID="task-list">
            {list.map((t, i) => (
              <TaskRow key={t.id} task={t} last={i === list.length - 1} />
            ))}
          </ListCard>
        ))}
      {view === "board" && <Board />}
      {view === "gantt" && (
        <Card testID="gantt-card">
          <Gantt />
        </Card>
      )}
      {view === "done" && <DoneSearch />}

      <Txt testID="task-footer" kind="meta" style={{ marginTop: space[3] }}>
        Tasks live in Twenty ·{" "}
        <Text onPress={() => openModal("external-link", packPayload(TWENTY_URL, "Twenty"))} style={{ color: c.accentInk }}>
          open in Twenty
        </Text>
      </Txt>
    </View>
  );
}
