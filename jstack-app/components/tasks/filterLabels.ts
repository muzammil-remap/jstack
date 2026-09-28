/**
 * What a filter value is CALLED (F-1, TF-03, ADR-44).
 *
 * `in_progress` is a wire value. It belongs on the wire, and a chip that says
 * it is the app showing its own plumbing to somebody who has never seen the
 * contract. The same goes for `ea` and `josh`, which are ids of people and
 * agents and read as neither.
 *
 * One table, two readers — the panel that offers the values and the chip row
 * that lists the chosen ones. Two tables would have drifted the first time a
 * status was renamed, and the drift would have been silent: the panel would
 * offer "In progress" and the chip row would say `in_progress`, which reads as
 * two different filters.
 */
import { personLabel } from "@/lib/taskMeta";
import type { FilterGroupKey } from "@/data/taskFilters";

const STATUS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
};

const PRIORITY: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

const DUE: Record<string, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  none: "No due date",
};

export function filterValueLabel(group: FilterGroupKey, value: string): string {
  if (group === "status") return STATUS[value] ?? value;
  if (group === "priority") return PRIORITY[value] ?? value;
  if (group === "due") return DUE[value] ?? value;
  // `owner` goes through the ONE map from a wire id to a name (T-4); `project`
  // is already the project's own name and needs nothing.
  if (group === "owner") return personLabel(value);
  return value;
}
