/**
 * The task slicers and filter groups, as tables (S-2, prep for TF-06/TF-09).
 *
 * They were an `if/else` chain and a run of five `if` statements inside
 * `getTasks`. That reads fine at five and stops reading at nine, which is what
 * F-1 is about to make it — and a chain has nowhere to hang the metadata a
 * configurable slicer needs. A table has a key per kind, so "does every slicer
 * have an implementation" becomes a question a test can ask.
 *
 * F-1 finished the move: the slicers themselves are stored records now
 * (`fixtures/slicers.json`), and what is closed here is the PREDICATE KIND —
 * five questions the server knows how to answer. `tests/unit/predicates.test.ts`
 * checks each table against its type written out as literals, never against the
 * table's own keys: a guard that derives its expectation from its subject
 * agrees with whatever it finds (rule 14).
 */
import { atTime, dayKey } from "@/lib/time";
import type { Task, SlicerPredicate, TaskView } from "@/data/types";
import { FILTER_GROUP_KEYS, type FilterGroupKey, type RangeWindow, type TaskFilters } from "@/data/taskFilters";

/** which bucket a task's due date falls in, for the `due` filter group */
export function dueBucket(task: Task, now: Date): TaskFilters["due"][number] {
  if (task.due == null) return "none";
  // D-1: a day key is a LOCAL date. `new Date("2026-09-07")` is UTC midnight,
  // which in any zone behind UTC is the previous evening — so a task due today
  // read as overdue for the first half of the day.
  const due = atTime(task.due, 0);
  const todayStr = dayKey(now);
  if (dayKey(due) === todayStr) return "today";
  if (due.getTime() < now.getTime()) return "overdue";
  if (due.getTime() <= now.getTime() + 7 * 86_400_000) return "week";
  return "none";
}

/**
 * One evaluator per predicate KIND (F-1, TF-09).
 *
 * `SLICER_PREDICATES` — one function per slicer id, keyed on the `TaskSlice`
 * union — is gone with it. A slicer is a RECORD now, so its predicate travels
 * WITH it and the seeded five live in `fixtures/slicers.json` like any other
 * stored data. Keeping the old table beside the fixture would have been the
 * same five facts written twice (rule 16), and the copy the server actually
 * ran would have been the one nobody edited.
 */
export const PREDICATE_KINDS: { [K in SlicerPredicate["kind"]]: (task: Task, predicate: Extract<SlicerPredicate, { kind: K }>, now: Date) => boolean } = {
  dueWithin: (t, p, now) => t.due != null && atTime(t.due, 0) <= new Date(now.getTime() + p.days * 86_400_000),
  status: (t, p) => t.status === p.status,
  delegated: (t) => t.delegated != null,
  owner: (t, p) => t.owner === p.owner,
  repeat: (t) => t.repeat != null,
};

/**
 * A kind the table does not know matches NOTHING. It cannot arrive from this
 * app — the union forbids it — but it can arrive from a record stored by an
 * older version, and a slicer that silently stopped filtering would look like
 * a filter that matched a lot rather than one that never ran.
 */
export function passesSlicer(task: Task, predicate: SlicerPredicate, now: Date): boolean {
  const run = PREDICATE_KINDS[predicate.kind] as ((t: Task, p: SlicerPredicate, n: Date) => boolean) | undefined;
  return run != null && run(task, predicate, now);
}

/**
 * The range window (F-1, TF-01, ADR-44). `data/taskFilters.ts` decides WHAT
 * window a preset means; this decides which tasks fall in one.
 *
 * The open views measure the three dates a task can carry, and a task with
 * none of them is always inside (resolution #4) — an undated task is not "in
 * the past", it is unscheduled, and hiding it behind a forward window would
 * make it unreachable from any view. Done measures `completedAt` instead, and
 * a task with no stamp is out of any narrowed window: a completion before T-3
 * recorded no time, and a window cannot claim it landed inside one.
 */
export function inWindow(task: Task, window: RangeWindow, view: TaskView): boolean {
  if (window.from == null && window.to == null) return true;
  const after = (key: string) => window.from == null || key >= window.from;
  const before = (key: string) => window.to == null || key <= window.to;

  if (view === "done") {
    return task.completedAt != null && after(dayKey(new Date(task.completedAt))) && before(dayKey(new Date(task.completedAt)));
  }
  const keys = [task.due, task.startsAt == null ? undefined : dayKey(new Date(task.startsAt)), task.endsAt == null ? undefined : dayKey(new Date(task.endsAt))].filter(
    (k): k is string => k != null,
  );
  if (keys.length === 0) return true;
  return keys.some((k) => after(k) && before(k));
}

/**
 * One test per filter group. Each answers "does this task pass the values
 * selected in this group", and an empty selection passes everything — the
 * caller checks that before asking, so the group never has to know.
 */
export const FILTER_GROUPS: {
  [K in FilterGroupKey]: (task: Task, selected: TaskFilters[K], now: Date) => boolean;
} = {
  priority: (t, selected) => selected.includes(t.priority),
  status: (t, selected) => selected.includes(t.status),
  project: (t, selected) => t.project != null && selected.includes(t.project),
  owner: (t, selected) => selected.includes(t.owner),
  due: (t, selected, now) => selected.includes(dueBucket(t, now)),
};

/**
 * Groups AND together, values within a group OR (TK-14). An empty group is
 * not a filter that excludes everything — it is no filter at all.
 */
export function passesFilters(task: Task, filters: TaskFilters, now: Date): boolean {
  // FILTER_GROUP_KEYS, not `Object.keys(FILTER_GROUPS)`: F-1 put `range` and
  // `columns` on `TaskFilters`, and neither is a chip group — the range is
  // applied by `inWindow` against the view, and columns are the board's.
  for (const key of FILTER_GROUP_KEYS) {
    const selected = filters[key];
    if (selected == null || selected.length === 0) continue;
    const group = FILTER_GROUPS[key] as (t: Task, s: unknown, n: Date) => boolean;
    if (!group(task, selected, now)) return false;
  }
  return true;
}
