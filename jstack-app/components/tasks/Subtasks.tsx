/**
 * Subtasks — the task detail's subtasks card (TK-08/09): "N of M done"
 * hint, owner tags, an EA-dashed checkbox; "+ subtask" adds a titled
 * one via `POST /tasks/{id}/subtasks`.
 *
 * T-4/US-02: an agent run against a subtask lists UNDER that subtask, which is
 * the whole reason `Usage.subtaskId` exists. A run shown against the task
 * would answer "what did this task cost" and lose the question Josh actually
 * asked — which of the pieces is expensive.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Checkbox, Field, FieldButton, IconBtn, Label, ListCard, Meta, Row, Tag, Txt } from "@/theme/ui";
import { useSessionStore } from "@/stores/session";
import { useTaskEditsStore } from "@/stores/taskEdits";
import { space } from "@/theme/tokens";
import { usageLine } from "@/lib/usage";
import type { Task, UsageSummary } from "@/data/types";

export function Subtasks({ task, usage }: { task: Task; usage: UsageSummary | null }) {
  const addSubtask = useTaskEditsStore((s) => s.addSubtask);
  const patchSubtask = useTaskEditsStore((s) => s.patchSubtask);
  const openSheet = useSessionStore((s) => s.openSheet);
  const [draft, setDraft] = useState("");
  const done = task.subtasks.filter((s) => s.done).length;

  const submit = () => {
    const title = draft.trim();
    if (title === "") return;
    setDraft("");
    // A-9 (A4R7-11): cleared as the write starts and given back if it throws — offline over HTTP a new
    // subtask does not queue — unless a new title is already being typed
    void addSubtask(task.id, title, "josh").catch(() => setDraft((now) => (now === "" ? title : now)));
  };

  return (
    <View testID="subtasks" style={{ gap: space[3] }}>
      <Label hint={task.subtasks.length > 0 ? `${done} of ${task.subtasks.length} done` : undefined}>Subtasks</Label>
      {task.subtasks.length > 0 && (
        <ListCard>
          {task.subtasks.map((s, i) => (
            <Row key={s.id} last={i === task.subtasks.length - 1}>
              {/* T-2: a control at last. It was a status MARK because §4.5 had
                  nothing to toggle one's `done` with, and the component said so
                  rather than promising an action it could not perform (A-07).
                  `PATCH /tasks/{id}/subtasks/{sid}` exists now. */}
              <Checkbox
                checked={s.done}
                ea={s.owner === "ea"}
                accessibilityLabel={s.title}
                testID={`subtask-cb-${s.id}`}
                onPress={() => void patchSubtask(task.id, s.id, { done: !s.done })}
              />
              {s.owner === "ea" && <Tag label="EA" />}
              <View style={{ flex: 1 }}>
                <Txt>{s.title}</Txt>
                {s.meta != null && <Meta>{s.meta}</Meta>}
                {(usage?.rows ?? [])
                  .filter((u) => u.subtaskId === s.id)
                  .map((u) => (
                    <Meta key={u.id} testID={`subtask-usage-${u.id}`}>
                      {usageLine(u)}
                    </Meta>
                  ))}
              </View>
              <IconBtn
                testID={`subtask-menu-${s.id}`}
                icon="more_horiz"
                accessibilityLabel={`More for ${s.title}`}
                onPress={() => openSheet("subtask-menu", `${task.id}:${s.id}`)}
              />
            </Row>
          ))}
        </ListCard>
      )}
      <Field
        testID="subtask-input"
        value={draft}
        onChangeText={setDraft}
        placeholder="+ subtask"
        right={<FieldButton icon="arrow_upward" primary accessibilityLabel="Add subtask" {...(draft.trim() === "" ? { disabledReason: "Write a title first" } : { onPress: submit })} />}
      />
    </View>
  );
}
