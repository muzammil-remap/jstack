/**
 * The task filter shape, declared ONCE (TK-14, S-2, F-1).
 *
 * It used to exist twice: `TaskFilters` in `stores/tasks.ts` and an identical
 * `TaskFiltersWire` in `data/mock/handlers/tasks.ts`, with a comment on each
 * pointing at the other. Two copies of one fact are two facts that will
 * eventually disagree — and the disagreement here would have been silent, a
 * filter the app sends and the server quietly drops (rule 16). Both sides now
 * import this file, so a new group cannot be added to one half alone.
 *
 * The shape is serialised as JSON into the wire's opaque `?filters=` string:
 * groups AND together, values within one group OR, so a task matching ANY
 * selected priority AND ANY selected status passes.
 *
 * F-1 adds the RANGE, which is the one filter that is always on (ADR-44). A
 * group nobody selected filters nothing; a range nobody selected still decides
 * which tasks are on the screen. That is why `resolveRange` is here rather than
 * in the mock: the chip composes its label from the same window the server
 * filters by, so the label cannot say "Next 90 days" over a list showing thirty.
 */
import { addDays, formatShort, weekStart } from "@/lib/time";
import type { Task, TaskView } from "@/data/types";

/**
 * `default` is the only preset whose meaning depends on the view: the next
 * `tasks.rangeDays` days on List, Board and Gantt, and ALL TIME on Done
 * (Josh, 7 Sep — "Done shows everything"; resolution #45). Every other preset
 * means the same thing everywhere, so a range chosen on one view is honest on
 * the next.
 */
export type RangePreset = "default" | "thisWeek" | "next" | "last" | "all" | "custom";

/** day keys, never instants: a range is about days, and an instant here would
 * invent a midnight nobody chose (the same rule `due` follows). */
export type TaskRange = { preset: RangePreset; from?: string; to?: string };

/** an absent bound is open on that side, not "today" */
export type RangeWindow = { from?: string; to?: string };

export type TaskFilters = {
  priority: Task["priority"][];
  status: Task["status"][];
  project: string[];
  owner: Task["owner"][];
  due: ("overdue" | "today" | "week" | "none")[];
  range: TaskRange;
  /** ADR-45: which board columns are shown. The board's half of the same
   * state, carried here so one Clear resets everything a person can narrow by. */
  columns?: string[];
};

export const EMPTY_FILTERS: TaskFilters = { priority: [], status: [], project: [], owner: [], due: [], range: { preset: "default" } };

/** the groups, without the range and the columns — the things a chip row
 * lists one by one. */
export const FILTER_GROUP_KEYS = ["priority", "status", "project", "owner", "due"] as const;
export type FilterGroupKey = (typeof FILTER_GROUP_KEYS)[number];

export function isDefaultRange(range: TaskRange): boolean {
  return range.preset === "default";
}

/** how many chips the active-filter row shows, and the number on the tune
 * button (TF-04). The range is not one of them: it has a chip of its own that
 * is always visible, so counting it would count it twice. */
export function activeFilterCount(f: TaskFilters): number {
  return FILTER_GROUP_KEYS.reduce((n, k) => n + f[k].length, 0) + (f.columns?.length ?? 0);
}

/**
 * The window a range means, in day keys. `{}` is "everything" — the two views
 * that mean it (`all`, and `default` on Done) say it the same way, so a caller
 * never has to ask which of them it is looking at.
 */
export function resolveRange(range: TaskRange, view: TaskView, rangeDays: number, todayKey: string): RangeWindow {
  const preset = range.preset === "default" ? (view === "done" ? "all" : "next") : range.preset;
  switch (preset) {
    case "thisWeek": {
      const from = weekStart(todayKey);
      return { from, to: addDays(from, 6) };
    }
    case "next":
      return { from: todayKey, to: addDays(todayKey, rangeDays) };
    case "last":
      return { from: addDays(todayKey, -rangeDays), to: todayKey };
    case "custom": {
      const window: RangeWindow = {};
      if (range.from != null) window.from = range.from;
      if (range.to != null) window.to = range.to;
      return window;
    }
    default:
      return {};
  }
}

/**
 * What the chip reads (TF-02). Composed from the parameter rather than typed,
 * so raising `tasks.rangeDays` to 120 changes the label and the window in one
 * move — the pair that "Next 90 days" over a 30-day list would break.
 */
export function rangeLabel(range: TaskRange, view: TaskView, rangeDays: number, todayKey: string): string {
  const preset = range.preset === "default" ? (view === "done" ? "all" : "next") : range.preset;
  if (preset === "thisWeek") return "This week";
  if (preset === "next") return `Next ${rangeDays} days`;
  if (preset === "last") return `Last ${rangeDays} days`;
  if (preset === "custom") {
    const from = range.from != null ? formatShort(range.from) : undefined;
    const to = range.to != null ? formatShort(range.to) : undefined;
    if (from != null && to != null) return `${from} – ${to}`;
    if (from != null) return `From ${from}`;
    if (to != null) return `Until ${to}`;
    // JQ-5: a custom range with no bounds yet is an INVITATION, not a window.
    // It used to fall through to "All time", so the preset row — which labels
    // each chip by calling this with the bare preset — showed two chips reading
    // "All time", and the one that opened the date fields wore the name of the
    // one beside it that did nothing.
    return "Select date range";
  }
  return "All time";
}

/** `undefined` when nothing is chosen, so an unfiltered request carries no
 * query at all rather than an empty object the server has to parse. The RANGE
 * counts as chosen only when it is not `default` — the server resolves that
 * one itself, per view, from the same function above. */
export function serializeFilters(f: TaskFilters): string | undefined {
  const active = FILTER_GROUP_KEYS.some((k) => f[k].length > 0) || (f.columns?.length ?? 0) > 0 || !isDefaultRange(f.range);
  return active ? JSON.stringify(f) : undefined;
}

/** the four segments. F-1 made "gantt" a real `TaskView` — it used to be the
 * one segment with no wire value of its own, because it called
 * `GET /tasks/gantt` instead, and that route is gone. */
export type TaskSegment = TaskView;
