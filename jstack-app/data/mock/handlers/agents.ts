/** §4.8 Agents. AgentSummary/Spend are derived from the runs table on
 * every read (§7) rather than stored — a run always moves both together. */
import { dayKey } from "@/lib/time";
import * as db from "@/data/mock/db";
import { err, ok, requireHighRisk } from "@/data/mock/util";
import { runsWithCost } from "@/data/mock/handlers/usage";
import { UNDO_WINDOW_MS } from "@/data/mock/handlers/decisions";
import type { AgentIssue, AgentRoster, AgentSummary, SecurityCheck, Spend } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

function todayStr(): string {
  return dayKey(db.now());
}

/**
 * §4.15 (T-2, resolution #22) — who a task can be handed to.
 *
 * Read from the fixture rather than derived from the spend caps: a cap is a
 * money limit on an agent, not a statement that it takes work, and the dev has
 * no cap at all. `canTakeTasks` is the whole point of the list — a roster that
 * could not say no would just be a list of names.
 */
export function agentRoster(): AgentRoster {
  return db.get().agentRoster;
}

export function getAgents(_req: TransportRequest): TransportResponse {
  return ok(agentRoster());
}

export function getAgentSummary(_req: TransportRequest): TransportResponse {
  const state = db.get();
  // T-4: `runsWithCost()`, never `state.agentRuns` — a run has no cost of its
  // own any more, and reading the raw table here would report $0.00 spent on a
  // day the agents spent forty cents (ADR-43).
  const runsToday = runsWithCost().filter((r) => dayKey(new Date(r.at)) === todayStr());
  const ok_ = runsToday.filter((r) => r.outcome === "ok").length;
  const openIssues = state.agentIssues.filter((i) => i.state === "open").length;
  const lastCheck = state.securityChecks.find((c) => c.name === "Watchdog heartbeat");
  const summary: AgentSummary = {
    runsToday: runsToday.length,
    successPct: runsToday.length > 0 ? Math.round((ok_ / runsToday.length) * 100) : 100,
    spendToday: Math.round(runsToday.reduce((n, r) => n + r.cost, 0) * 100) / 100,
    issues: openIssues,
    health: openIssues > 0 ? "degraded" : "healthy",
    heartbeat: { every: "5 min", last: lastCheck?.lastRun ?? db.now().toISOString() },
  };
  return ok(summary);
}

export function getAgentSpend(_req: TransportRequest): TransportResponse {
  const state = db.get();
  const spentByAgent = new Map<string, number>();
  for (const r of runsWithCost()) spentByAgent.set(r.agent, (spentByAgent.get(r.agent) ?? 0) + r.cost);
  const monthSpent = [...spentByAgent.values()].reduce((n, v) => n + v, 0);
  const monthCap = state.agentCaps.reduce((n, c) => n + c.cap, 0);
  const spend: Spend = {
    month: { spent: Math.round(monthSpent * 100) / 100, cap: monthCap, landing: Math.round(monthSpent * 4 * 100) / 100 },
    caps: state.agentCaps.map((c) => ({ agent: c.agent, spent: Math.round((spentByAgent.get(c.agent) ?? 0) * 100) / 100, cap: c.cap })),
  };
  return ok(spend);
}

export function putAgentCaps(req: TransportRequest): TransportResponse {
  const bad = requireHighRisk(req.body);
  if (bad) return bad;
  const body = (req.body ?? {}) as { caps?: { agent: string; cap: number }[] };
  const state = db.get();
  state.agentCaps = body.caps ?? state.agentCaps;
  return getAgentSpend(req);
}

export function getPortals(_req: TransportRequest): TransportResponse {
  return ok(db.get().portals);
}

/** OP-05: one issue — what failed, when, the last success, and its verbs. */
export function getAgentIssue(_req: TransportRequest, id: string): TransportResponse {
  const issue = db.get().agentIssues.find((i) => i.id === id);
  return issue == null ? err(404, "not found") : ok(issue);
}

export function getAgentIssues(_req: TransportRequest): TransportResponse {
  return ok(db.get().agentIssues.filter((i) => i.state === "open"));
}

export function postAgentIssueAction(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.agentIssues.findIndex((i) => i.id === id);
  if (idx === -1) return err(404, "not found");
  const body = (req.body ?? {}) as { action: "renew" | "run" | "open" };
  if (body.action === "open") return ok(state.agentIssues[idx]);
  // A4R5-06, A4R6-02: the verb writes TWO records — the issue and the security
  // check it names — so what THIS press overwrote is kept for its undo, with
  // the time. Every press takes its own: the undo of a second press puts back
  // what the second press found, not what the first found eleven seconds and
  // one closed window earlier.
  const cIdx = state.agentIssues[idx].checkId ? state.securityChecks.findIndex((c) => c.id === state.agentIssues[idx].checkId) : -1;
  const found = { issue: state.agentIssues[idx], check: cIdx === -1 ? undefined : state.securityChecks[cIdx] };
  state.agentIssues[idx] = { ...state.agentIssues[idx], state: "done" };
  if (cIdx !== -1) state.securityChecks[cIdx] = { ...state.securityChecks[cIdx], ok: true, status: "passed", lastRun: db.now().toISOString() };
  state.issueUndo[id] = { at: db.now().getTime(), ...found, wrote: { issue: state.agentIssues[idx], check: cIdx === -1 ? undefined : state.securityChecks[cIdx] } };
  return ok(state.agentIssues[idx]);
}

/** A4R8-01's class: the two records still say what the press wrote */
function stillAsWritten(wrote: { issue: AgentIssue; check?: SecurityCheck }, issue: AgentIssue, check: SecurityCheck | undefined): boolean {
  if (issue.state !== wrote.issue.state) return false;
  if (wrote.check == null) return true;
  return check != null && check.ok === wrote.check.ok && check.status === wrote.check.status && check.lastRun === wrote.check.lastRun;
}

/** AG-04's 10s undo on Renew/Run now — mirrors the same mock-only-addition
 * pattern as `undoMemoryProposal` (A-26): CONTRACT_v2.md has no undo route
 * for agent issues either, but the row leaving needs to be recoverable.
 *
 * A4R5-06: it puts back EVERYTHING the verb wrote. It reopened the issue and
 * left its check reading "passed · ran just now" beside it — a pinned security
 * card describing a run that was undone. */
export function undoAgentIssueAction(_req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.agentIssues.findIndex((i) => i.id === id);
  if (idx === -1) return err(404, "not found");
  // A4R6-02: nothing to undo is a 409, as it is for a decision card — never a
  // guess at "open", which reopened an issue that was done before the press
  const before = state.issueUndo[id];
  delete state.issueUndo[id];
  if (before == null || db.now().getTime() - before.at > UNDO_WINDOW_MS) return err(409, "nothing to undo (or the window has closed)");
  const cIdx = before.check == null ? -1 : state.securityChecks.findIndex((c) => c.id === before.check?.id);
  // A4R8-01's class: both records back, or neither — a check that has run again
  // since the press describes a run that happened, and is not this undo's to erase
  if (!stillAsWritten(before.wrote, state.agentIssues[idx], cIdx === -1 ? undefined : state.securityChecks[cIdx])) {
    return err(409, "changed since the press, so there is nothing of this press's to take back");
  }
  state.agentIssues[idx] = { ...state.agentIssues[idx], state: before.issue.state };
  if (before.check != null && cIdx !== -1) state.securityChecks[cIdx] = before.check;
  return ok(state.agentIssues[idx]);
}

export function getAgentFeed(req: TransportRequest): TransportResponse {
  const hours = Number(req.query?.hours ?? "24");
  const since = new Date(db.now().getTime() - hours * 3_600_000);
  return ok(db.get().feed.filter((f) => new Date(f.at) >= since));
}

export function getSecurityChecks(_req: TransportRequest): TransportResponse {
  // B-18/B-27's lesson: postSecurityCheckRun/postAgentIssueAction mutate
  // an element of this array in place — always hand back a fresh array
  // so zustand's re-render fires even when nothing else in the same
  // load() call happens to get a new reference too.
  return ok([...db.get().securityChecks]);
}

export function postSecurityCheckRun(_req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.securityChecks.findIndex((c) => c.id === id);
  if (idx === -1) return err(404, "not found");
  state.securityChecks[idx] = { ...state.securityChecks[idx], ok: true, status: "passed", lastRun: db.now().toISOString() };
  return ok(state.securityChecks[idx]);
}

export function getAgentRuns(req: TransportRequest): TransportResponse {
  let rows = runsWithCost();
  if (req.query?.agent) rows = rows.filter((r) => r.agent === req.query!.agent);
  if (req.query?.day) rows = rows.filter((r) => dayKey(new Date(r.at)) === req.query!.day);
  return ok(rows);
}
