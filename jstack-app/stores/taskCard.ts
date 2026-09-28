/**
 * taskCard.ts (Stage 5d P-2, F-13) — the OPEN task: which one is open, its
 * fresh copy, the tick and the confirm it can raise, the undoable completion,
 * accept, the EA's report, delegation, and a task made from a goal's card.
 *
 * `stores/tasks.ts` held the LIST and the CARD in one file at its 200-line
 * cap, and `taskEdits.ts`'s header had said since T-3 that the seam was only
 * half cut ("Stage 5d finishes it"). This is the other half: the list store
 * keeps the rows, the filters, the waiting rows, the columns and the roster;
 * everything about the one task in front of the person lives here. The two
 * read each other only inside actions through `getState()`, never at module
 * load, so the import cycle with `taskEdits.ts` is the shape `tasks.ts`
 * already had with it.
 *
 * `findTask` is the ONE answer to "the freshest copy of task N the app holds":
 * the open card first (an optimistic edit lands there and on the list
 * together), then the list, then the tick that raised the confirm — Today's
 * checkbox opens the confirm over an empty list (B-26). `CompleteConfirm`,
 * `taskEdits` and the old `completeTask` each wrote that search by hand, in
 * three different orders.
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import { isQueued } from "@/data/transport/outbox";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import { useTaskEditsStore } from "@/stores/taskEdits";
import { useTasksStore } from "@/stores/tasks";
import { useTodayStore } from "@/stores/today";
import type { Task, TaskReport } from "@/data/types";

type TaskCardState = {
  openTaskId: string | null;
  detailTask: Task | null;
  /**
   * The task the confirm dialog is asking about (T-3). Carried rather than
   * looked up: the tick can come from the Tasks list, from Today's own
   * three-task slice or from the board, and the dialog found nothing on Today
   * because the tasks LIST is empty there (B-26). The tick knows which task it
   * was; that is the thing to keep.
   */
  pendingComplete: Task | null;

  openTask: (id: string | null) => void;
  loadDetailTask: (id: string) => Promise<void>;
  acceptTask: (id: string) => Promise<void>;
  submitReport: (id: string, verb: "accept" | "revise" | "teach", note?: string) => Promise<TaskReport>;
  /**
   * TK-10 — the one tick, for every surface that has one.
   *
   * A done task reopens. An open task with OPEN SUBTASKS asks first, and
   * completes nothing until the confirm is answered. An open task with none
   * completes. `toggleDone` used to be this and could not express the middle
   * case: it either ignored the subtasks — the defect the rule exists to stop
   * — or asked a question its caller had no way to answer (§4, A-39). Takes
   * the TASK rather than an id, so Today's own three-task slice can use it
   * without the Tasks tab's filtered list.
   */
  requestComplete: (task: Task) => Promise<void>;
  /** TK-10/TK-11: the completion itself, undoable. */
  /**
   * `subject` is REQUIRED: the task as the caller holds it, so the undo
   * always has a snapshot. Every caller has one, and making it optional
   * is what left the hole at A4R3-04 open a second time (B-26's twin).
   */
  completeTask: (id: string, includeSubtasks: boolean, subject: Task) => Promise<void>;
  /** T-2: `to` is the delegatee — the picker's answer, or the default. */
  delegate: (id: string, to?: Task["owner"], scope?: string) => Promise<void>;
  /** LG-03: a task made from a goal's card (F-73 — `postTask`'s one caller,
   * which sat in a component). The caller opens the card it returns. */
  createTask: (body: Omit<Task, "id" | "activity" | "subtasks">) => Promise<Task | null>;
};

/** the data half, once — the tests reset from it (F-84) */
export const INITIAL = { openTaskId: null as string | null, detailTask: null as Task | null, pendingComplete: null as Task | null };

function pick(id: string, card: { detailTask: Task | null; pendingComplete: Task | null }, list: Task[]): Task | null {
  if (card.detailTask?.id === id) return card.detailTask;
  return list.find((t) => t.id === id) ?? (card.pendingComplete?.id === id ? card.pendingComplete : null);
}

/** the freshest copy of task `id` the app holds, or null — never a lookalike */
export function findTask(id: string): Task | null {
  return pick(id, useTaskCardStore.getState(), useTasksStore.getState().list);
}

/** the same lookup, subscribed — for a component rendering task `id` */
export function useTask(id: string): Task | null {
  const detailTask = useTaskCardStore((s) => s.detailTask);
  const pendingComplete = useTaskCardStore((s) => s.pendingComplete);
  const list = useTasksStore((s) => s.list);
  return pick(id, { detailTask, pendingComplete }, list);
}

const reloadList = () => useTasksStore.getState().load();

/**
 * A4R5-05: what a completion wrote, taken back off the task as it stands NOW.
 * The undo used to PUT the whole snapshot from before the tick, so a subtask
 * added inside the ten seconds went with it — `lib/optimistic.ts` rule 4 says
 * undo restores what THIS write changed, not the whole record. A completion
 * writes the status, its two stamps and the subtasks it closed (the ones open
 * in `before`, when it closed any), and that is all this puts back.
 */
/** The completion's undo takes back only what it wrote (B-204), and only while it still says so
 * (A4R8-01's class; `wrote` is the server's answer): a status or a tick set since is not its to undo. */
function revertCompletion(before: Task, wrote: Task, now: Task, closedSubtasks: boolean): Task {
  const closed = new Set(closedSubtasks ? before.subtasks.filter((s) => !s.done).map((s) => s.id) : []);
  const stands = now.status === wrote.status && now.completedAt === wrote.completedAt;
  const w = (id: string) => wrote.subtasks.find((x) => x.id === id);
  const asWritten = (s: Task["subtasks"][number]) => s.done === w(s.id)?.done && s.completedAt === w(s.id)?.completedAt;
  return {
    ...now,
    ...(stands ? { status: before.status, completedAt: before.completedAt, completedBy: before.completedBy } : {}),
    subtasks: now.subtasks.map((s) => (closed.has(s.id) && asWritten(s) ? { ...s, done: false, completedAt: undefined } : s)),
  };
}

export const useTaskCardStore = create<TaskCardState>((set, get) => ({
  ...INITIAL,

  openTask: (openTaskId) => set({ openTaskId, detailTask: openTaskId == null ? null : get().detailTask }),
  loadDetailTask: async (id) => {
    const detailTask = await getAdapter().getTask(id);
    set({ detailTask });
  },
  acceptTask: async (id) => {
    await getAdapter().postTaskAccept(id);
    await Promise.all([get().loadDetailTask(id), reloadList()]);
  },
  submitReport: async (id, verb, note) => {
    const report = await getAdapter().postTaskReport(id, verb, note);
    await get().loadDetailTask(id);
    return report;
  },

  requestComplete: async (task) => {
    // reopening is a plain status change — nothing cascades, so it goes
    // through the same optimistic path as any other field edit
    if (task.status === "done") {
      await useTaskEditsStore.getState().patchTask(task.id, { status: "open" });
      void useTodayStore.getState().load();
      return;
    }
    if (task.subtasks.some((s) => !s.done)) {
      set({ pendingComplete: task });
      useSessionStore.getState().openModal("complete-confirm", task.id);
      return;
    }
    await get().completeTask(task.id, false, task);
  },

  completeTask: async (id, includeSubtasks, subject) => {
    // The snapshot the undo restores: the freshest copy the app holds, else the
    // caller's — GIVEN, so it is unconditional. Looked up alone it answered
    // null on Today (no list, no card) and the completion was written with no
    // undo and no toast (B-26, then A4R3-04 one call deeper; BUGLOG_v22.md B-190).
    const before = findTask(id) ?? subject;
    const result = await getAdapter().postTaskComplete(id, includeSubtasks);
    // A4R6-04: offline it is QUEUED — nothing on a server to undo yet, so no
    // undo (lib/optimistic.ts rule 2); the tick shows here, the outbox carries it
    if (isQueued(result)) {
      const done: Task = { ...before, status: "done", subtasks: before.subtasks.map((s) => (includeSubtasks ? { ...s, done: true } : s)) };
      useTasksStore.setState((s) => ({ list: s.list.map((t) => (t.id === id ? done : t)) }));
      set((s) => ({ pendingComplete: null, detailTask: s.detailTask?.id === id ? done : s.detailTask }));
      // A4R7-06: Today shows its own slice, and a tick there that showed nothing was ticked twice
      useTodayStore.setState((s) => (s.composite == null ? s : { composite: { ...s.composite, tasks: s.composite.tasks.map((t) => (t.id === id ? done : t)) } }));
      await useSyncStore.getState().refresh();
      return;
    }
    // one undo for one decision: the task AND every subtask it closed go back
    const wrote = result as Task;
    useSessionStore.getState().pushUndo("Completed", async () => {
      const now = await getAdapter().getTask(id);
      await getAdapter().putTask(id, revertCompletion(before, wrote, now, includeSubtasks));
      await Promise.all([reloadList(), get().loadDetailTask(id)]);
    });
    await Promise.all([reloadList(), get().openTaskId === id ? get().loadDetailTask(id) : Promise.resolve()]);
    // Today shows its own three-task slice from the composite, so a tick there
    // has to move both. Not awaited: the tick has already happened.
    void useTodayStore.getState().load();
    set({ pendingComplete: null });
  },

  delegate: async (id, to, scope) => {
    await getAdapter().postTaskDelegate(id, to, scope);
    await Promise.all([reloadList(), get().openTaskId === id ? get().loadDetailTask(id) : Promise.resolve()]);
  },

  // A4R6-06: offline a new task is QUEUED and has no id to open yet
  createTask: async (body) => {
    const result = await getAdapter().postTask(body);
    if (!isQueued(result)) return result;
    await useSyncStore.getState().refresh();
    return null;
  },
}));
