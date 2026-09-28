/**
 * YourTasks — Today's "Your tasks" (TD-05): top three open tasks in
 * focus; checkbox marks done via `PATCH /tasks/{id}` with an undo toast;
 * hint "all" switches to the Tasks tab.
 */
import { useTaskCardStore } from "@/stores/taskCard";
import { taskMetaLine } from "@/lib/taskMeta";
import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Checkbox, ListCard, Meta, Row, Section, Txt } from "@/theme/ui";
import { useTodayStore } from "@/stores/today";
import { useSyncStore } from "@/stores/sync";
import { QUEUED_COMPLETE, queuedIdsIn } from "@/data/transport/outbox";

export function YourTasks() {
  const router = useRouter();
  const composite = useTodayStore((s) => s.composite);
  // T-3: the SAME action the Tasks list uses, so the completion rule is true
  // on both surfaces rather than on whichever one the reviewer opened.
  const requestComplete = useTaskCardStore((s) => s.requestComplete);
  const tasks = composite?.tasks ?? [];
  // A-9 (A4R8-09): a completion still in the queue reads done — a reload brings the server's open
  // copy back until it lands. A stable subscription, derived outside it, as Habits does.
  const queuedEntries = useSyncStore((s) => s.entriesNow);
  const queuedDone = React.useMemo(() => queuedIdsIn(queuedEntries, QUEUED_COMPLETE), [queuedEntries]);

  return (
    <Section testID="your-tasks" style={{ gap: 8 }} sectionId="your-tasks" title={"Your tasks"} right={
          <Txt testID="your-tasks-all" onPress={() => router.navigate("/tasks")} kind="small" tone="accentInk">
            all
          </Txt>
        } labelTestID="your-tasks-label">
      {tasks.length === 0 ? (
        <Meta>Nothing open in this focus.</Meta>
      ) : (
        <ListCard testID="your-tasks-list">
          {tasks.map((t, i) => (
            <Row key={t.id} last={i === tasks.length - 1}>
              <Checkbox checked={t.status === "done" || queuedDone.has(t.id)} accessibilityLabel={`Mark "${t.title}" done`} testID={`your-task-cb-${t.id}`} onPress={() => void requestComplete(t)} />
              <View style={{ flex: 1 }}>
                <Txt>{t.title}</Txt>
                <Meta>{taskMetaLine(t)}</Meta>
              </View>
            </Row>
          ))}
        </ListCard>
      )}
    </Section>
  );
}
