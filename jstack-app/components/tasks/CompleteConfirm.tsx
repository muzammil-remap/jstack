/**
 * CompleteConfirm — ticking a task that is not finished (T-3, ADR-42, TK-10).
 *
 * The one place in this app where a confirm dialog is the right answer, and it
 * is worth saying why, because the rule everywhere else is "undo, not confirm".
 * Ticking a task with open subtasks is genuinely ambiguous: it might mean "all
 * of that is done" or it might mean "I ticked the wrong line". An undo can put
 * six subtasks back, but it cannot tell the person that six were closed —
 * and the count is the whole content of the question.
 *
 * So: the count, and two answers that are both real. "Yes, complete all" is
 * primary and is what most ticks mean. "No, open the task" is not a cancel —
 * it opens the card, because somebody who did not mean "all of it" wants to
 * see what is left.
 */
import React from "react";
import { View } from "react-native";
import { Btn, BtnPrimary, Meta } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { useTask, useTaskCardStore } from "@/stores/taskCard";
import { space } from "@/theme/tokens";

export function CompleteConfirm({ id, onClose }: { id: string; onClose: () => void }) {
  // the task the TICK was about, wherever the app holds it: `useTask` is the
  // one lookup (P-2), and its last resort is the tick itself — Today's
  // checkbox opens this dialog over an empty Tasks list (B-26)
  const task = useTask(id);
  const completeTask = useTaskCardStore((s) => s.completeTask);
  const openTask = useTaskCardStore((s) => s.openTask);
  if (task == null) return null;

  const open = task.subtasks.filter((s) => !s.done).length;

  return (
    <Dialog testID="complete-confirm" title={task.title} onClose={onClose}>
      {/* the pronoun follows the count (ux round S6-30): "1 subtask isn't
          done. Mark them done" disagreed with its own number. README Content:
          short sentences, plain words — and a number the sentence contradicts
          is neither. Pinned in `tests/native/screens.test.tsx`. */}
      <Meta testID="complete-confirm-count">
        {open === 1 ? "1 subtask isn't done. Mark it done and complete this task?" : `${open} subtasks aren't done. Mark them done and complete this task?`}
      </Meta>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[4] }}>
        <BtnPrimary
          testID="complete-confirm-yes"
          label="Yes, complete all"
          onPress={() => {
            void completeTask(task.id, true, task);
            onClose();
          }}
        />
        <Btn
          testID="complete-confirm-no"
          label="No, open the task"
          onPress={() => {
            // NOT a cancel: it opens the card, because somebody who did not
            // mean "all of it" wants to see what is left.
            onClose();
            openTask(task.id);
          }}
        />
      </View>
    </Dialog>
  );
}
