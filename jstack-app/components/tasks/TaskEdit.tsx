/**
 * TaskEdit — the row of controls under a task's title (T-1, ADR-42,
 * TK-02..TK-04).
 *
 * The card had no editing at all: everything on it was something the EA or
 * Twenty had decided. Three things change here, and they are the three a
 * person actually reaches for — what it is called, when it runs, and whether
 * it matters. Everything else stays where it is.
 *
 * **Edits are in place, and they save themselves.** No Save button, no dialog:
 * a priority tap PATCHes, a date pick PATCHes, a title saves on blur. That is
 * the brief's "one tap" rule, and it is only honest because the store's
 * `patchTask` is optimistic and undoable — the toast is the safety net a Save
 * button would otherwise have been.
 *
 * **A refusal lands under the control that caused it.** The store returns the
 * server's `422 { field, reason }` rather than toasting it, so "the end is
 * before the start" appears beneath the end field and the old value stays.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { DateTimeField, Field, Meta, Seg, Txt } from "@/theme/ui";
import { useTaskEditsStore } from "@/stores/taskEdits";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { useLayout } from "@/theme/useLayout";
import type { Task } from "@/data/types";

const PRIORITIES = [
  { key: "low" as const, label: "Low" },
  { key: "medium" as const, label: "Medium" },
  { key: "high" as const, label: "High" },
];

export function TaskEdit({ task }: { task: Task }) {
  const c = useTokens();
  const { phone } = useLayout();
  const patchTask = useTaskEditsStore((s) => s.patchTask);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  /** the server's last refusal, by field — one at a time, which is all a
   *  single PATCH can produce */
  const [refusal, setRefusal] = useState<{ field?: string; reason: string } | null>(null);

  const save = async (patch: Partial<Task>) => {
    setRefusal(await patchTask(task.id, patch));
  };

  const saveTitle = () => {
    setEditingTitle(false);
    const title = draftTitle.trim();
    if (title === "" || title === task.title) {
      // An empty title is not a rename, it is a slip. The server refuses it
      // too (TK-04) — this stops the round trip that would only tell us so.
      setDraftTitle(task.title);
      if (title === "") setRefusal({ field: "title", reason: "a task needs a title" });
      return;
    }
    void save({ title });
  };

  const lineFor = (field: string) =>
    refusal?.field === field ? (
      <Meta testID={`task-edit-error-${field}`} style={{ color: c.alert }}>
        {refusal.reason}
      </Meta>
    ) : null;

  return (
    <View testID="task-edit" style={{ gap: space[3], marginTop: space[3] }}>
      {editingTitle ? (
        <Field
          testID="task-title-field"
          accessibilityLabel="Task title"
          value={draftTitle}
          onChangeText={setDraftTitle}
          onBlur={saveTitle}
          onSubmitEditing={saveTitle}
        />
      ) : (
        <Txt
          testID="task-title-edit"
          kind="meta"
          tone="accentInk"
          onPress={() => {
            setDraftTitle(task.title);
            setEditingTitle(true);
          }}
        >
          rename
        </Txt>
      )}
      {/* OUTSIDE the branch: refusing an empty title closes the editor (there
          is nothing to keep editing — the field is empty), and a line rendered
          only while editing would vanish in the same tick it appeared. */}
      {lineFor("title")}

      <Seg testID="task-priority" options={PRIORITIES} value={task.priority} onChange={(priority) => void save({ priority })} />

      {/* JQ-01 (Josh, 8 Sep): the two chips carried a placeholder and nothing
          else, so once a date was picked the chip read "Sun 6 Sep, 9:00am" with
          no word saying which end of the task it was — and they sat 8px apart.
          The labels take the META kind because Josh named that line as the
          reference ("same font and size as 'JSTACK · Tue 8 Sep · high'"), and
          the gap is `space[9]` (24) against the check's floor of 16.

          Stacked on the phone rather than wrapped: two chips and their labels
          do not fit side by side at 393, and `flexWrap` put the second one
          under the first with the labels no longer lining up with anything. */}
      <View style={{ flexDirection: phone ? "column" : "row", flexWrap: "wrap", gap: space[9] }}>
        <View style={{ gap: space[1] }}>
          <Meta testID="task-starts-label">Start</Meta>
          <DateTimeField
            testID="task-starts"
            label="Add start"
            defaultTime="09:00"
            value={task.startsAt}
            onChange={(startsAt) => void save({ startsAt })}
          />
          {lineFor("startsAt")}
        </View>
        <View style={{ gap: space[1] }}>
          <Meta testID="task-ends-label">End</Meta>
          <DateTimeField
            testID="task-ends"
            label="Add end"
            defaultTime="17:00"
            min={task.startsAt}
            value={task.endsAt}
            onChange={(endsAt) => void save({ endsAt })}
          />
          {lineFor("endsAt")}
        </View>
      </View>
    </View>
  );
}
