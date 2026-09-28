/**
 * taskEdits.ts (T-2/T-3) — every optimistic edit to a task or one of its
 * subtasks, in one place.
 *
 * It began as `stores/subtasks.ts` because `stores/tasks.ts` was at its
 * 200-line cap and two subtask writes did not fit. T-3 needed the cap again
 * and the honest answer was no longer "another exception": the edits belong
 * together. `patchTask` and the three subtask writes want the same four things
 * (`lib/optimistic.ts` says which), they are driven by the same card, and
 * `tasks.ts` keeps what it was always about — the LIST.
 *
 * That is the LIST-versus-CARD seam `BUGLOG_v22.md` A-35 flagged. Stage 5d
 * P-2 cut the rest of it: `stores/taskCard.ts` holds the open card, and its
 * `findTask` is the one lookup this file used to write by hand three times.
 * `patchBoth` is the one place a change lands on BOTH copies the app may hold
 * — the card's and the list's — which four writes here each did for
 * themselves.
 *
 * Every write here: the value moves at once, an offline edit is a capture the
 * outbox carries, a refusal comes back to the caller rather than to a toast,
 * and undo restores exactly what this write changed.
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import { optimisticWrite, type Refusal } from "@/lib/optimistic";
import { findTask, useTaskCardStore } from "@/stores/taskCard";
import { useTasksStore } from "@/stores/tasks";
import type { Column, Subtask, SubtaskPatch, Task, TaskOwner } from "@/data/types";

type TaskEditsState = {
  /** TK-02..TK-05: one field on the task itself. */
  patchTask: (id: string, patch: Partial<Task>) => Promise<Refusal | null>;
  /** T-3 moved this here from `stores/tasks.ts`, where it had always been the
   *  odd one out: adding a subtask is a subtask write. */
  addSubtask: (taskId: string, title: string, owner: TaskOwner) => Promise<void>;
  patchSubtask: (taskId: string, subtaskId: string, patch: SubtaskPatch) => Promise<Refusal | null>;
  deleteSubtask: (taskId: string, subtaskId: string) => Promise<Refusal | null>;
  /**
   * B-1, ADR-45 — a card moving between board columns, by drag or by menu.
   *
   * The thing that MOVES is `column`, Twenty's own kanban value. `status`
   * follows only where the column has exactly one, because Now and Next both
   * mean `open` and a move between them must not invent a status change
   * (resolution #44). A move into a column whose status is `done` is not a
   * status patch at all: it goes through the completion rule, so a task
   * finished by dragging gets the same `completedAt`/`completedBy` and the same
   * question about its open subtasks as one finished by ticking it
   * (resolution #23).
   */
  moveTask: (taskId: string, column: Column) => Promise<Refusal | null>;
};

/** put `change` on both copies the app may hold: the open card's, and the list's */
function patchBoth(taskId: string, change: (t: Task) => Task): void {
  const card = useTaskCardStore.getState();
  if (card.detailTask?.id === taskId) useTaskCardStore.setState({ detailTask: change(card.detailTask) });
  useTasksStore.setState({ list: useTasksStore.getState().list.map((t) => (t.id === taskId ? change(t) : t)) });
}

/** the one copy of a subtask's current values, wherever its task is held */
const currentSubtask = (taskId: string, subtaskId: string): Subtask | undefined => findTask(taskId)?.subtasks.find((s) => s.id === subtaskId);

/** put `values` on one subtask, now, on the card and the list alike */
function applyToSubtask(taskId: string, subtaskId: string, values: Partial<Subtask>): void {
  patchBoth(taskId, (t) => ({ ...t, subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, ...values } : s)) }));
}

const reload = async (taskId: string): Promise<void> => {
  await Promise.all([useTaskCardStore.getState().loadDetailTask(taskId), useTasksStore.getState().load()]);
};

export const useTaskEditsStore = create<TaskEditsState>((_set, get) => ({
  moveTask: async (taskId, column) => {
    const task = findTask(taskId);
    if (task == null) return { reason: "that task is not here any more" };
    if (task.column === column.id) return null;
    if (column.statuses.includes("done")) {
      await useTaskCardStore.getState().requestComplete(task);
      return null;
    }
    const only = column.statuses.length === 1 ? { status: column.statuses[0] } : {};
    return get().patchTask(taskId, { column: column.id, ...only });
  },

  patchTask: async (id, patch) => {
    const before = findTask(id);
    if (before == null) return { reason: "that task is not here any more" };
    return optimisticWrite<Task>({
      before,
      patch,
      apply: (values) => patchBoth(id, (t) => ({ ...t, ...values })),
      send: () => getAdapter().patchTask(id, patch),
      sendUndo: (previous) => getAdapter().patchTask(id, previous).then(() => undefined),
      current: () => getAdapter().getTask(id),
      wroteOf: (result) => result as Task,
      undoLabel: "Changed",
      after: () => reload(id),
    });
  },

  addSubtask: async (taskId, title, owner) => {
    await getAdapter().postSubtask(taskId, { title, owner });
    await reload(taskId);
  },

  patchSubtask: async (taskId, subtaskId, patch) => {
    const before = currentSubtask(taskId, subtaskId);
    if (before == null) return { reason: "that subtask is not here any more" };
    return optimisticWrite<Subtask>({
      before,
      patch,
      apply: (values) => applyToSubtask(taskId, subtaskId, values),
      send: () => getAdapter().patchSubtask(taskId, subtaskId, patch),
      sendUndo: (previous) => getAdapter().patchSubtask(taskId, subtaskId, previous).then(() => undefined),
      current: async () => (await getAdapter().getTask(taskId)).subtasks.find((s) => s.id === subtaskId),
      wroteOf: (result) => (result as Task).subtasks?.find((s) => s.id === subtaskId),
      undoLabel: patch.done === true ? "Done" : patch.done === false ? "Reopened" : "Changed",
      after: () => reload(taskId),
    });
  },

  /**
   * TK-09's delete, and the undo that makes it survivable.
   *
   * The removal is optimistic on the LIST (a row that lingers after you delete
   * it reads as a failure), and the undo re-POSTs with `restoreId` — the
   * server kept a tombstone, so what comes back is the same subtask with its
   * own id, its `done` and its meta rather than a lookalike.
   */
  deleteSubtask: async (taskId, subtaskId) => {
    const removed = currentSubtask(taskId, subtaskId);
    if (removed == null) return { reason: "that subtask is not here any more" };
    const drop = () => patchBoth(taskId, (t) => ({ ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) }));
    // WPF-8: a refusal puts the row back where it was. `optimisticWrite` hands its
    // rollback a COPY of the record, so the identity test this used never matched
    const at = Math.max(findTask(taskId)?.subtasks.findIndex((s) => s.id === subtaskId) ?? 0, 0);
    const restore = () =>
      patchBoth(taskId, (t) => (t.subtasks.some((s) => s.id === subtaskId) ? t : { ...t, subtasks: [...t.subtasks.slice(0, at), removed, ...t.subtasks.slice(at)] }));
    return optimisticWrite<Subtask>({
      before: removed,
      // the whole record is what changes, so the undo has all of it to send
      patch: removed,
      apply: (values) => (values === removed ? drop() : restore()),
      send: () => getAdapter().deleteSubtask(taskId, subtaskId),
      sendUndo: async () => {
        await getAdapter().postSubtask(taskId, { title: removed.title, owner: removed.owner, restoreId: removed.id });
      },
      undoLabel: "Deleted",
      after: () => reload(taskId),
    });
  },
}));
