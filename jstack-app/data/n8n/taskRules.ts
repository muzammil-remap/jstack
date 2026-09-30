/**
 * The task list's rules on the n8n build — slicers, the date range and the filter groups — copied
 * from `data/mock/predicates.ts`, the spec, because `data/n8n/` may not import `data/mock/`
 * (CT-03). What a range preset MEANS is still `data/taskFilters.ts`'s, shared with the app, so the
 * chip and the list cannot disagree about a window.
 *
 * Nothing here is new behaviour: a slicer kind the table does not know matches nothing, an undated
 * task is inside every open-view window, Done measures `completedAt`, groups AND and values OR.
 */
import { atTime, dayKey } from "@/lib/time";
import { FILTER_GROUP_KEYS, type FilterGroupKey, type RangeWindow, type TaskFilters } from "@/data/taskFilters";
import type { SlicerPredicate, Task, TaskView } from "@/data/types";

/** `data/mock/predicates.ts` `dueBucket` — `due` is a day key */
function dueBucket(task: Task, now: Date): TaskFilters["due"][number] {
  if (task.due == null) return "none";
  const due = atTime(task.due, 0);
  if (dayKey(due) === dayKey(now)) return "today";
  if (due.getTime() < now.getTime()) return "overdue";
  if (due.getTime() <= now.getTime() + 7 * 86_400_000) return "week";
  return "none";
}

/** `data/mock/predicates.ts` `PREDICATE_KINDS` */
const PREDICATE_KINDS: { [K in SlicerPredicate["kind"]]: (task: Task, predicate: Extract<SlicerPredicate, { kind: K }>, now: Date) => boolean } = {
  dueWithin: (t, p, now) => t.due != null && atTime(t.due, 0) <= new Date(now.getTime() + p.days * 86_400_000),
  status: (t, p) => t.status === p.status,
  delegated: (t) => t.delegated != null,
  owner: (t, p) => t.owner === p.owner,
  repeat: (t) => t.repeat != null,
};

export function passesSlicer(task: Task, predicate: SlicerPredicate, now: Date): boolean {
  const run = PREDICATE_KINDS[predicate.kind] as ((t: Task, p: SlicerPredicate, n: Date) => boolean) | undefined;
  return run != null && run(task, predicate, now);
}

/** `data/mock/predicates.ts` `inWindow` */
export function inWindow(task: Task, window: RangeWindow, view: TaskView): boolean {
  if (window.from == null && window.to == null) return true;
  const after = (key: string) => window.from == null || key >= window.from;
  const before = (key: string) => window.to == null || key <= window.to;
  if (view === "done") return task.completedAt != null && after(dayKey(new Date(task.completedAt))) && before(dayKey(new Date(task.completedAt)));
  const keys = [task.due, task.startsAt == null ? undefined : dayKey(new Date(task.startsAt)), task.endsAt == null ? undefined : dayKey(new Date(task.endsAt))].filter((k): k is string => k != null);
  if (keys.length === 0) return true;
  return keys.some((k) => after(k) && before(k));
}

/** `data/mock/predicates.ts` `FILTER_GROUPS` */
const FILTER_GROUPS: { [K in FilterGroupKey]: (task: Task, selected: TaskFilters[K], now: Date) => boolean } = {
  priority: (t, selected) => selected.includes(t.priority),
  status: (t, selected) => selected.includes(t.status),
  project: (t, selected) => t.project != null && selected.includes(t.project),
  owner: (t, selected) => selected.includes(t.owner),
  due: (t, selected, now) => selected.includes(dueBucket(t, now)),
};

/** `data/mock/predicates.ts` `passesFilters` */
export function passesFilters(task: Task, filters: TaskFilters, now: Date): boolean {
  for (const key of FILTER_GROUP_KEYS) {
    const selected = filters[key];
    if (selected == null || selected.length === 0) continue;
    const group = FILTER_GROUPS[key] as (t: Task, s: unknown, n: Date) => boolean;
    if (!group(task, selected, now)) return false;
  }
  return true;
}
