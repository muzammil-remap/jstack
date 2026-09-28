/**
 * The lines the app draws about what an agent run cost (T-4, ADR-43).
 *
 * Three functions, one rule between them: **the only arithmetic here is
 * addition.** `costAud` is priced server-side against a versioned price table
 * and arrives finished; a run line prints it, a total line adds up the ones
 * the server already grouped, and the CSV writes them out raw. There is no
 * price table in this app and no token-to-cost multiplication anywhere in it —
 * `tests/unit/usage.test.ts`'s US-05 sweep over `lib/`, `stores/` and
 * `components/` is what keeps that true after this file is forgotten about.
 *
 * The reason that matters more than it looks: a rate copied into a client is
 * wrong the first time a provider changes one, and by then it is quoted on the
 * task card, in the Agents section, in a CSV somebody has already exported,
 * and in a spreadsheet built on that CSV.
 *
 * Both callers of `usageLine` — the task card's Activity list and a subtask's
 * runs — get the same line for the same row, which is the only way a person
 * can compare two of them.
 */
import { formatWhen } from "@/lib/time";
import { money } from "@/lib/money";
import { personLabel } from "@/lib/taskMeta";
import type { BlockRow, BlockStat, Usage, UsageSummary } from "@/data/types";

/**
 * The one adder (T-4). Rounded to cents so a sum of three rows cannot read as
 * $0.30000000000000004, and used by the mock's handlers and by `db.ts` as well
 * as by the lines below — a second `reduce` over `costAud` somewhere else is
 * how the four numbers this row unified drifted apart in the first place.
 */
export function totalCost(rows: readonly Usage[]): number {
  return round2(rows.reduce((n, u) => n + u.costAud, 0));
}

/** cents: a sum of per-row costs is a float, and $0.40 + $0.02 is not exactly
 * $0.42 in binary. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "12,400" — separators, because five digits of tokens are unreadable
 * without them and this line carries two of them side by side (US-01). The
 * locale is pinned for the same reason `lib/money.ts` pins it: one app, one
 * rendering of the same number. */
function count(n: number): string {
  return n.toLocaleString("en-AU");
}

/** "EA · claude-sonnet-5 · 12,400 in · 3,100 out · $0.38 · Thu 11 Sep, 2:14am" */
export function usageLine(u: Usage, nowDate?: Date): string {
  return [personLabel(u.agentId), u.model, `${count(u.inputTokens)} in`, `${count(u.outputTokens)} out`, money(u.costAud), formatWhen(u.at, nowDate)].join(" · ");
}

/**
 * "Total · 2 models · 20,600 tokens · $0.40" — the line a COMPLETED task
 * carries under its runs (US-02).
 *
 * `null` when there is nothing to total: a task with no agent runs must not
 * grow a row saying it spent nothing, which is a sentence about an absence.
 */
export function usageTotalLine(summary: UsageSummary): string | null {
  if (summary.rows.length === 0) return null;
  const models = summary.totals.length;
  const tokens = summary.rows.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0);
  return `Total · ${models} ${models === 1 ? "model" : "models"} · ${count(tokens)} tokens · ${money(summary.costAud)}`;
}

/**
 * The Agents › Usage section's stat cards (US-03) and its rows (resolution
 * #51), shaped here rather than in `layout/sources.ts` for the reason every
 * other line in this file is here: the card and the section show the same
 * numbers, and two places that format one number will eventually format it
 * two ways. `sens` on every money stat — spend blurs with privacy on (GL-03).
 */
export function usageStats(summary: UsageSummary): BlockStat[] {
  const byAgent = new Map<string, number>();
  for (const u of summary.rows) byAgent.set(u.agentId, (byAgent.get(u.agentId) ?? 0) + u.costAud);
  return [
    { id: "spend", value: money(summary.costAud), label: "This month", sens: true },
    { id: "tokens", value: count(summary.rows.reduce((n, u) => n + u.inputTokens + u.outputTokens, 0)), label: "Tokens" },
    ...[...byAgent.entries()].map(([agentId, spent]) => ({ id: `agent-${agentId}`, value: money(round2(spent)), label: personLabel(agentId), sens: true })),
    ...summary.totals.map((t) => ({ id: `model-${t.model}`, value: money(t.costAud), label: t.model, sens: true })),
  ];
}

/** one row per task, newest first — `summary.rows` already is, so the first
 * sighting of a task IS its most recent run and Map order keeps it. */
export function usageRows(summary: UsageSummary, titles: Record<string, string>): BlockRow[] {
  const seen = new Map<string, { runs: number; cost: number; at: string }>();
  for (const u of summary.rows) {
    const prev = seen.get(u.taskId);
    seen.set(u.taskId, { runs: (prev?.runs ?? 0) + 1, cost: (prev?.cost ?? 0) + u.costAud, at: prev?.at ?? u.at });
  }
  return [...seen.entries()].map(([taskId, t]) => ({
    id: taskId,
    name: titles[taskId] ?? taskId,
    meta: `${t.runs} ${t.runs === 1 ? "run" : "runs"} · ${money(round2(t.cost))} · ${formatWhen(t.at)}`,
    verb: { label: "Open", action: "open" as const },
  }));
}

const COLUMNS = "taskId,subtaskId,agent,model,in,out,cost,at";

/** RFC 4180 quoting, and only where it is needed — a model id with a comma in
 * it would otherwise shift every column after it by one. */
function field(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * US-04. The numbers go out RAW — no separators, no dollar sign — because
 * this text is going into a spreadsheet, and "12,400" lands there as two
 * columns or as the string it looks like. The header names the columns so
 * the file still means something a month later.
 */
export function usageCsv(rows: readonly Usage[]): string {
  const lines = rows.map((u) =>
    [u.taskId, u.subtaskId ?? "", u.agentId, u.model, String(u.inputTokens), String(u.outputTokens), String(u.costAud), u.at].map(field).join(","),
  );
  return [COLUMNS, ...lines].join("\n");
}
