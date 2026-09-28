/**
 * GoalDetail (O-1, filled at LG-1) — what a Life › Goals row opens, and what
 * "All goals" opens an archived one into.
 *
 * ONE FETCH, not three. `GET /goals/{id}` answers with the goal AND the tasks
 * and deliverables its ids name (LG-02), so the dialog does not need the tasks
 * tab to have been visited and the two lists cannot disagree with the ids that
 * produced them. It is also what makes this work from the archive, where the
 * goal is not in `stores/life.ts` at all.
 *
 * THE VERBS ARE THE ACTIVE GOAL'S ONLY. An archived goal shows its history
 * instead: Done and Drop on something already filed would be a control that
 * either does nothing or files it twice, and the reason to open an archived
 * goal is to read what happened to it.
 *
 * "Add task" and "Add subtask" both end on the TASK CARD rather than growing
 * an editor of their own — the card is where a task is edited and where the
 * subtask field already lives (T-2), and a second one here would be a second
 * grammar for the same thing (rule 16). "Add subtask" therefore picks which of
 * the goal's tasks first: there is no subtask without a task to hang it on.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { Btn, BtnSm, Field, FieldButton, ListCard, Meta, Row, Stat, Txt } from "@/theme/ui";
import { useDetail } from "@/components/detail/useDetail";
import { goalKpiStat, goalMetaLine } from "@/lib/goalMeta";
import { formatWhen, todayKey } from "@/lib/time";
import { openRef } from "@/layout/openRef";
import { useLifeEditsStore } from "@/stores/lifeEdits";
import { useSessionStore } from "@/stores/session";
import { useTaskCardStore } from "@/stores/taskCard";
import { space } from "@/theme/tokens";
import type { Goal } from "@/data/types";

type Mode = "read" | "add-task" | "pick-task";

export function GoalDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { item: data, missing } = useDetail(id, (a, id) => a.getGoal(id));
  const [mode, setMode] = useState<Mode>("read");
  const [title, setTitle] = useState("");
  const archiveGoal = useLifeEditsStore((s) => s.archiveGoal);
  const openModal = useSessionStore((s) => s.openModal);
  const showToast = useSessionStore((s) => s.showToast);


  const goal = data?.goal;
  // read once beside the guard: nothing below asserts on `data` (F-73, P-13)
  const tasks = data?.tasks ?? [];
  const deliverables = data?.deliverables ?? [];
  const archived = goal != null && goal.status !== "active" && goal.status !== "behind";

  /** Done and Drop are the same gesture with a different word, and both are a
   * normal save of the whole set — the server decides what archiving means
   * (LG-04), so this does not compose a history entry or a brain item. */
  const archive = (status: Goal["status"]) => {
    // A4R4-02: the STORE composes the whole-set write, from the authoritative
    // set. This mapped over `useLifeStore.goals`, which is empty on every tab
    // but Today, and so archived every goal.
    void archiveGoal(id, status).then((refusal) => {
      if (refusal != null) {
        showToast(refusal.reason);
        return;
      }
      showToast(status === "done" ? "Goal done" : "Goal dropped");
      onClose();
    });
  };

  const openTask = (taskId: string) => {
    openRef(`task:${taskId}`, openModal);
    onClose();
  };

  const addTask = () => {
    if (goal == null || title.trim() === "") return;
    // P-2 (F-73): through the store that owns the card — a component never fetches
    void useTaskCardStore
      .getState()
      .createTask({
        title: title.trim(),
        owner: "josh",
        priority: "medium",
        status: "open",
        links: [],
        goalId: goal.id,
        labels: goal.labels,
        setAt: todayKey(),
        focus: goal.focus,
      })
      .then((task) => {
        // A4R6-06: offline the task is queued and has no id yet — say so and
        // stay on the goal, rather than opening a task called "undefined"
        if (task == null) {
          showToast("Saved here · syncs when you're back online");
          return;
        }
        // straight onto the card: a task created from a goal is one you are
        // about to say more about
        openTask(task.id);
      });
  };

  return (
    <Dialog testID="goal" title="Goal" onClose={onClose}>
      {missing && <Txt testID="goal-missing">That goal is no longer here.</Txt>}
      {goal != null && (
        <View style={{ gap: space[3] }}>
          <Txt kind="title" testID="goal-title">
            {goal.text}
          </Txt>
          <Meta testID="goal-meta">
            {goal.area} · {goalMetaLine(goal)}
          </Meta>

          {(goal.kpis ?? []).length > 0 && (
            <View testID="goal-kpis" style={{ flexDirection: "row", flexWrap: "wrap", gap: space[4] }}>
              {(goal.kpis ?? []).map((kpi, i) => (
                <View key={`${kpi.label}-${i}`} testID={`goal-kpi-${i}`} style={{ minWidth: 72 }}>
                  <Stat>{goalKpiStat(kpi)}</Stat>
                  <Meta>{kpi.label}</Meta>
                </View>
              ))}
            </View>
          )}

          <Meta>Tasks</Meta>
          {tasks.length === 0 ? (
            <Meta testID="goal-tasks">Nothing here yet</Meta>
          ) : (
            <ListCard testID="goal-tasks">
              {tasks.map((t, i) => (
                <Row key={t.id} testID={`goal-task-${t.id}`} last={i === tasks.length - 1} onPress={() => openTask(t.id)}>
                  <Txt style={{ flex: 1 }}>{t.title}</Txt>
                </Row>
              ))}
            </ListCard>
          )}

          {deliverables.length > 0 && (
            <>
              <Meta>Deliverables</Meta>
              <ListCard testID="goal-deliverables">
                {deliverables.map((f, i) => (
                  <Row key={f.id} testID={`goal-file-${f.id}`} last={i === deliverables.length - 1} onPress={() => openModal("file", f.id)}>
                    <Txt style={{ flex: 1 }}>{f.name}</Txt>
                  </Row>
                ))}
              </ListCard>
            </>
          )}

          {mode === "add-task" && (
            <Field
              testID="goal-new-task-title"
              value={title}
              onChangeText={setTitle}
              placeholder="What needs doing?"
              right={
                <FieldButton
                  icon="arrow_upward"
                  primary
                  testID="goal-new-task-save"
                  accessibilityLabel="Add task"
                  {...(title.trim() === "" ? { disabledReason: "Write a title first" } : { onPress: addTask })}
                />
              }
            />
          )}

          {mode === "pick-task" && (
            <ListCard testID="goal-pick-task">
              {tasks.map((t, i) => (
                <Row key={t.id} testID={`goal-pick-task-${t.id}`} last={i === tasks.length - 1} onPress={() => openTask(t.id)}>
                  <Txt style={{ flex: 1 }}>{t.title}</Txt>
                </Row>
              ))}
            </ListCard>
          )}

          {archived ? (
            <View testID="goal-history" style={{ gap: 4 }}>
              <Meta>History</Meta>
              {goal.history.map((h, i) => (
                <Meta key={`${h.at}-${i}`} testID={`goal-history-${i}`}>
                  {h.event} · {formatWhen(new Date(h.at))}
                  {h.detail != null ? ` · ${h.detail}` : ""}
                </Meta>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
              <BtnSm testID="goal-add-task" label="Add task" outlined onPress={() => setMode(mode === "add-task" ? "read" : "add-task")} />
              <BtnSm
                testID="goal-add-subtask"
                label="Add subtask"
                outlined
                {...(tasks.length === 0
                  ? { disabledReason: "This goal has no tasks yet" }
                  : { onPress: () => setMode(mode === "pick-task" ? "read" : "pick-task") })}
              />
              <Btn testID="goal-done" label="Done" onPress={() => archive("done")} />
              <Btn testID="goal-drop" label="Drop" onPress={() => archive("dropped")} />
            </View>
          )}
        </View>
      )}
    </Dialog>
  );
}
