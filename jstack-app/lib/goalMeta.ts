/**
 * The one composer for a goal's status line (LG-1, LG-02; D-1/ADR-47, hard
 * rules 16, 19 and 21).
 *
 * `Goal.status` used to be a SENTENCE the server wrote — "on track · due
 * {{DATESHORT+8}}", "behind · 2 this week" — with `statusTone` beside it
 * saying how to paint that sentence. That is three separate faults in one
 * field, and `lib/taskMeta.ts` exists because `Task.meta` had the same three:
 *
 *   1. the app had no say in how a goal described itself, so three surfaces
 *      (the Life card, the `goals.rows` bind, the search snippet) printed the
 *      server's words verbatim and could not have differed if they should;
 *   2. the due date inside it was a fixture literal computed from an offset
 *      beside the `due` field it was describing — the R23-01 defect, where a
 *      bill stated two different dates the day after the fixtures were
 *      written;
 *   3. the tone was a second declaration of a fact the status already carried,
 *      and a second declaration is one that drifts (rule 16).
 *
 * So the wire carries the enum the contract specifies and the KPI the goal is
 * measured by, and this composes the line. One function, four callers, and the
 * order is fixed here rather than argued per surface:
 *
 *     status · progress · due
 *
 * `formatDate`, never `formatWhen`: `targetDate` is a day key with no clock in
 * it, and formatting it as an instant would invent a midnight the goal never
 * had (resolution #6).
 */
import { formatDate } from "@/lib/time";
import type { Goal, GoalKpi, GoalStatus } from "@/data/types";

/**
 * The four members, in the words a person reads (hard rule 21).
 *
 * "on track" rather than "active" is deliberate and not a nicety: `active` is
 * how the SET is filtered — the goals still in play — while what the row is
 * saying is how this one is going. The pack has shipped "on track" and
 * "behind" since V2 and Josh has seen both; the enum is new underneath them.
 *
 * Exported as the map, not just the lookup, so a test can assert every member
 * has a label and that nothing else does — the guard that stops a status added
 * later from reaching a row as its raw wire name.
 */
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "on track",
  behind: "behind",
  done: "done",
  dropped: "dropped",
};

export function goalStatusPhrase(status: GoalStatus): string {
  return GOAL_STATUS_LABELS[status];
}

/**
 * Which of the two ways the line is painted (LF-01).
 *
 * Derived rather than carried: `statusTone` was a wire field that could
 * disagree with the status beside it, and a dot whose colour argues with the
 * words next to it is hard rule 20's own example (R-30). Only `behind` reads
 * as something to look at; done and dropped are settled, and settled is not an
 * alarm.
 */
export function goalStatusTone(status: GoalStatus): "ok" | "behind" {
  return status === "behind" ? "behind" : "ok";
}

/**
 * A KPI as a number a person can act on: "2 of 3 workouts".
 *
 * `value` alone was what the old sentence said ("2 this week"), which tells a
 * reader how many without telling them how many were wanted — so 2 could be
 * nearly there or barely started and the row read the same either way.
 */
export function goalKpiStat(kpi: GoalKpi): string {
  const unit = kpi.unit != null && kpi.unit.trim() !== "" ? ` ${kpi.unit}` : "";
  return `${kpi.value} of ${kpi.target}${unit}`;
}

/** The same pair with its caption, for the one-line form: "2 of 3 this week".
 * The unit stays out of the row — it belongs beside the number in the detail's
 * stats, where there is room for it (LG-02). */
function goalKpiSummary(kpi: GoalKpi): string {
  return `${kpi.value} of ${kpi.target} ${kpi.label}`;
}

/**
 * The line itself. The FIRST KPI only: a goal may be measured several ways and
 * a row that printed all of them would stop being a row. The detail shows the
 * full set (LG-02), which is what a detail is for.
 */
export function goalMetaLine(goal: Goal, nowDate?: Date): string {
  const kpi = goal.kpis?.[0];
  return [
    goalStatusPhrase(goal.status),
    kpi != null ? goalKpiSummary(kpi) : undefined,
    goal.targetDate != null ? `due ${formatDate(goal.targetDate, nowDate)}` : undefined,
  ]
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .join(" · ");
}
