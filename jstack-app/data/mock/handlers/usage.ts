/**
 * §4.16 Usage (T-4, ADR-43) — what the agents spent, and the one place the
 * mock adds a cost up.
 *
 * The `Usage` row is the record. Everything else that quotes a cost derives
 * it from here: a run's `cost` (`handlers/agents.ts` calls `runsWithCost()`),
 * the day's spend, the month's, a task's delegation cost and the cost in its
 * meta line (`db.ts` sets both from `costOfTask()` on load). Before this row
 * there were four independent numbers and nothing keeping them equal — the
 * fixture said a run cost $0.40 and a task said $0.40 because somebody typed
 * both, which is a copy that drifts (rule 16).
 *
 * `groupBy` is deliberately NOT implemented, and CONTRACT_v22.md §4.16 has
 * been corrected to match: the summary carries its rows, so a second grouping
 * on the wire would be the server computing what the caller already holds —
 * and an unread query parameter is a claim with no gate behind it. The
 * section's stat cards group by agent from `rows` (`layout/sources.ts`).
 */
import * as db from "@/data/mock/db";
import { dayKey } from "@/lib/time";
import { err, ok } from "@/data/mock/util";
import { totalCost } from "@/lib/usage";
import type { AgentRun, Usage, UsageSummary, UsageTotal } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

/** `lib/usage.ts` owns the addition and the rounding to cents (`totalCost`);
 * this file owns which rows go into it. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** every row for a task, its subtasks included — the card's question. */
export function usageOfTask(taskId: string): Usage[] {
  return db.get().usage.filter((u) => u.taskId === taskId);
}

export function costOfTask(taskId: string): number {
  return totalCost(usageOfTask(taskId));
}

/** the runs, each with the cost of the usage rows that name it. A run with no
 * rows costs nothing, which is the truth about a blocked or errored one. */
export function runsWithCost(): AgentRun[] {
  const rows = db.get().usage;
  return db.get().agentRuns.map((r) => ({ ...r, cost: totalCost(rows.filter((u) => u.runId === r.id)) }));
}

/** by model, because that is the grouping a person acts on: "which model is
 * this costing me". The order is the order the models first appear. */
export function totalsByModel(rows: readonly Usage[]): UsageTotal[] {
  const out = new Map<string, UsageTotal>();
  for (const u of rows) {
    const t = out.get(u.model) ?? { model: u.model, inputTokens: 0, outputTokens: 0, costAud: 0 };
    out.set(u.model, { model: u.model, inputTokens: t.inputTokens + u.inputTokens, outputTokens: t.outputTokens + u.outputTokens, costAud: t.costAud + u.costAud });
  }
  return [...out.values()].map((t) => ({ ...t, costAud: round2(t.costAud) }));
}

function summarise(rows: Usage[]): UsageSummary {
  return { rows, totals: totalsByModel(rows), costAud: totalCost(rows) };
}

/** newest first — this is a log Josh reads down, not a leaderboard
 * (resolution #14: "lists tasks newest first with the cost shown"). */
const newestFirst = (rows: Usage[]): Usage[] => [...rows].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

export function getTaskUsage(_req: TransportRequest, id: string): TransportResponse {
  if (!db.get().tasks.some((t) => t.id === id)) return err(404, "not found");
  return ok(summarise(newestFirst(usageOfTask(id))));
}

export function getUsage(req: TransportRequest): TransportResponse {
  // the month is the default: a section that names no range is still asking a
  // question, and "everything ever" is not the one the Agents tab means.
  const range = req.query?.range ?? "month";
  const month = dayKey(db.now()).slice(0, 7);
  const rows = db.get().usage.filter((u) => range === "all" || dayKey(new Date(u.at)).startsWith(month));
  return ok(summarise(newestFirst(rows)));
}
