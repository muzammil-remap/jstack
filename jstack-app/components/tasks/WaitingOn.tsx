/**
 * WaitingOn — Tasks' column-2 section (TK-11): rows like "Steve · villa
 * contract · 9 days" with "Draft a nudge"; a mini Gantt card underneath
 * (mock v11 `tasksTab()`'s `map.waiting`).
 */
import React from "react";
import { Text, View } from "react-native";
import { BtnSm, Card, ListCard, Meta, Row, Section, Txt } from "@/theme/ui";
import { Gantt } from "@/components/tasks/Gantt";
import { useTasksStore } from "@/stores/tasks";
import { space } from "@/theme/tokens";

export function WaitingOn() {
  const waiting = useTasksStore((s) => s.waiting);
  // D25: the sidebar's mini timeline is the same four bars as the main Gantt
  // view, so showing both puts the identical card twice on one screen.
  const view = useTasksStore((s) => s.view);
  const nudge = useTasksStore((s) => s.nudge);

  return (
    <>
      <Section testID="waiting-on" style={{ gap: space[3] }} sectionId="waiting-on" title={"Waiting on"} badge={waiting.length} labelTestID="waiting-on-label">
        {waiting.length === 0 ? (
          <Meta>Nothing waiting.</Meta>
        ) : (
          <ListCard>
            {waiting.map((w, i) => (
              <Row key={`${w.taskId}-${i}`} last={i === waiting.length - 1}>
                <View style={{ flex: 1 }}>
                  <Txt>
                    <Text style={{ fontWeight: "500" }}>{w.who}</Text> · {w.what}
                  </Txt>
                  <Meta>{w.days} days</Meta>
                </View>
                <BtnSm testID={`nudge-${w.taskId}`} label="Draft a nudge" onPress={() => void nudge(w.taskId)} />
              </Row>
            ))}
          </ListCard>
        )}
      </Section>

      {/* S6-42 (JQ-06, the frame): the mini card lived INSIDE Waiting on, so
          collapsing that heading took the Gantt — label and card — with it,
          and its heading had no triangle. A section of its own with its own
          collapse key (BRAIN_PROPOSAL: "every section heading on every tab"). */}
      {view !== "gantt" && (
        <Section style={{ gap: space[3], marginTop: space[3] }} sectionId="gantt-mini" title={"Gantt"} labelTestID="gantt-mini-label">
          <Card>
            <Gantt compact limit={4} />
          </Card>
        </Section>
      )}
    </>
  );
}
