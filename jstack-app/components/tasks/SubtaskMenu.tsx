/**
 * SubtaskMenu — the ⋮ on a subtask (T-2, TK-09).
 *
 * Three things a person does to one line of a task: rename it, hand it to
 * somebody else, or decide it was never a subtask. A sheet rather than an
 * inline popover because two of the three open a second thing (a field, a
 * list of names) and because `layout/dialogs.tsx` is where an overlay is
 * mounted — a menu rendered inline inside a scrolled card is B-14, which this
 * build has already paid for once.
 *
 * Delete is not confirmed. It is undoable for ten seconds, and the toast says
 * so; a confirm dialog in front of a reversible action is a second tap that
 * buys nothing (README Principles: "undo, not confirm").
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Btn, BtnPrimary, Field, Meta, Row, Txt } from "@/theme/ui";
import { Sheet } from "@/components/chrome/Sheet";
import { useTaskEditsStore } from "@/stores/taskEdits";
import { useSessionStore } from "@/stores/session";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTasksStore } from "@/stores/tasks";
import { space } from "@/theme/tokens";

/** `taskId:subtaskId` — the payload a registry entry carries is one string. */
export function SubtaskMenu({ id, onClose }: { id: string; onClose: () => void }) {
  const [taskId, subtaskId] = id.split(":");
  const task = useTaskCardStore((s) => s.detailTask);
  const roster = useTasksStore((s) => s.roster);
  const patchSubtask = useTaskEditsStore((s) => s.patchSubtask);
  const deleteSubtask = useTaskEditsStore((s) => s.deleteSubtask);
  const showToast = useSessionStore((s) => s.showToast);
  const subtask = task?.subtasks.find((s) => s.id === subtaskId);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(subtask?.title ?? "");
  const [refusal, setRefusal] = useState<string | null>(null);

  if (subtask == null) return null;

  const saveTitle = async () => {
    const title = draft.trim();
    if (title === "") {
      setRefusal("a subtask needs a title");
      return;
    }
    const no = await patchSubtask(taskId, subtaskId, { title });
    if (no != null) {
      setRefusal(no.reason);
      return;
    }
    onClose();
  };

  return (
    <Sheet testID="subtask-menu" title={subtask.title} onClose={onClose}>
      {renaming ? (
        <View style={{ gap: space[2] }}>
          <Field testID="subtask-title-field" accessibilityLabel="Subtask title" value={draft} onChangeText={setDraft} onSubmitEditing={() => void saveTitle()} />
          {refusal != null && <Meta testID="subtask-menu-error">{refusal}</Meta>}
          <BtnPrimary testID="subtask-rename-save" label="Save" onPress={() => void saveTitle()} />
        </View>
      ) : (
        <View style={{ gap: space[2] }}>
          <Btn testID="subtask-rename" label="Edit" onPress={() => { setDraft(subtask.title); setRenaming(true); }} />

          <Meta style={{ marginTop: space[2] }}>Change delegation</Meta>
          {roster.map((agent) => (
            <Row key={agent.id} testID={`subtask-owner-${agent.id}`} last={agent.id === roster[roster.length - 1]?.id}>
              <Txt
                testID={`subtask-owner-${agent.id}-pick`}
                tone={subtask.owner === agent.id ? "accentInk" : undefined}
                onPress={() => {
                  void patchSubtask(taskId, subtaskId, { owner: agent.id, delegatedTo: agent.id });
                  onClose();
                }}
              >
                {agent.name}
              </Txt>
            </Row>
          ))}

          <Btn
            testID="subtask-delete"
            label="Delete"
            style={{ marginTop: space[3] }}
            onPress={() => {
              // no toast of our own: `optimisticWrite` pushes the UNDO toast,
              // and a plain "Deleted" fired here would replace it — taking the
              // only way back with it
              // WPF-8: a refused delete has no Undo toast to replace — it puts the
              // subtask back, and says why
              void deleteSubtask(taskId, subtaskId).then((refusal) => {
                if (refusal != null) showToast(refusal.reason);
              });
              onClose();
            }}
          />
        </View>
      )}
    </Sheet>
  );
}
