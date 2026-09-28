/**
 * §4.3 Decisions (ADR-13). Owns the §7 semantics BUILD_PLAN_v2.md §5's
 * mutation seams pin down: rank + cap 5, expiry → thenWhat, and the 10s
 * undo window → 409 after.
 */
import * as db from "@/data/mock/db";
import { emitServerEvent } from "@/data/mock/events";
import type { AnswerEffect, UndoEntry } from "@/data/mock/db";
import { applyParameterVerb, restoreParameter } from "@/data/mock/handlers/parameters";
import { applySectionVerb } from "@/data/mock/handlers/sections";
import { applyRuleVerb, removeAnsweredRules } from "@/data/mock/handlers/settings";
import { applyTriageVerb } from "@/data/mock/ingest";
import { err, inFocus, ok } from "@/data/mock/util";
import type { ActionHistoryEntry, ActionItem, ActionKind, ActionVerb } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

export const UNDO_WINDOW_MS = 10_000;

/** F-05 (P-11): the verb switch as a table — five cases that differed by the
 * target state and one field (`later` sets `laterUntil`, `approve` carries the
 * option). A sixth verb is a type error here, not a fall-through. */
const NEXT_STATE: Record<ActionVerb, ActionItem["state"]> = { approve: "answered", revise: "answered", later: "later", never: "answered", teach: "answered" };

/** F-06 (P-11): what a verb does to the record a card is ABOUT, one effect per
 * kind in the module that owns the kind. `quote` is answered above (approving
 * a quote never sends); `opts` and `bill` have no side effect. */
const KIND_EFFECTS: Partial<Record<ActionKind, (action: ActionItem, verb: ActionVerb, now: Date) => AnswerEffect | undefined | void>> = {
  triage: applyTriageVerb,
  section: applySectionVerb,
  rule: applyRuleVerb,
  parameter: (action, verb, now) => applyParameterVerb(verb, action.parameter!, now),
};
/**
 * The other half of `KIND_EFFECTS`: how each kind's effect is TAKEN BACK.
 *
 * A table rather than a run of `if`s, and it is keyed by the same `ActionKind`
 * for one reason — the set-equality case in `tests/unit/sections.test.ts`
 * asserts these two tables have the same keys, so a kind that gains an effect
 * and no revert is a red test rather than a discovery three audit rounds later.
 *
 * That guard exists because the class has now been found three times: the
 * client held an undone lock timeout until a reload (B-174), the server left a
 * standing `mode: "auto"` autonomy rule in force for good after Undo (B-183),
 * and only `section` had ever been driven through Approve → Undo at all. An
 * Undo that does not undo is worse than no Undo; on the surfaces that grant an
 * agent authority to act without asking, it is a security question.
 *
 * A4R6-01/03: a revert takes back what the ANSWER WROTE, which the effect
 * recorded on the ledger entry (`AnswerEffect`) — never what the card's kind
 * suggests. Reverting by kind wrote the proposal-time value for a Later that
 * had written nothing, and one Undo took back two approvals on one key.
 */
const UNDO_EFFECTS: Partial<Record<ActionKind, (entry: UndoEntry, now: Date) => void>> = {
  // CB-06: the card returns to Needs you, so the SECTION must return too, or
  // the tab keeps the change the card announced.
  section: (entry, now) => {
    const proposal = entry.snapshot.section;
    if (proposal == null) return;
    const state = db.get();
    state.sections = state.sections.map((sec) => (sec.id === proposal.id ? { ...sec, state: proposal.state, changedAt: now.toISOString() } : sec));
  },
  // the record exactly as this answer found it — value and refusal
  parameter: (entry) => {
    if (entry.effect?.parameter != null) restoreParameter(entry.effect.parameter, entry.effect.wrote);
  },
  // A4R2-02: the rules this answer appended — a rule card's (`applyRuleVerb`) or
  // one taught from a triage card (`applyTriageVerb`) — and A4R8-01: only while
  // each still says what the answer wrote; a rule Josh rewrote since is his
  rule: (entry) => removeAnsweredRules(entry.effect),
  triage: (entry) => removeAnsweredRules(entry.effect),
};

/** the LATEST ledger entry for a card — a card answered, reopened and answered
 *  again has two, and the first one's window closed long ago (A4R6-01) */
function lastEntryIndex(id: string): number {
  return db.get().undoLedger.map((e) => e.actionId).lastIndexOf(id);
}

export const OPEN_CARD_CAP = 5;

/** the two tables' keys, for the guard that keeps them equal */
export const EFFECT_KINDS = Object.keys(KIND_EFFECTS).sort();
export const UNDO_KINDS = Object.keys(UNDO_EFFECTS).sort();

/** Applies each open card's `thenWhat` once its `expiresAt` has passed:
 * `opts` auto-approves the recommended option; `quote`/`bill` cards leave
 * their draft/reminder state as-is but stop counting as "open" so they
 * drop out of Needs you (kept, retrievable, just no longer actionable). */
function applyExpiry(action: ActionItem, now: Date): ActionItem {
  if (action.state !== "open") return action;
  if (new Date(action.expiresAt).getTime() > now.getTime()) return action;
  if (action.kind === "opts" && action.recommended != null) {
    return {
      ...action,
      state: "answered",
      history: [...action.history, { verb: "approve", option: action.recommended, at: now.toISOString(), via: "expiry" }],
    };
  }
  return { ...action, state: "expired" };
}

function withExpiryApplied(): void {
  const state = db.get();
  const now = db.now();
  const before = state.actions;
  state.actions = before.map((a) => applyExpiry(a, now));
  // D-1: an expiry is the server changing a card without the person doing
  // anything, which is exactly what the event stream is for. Emitted only
  // when something ACTUALLY expired — a subscriber that refetches on every
  // read of the list would be a refetch loop.
  const expired = state.actions.filter((a, i) => a.state !== before[i].state).map((a) => a.id);
  if (expired.length > 0) emitServerEvent({ kind: "actions", ids: expired, at: now.toISOString() });
}

export function getActions(req: TransportRequest): TransportResponse {
  withExpiryApplied();
  const { actions } = db.get();
  const openOrHistory = req.query?.state === "history" ? "history" : "open";
  const focus = req.query?.focus;
  const q = req.query?.q?.toLowerCase();

  if (openOrHistory === "open") {
    let rows = actions.filter((a) => a.state === "open");
    rows = inFocus(rows, focus);
    rows = [...rows].sort((a, b) => a.rank - b.rank).slice(0, OPEN_CARD_CAP);
    return ok(rows);
  }
  let rows = actions.filter((a) => a.state !== "open");
  rows = inFocus(rows, focus);
  if (q) rows = rows.filter((a) => a.title.toLowerCase().includes(q));
  return ok([...rows].sort((a, b) => new Date(b.setAt).getTime() - new Date(a.setAt).getTime()));
}

export function getAction(_req: TransportRequest, id: string): TransportResponse {
  withExpiryApplied();
  const action = db.get().actions.find((a) => a.id === id);
  return action ? ok(action) : err(404, "not found");
}

export function postActionVerb(req: TransportRequest, id: string): TransportResponse {
  withExpiryApplied();
  const state = db.get();
  const idx = state.actions.findIndex((a) => a.id === id);
  if (idx === -1) return err(404, "not found");
  const action = state.actions[idx];
  if (action.state !== "open") return err(409, "already answered");

  const body = (req.body ?? {}) as { verb: string; option?: 1 | 2 | 3; until?: string; revision?: string; rule?: string };
  const now = db.now();

  if (action.kind === "quote" && body.verb === "approve") {
    // v1.2 kept: approving a quote card never sends — it lands in the
    // outbox for Josh to send himself.
    const answered: ActionItem = { ...action, state: "answered", history: [...action.history, { verb: "approve", at: now.toISOString(), via: "app" }] };
    state.undoLedger.push({ actionId: id, answeredAt: now.getTime(), snapshot: action });
    state.actions[idx] = answered;
    return ok({ status: "outbox_user_sends" });
  }

  const verb = body.verb as ActionVerb;
  if (!(verb in NEXT_STATE)) return err(422, "unknown verb", { field: "verb" });
  const at = now.toISOString();
  const entry: ActionHistoryEntry = verb === "approve" ? { verb, option: body.option, at, via: "app" } : { verb, at, via: "app" };
  const next: ActionItem = {
    ...action,
    state: NEXT_STATE[verb],
    history: [...action.history, entry],
    ...(verb === "later" ? { laterUntil: body.until ?? new Date(now.getTime() + 3 * 86_400_000).toISOString() } : {}),
  };

  // what the verb does to the record the card is ABOUT — owned by the module
  // that owns the kind (F-06); opts, quote and bill have no side effect
  const effect = KIND_EFFECTS[action.kind]?.(action, verb, now) ?? undefined;
  state.undoLedger.push({ actionId: id, answeredAt: now.getTime(), snapshot: action, effect });
  state.actions[idx] = next;
  return ok(next);
}

/** AG-09: Agents' Decision history "reopen" — the CURRENT record goes back to
 * `open` (mock-only addition, A-31; `CONTRACT_v22.md` §7).
 *
 * A4R6-01: and what the answer DID goes back with it. The card's history
 * records the reopen as `undone`, so an effect left standing was a record
 * that said undone beside a rule, or a longer lock, that still held — and
 * answering again appended the same rule a second time. The window does not
 * apply: a reopen is a deliberate act from the history, not a slip. */
export function postActionReopen(_req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const now = db.now();
  const idx = state.actions.findIndex((a) => a.id === id);
  if (idx === -1) return err(404, "not found");
  const action = state.actions[idx];
  const entryIdx = lastEntryIndex(id);
  if (entryIdx !== -1) {
    const entry = state.undoLedger[entryIdx];
    UNDO_EFFECTS[entry.snapshot.kind]?.(entry, now);
    state.undoLedger.splice(entryIdx, 1);
  }
  state.actions[idx] = { ...action, state: "open", laterUntil: undefined, history: [...action.history, { verb: "undone", at: now.toISOString(), via: "app" }] };
  return ok(state.actions[idx]);
}

export function postActionUndo(_req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const now = db.now();
  const entryIdx = lastEntryIndex(id);
  if (entryIdx === -1) return err(409, "no undo entry (or already undone)");
  const entry = state.undoLedger[entryIdx];
  if (now.getTime() - entry.answeredAt > UNDO_WINDOW_MS) {
    state.undoLedger.splice(entryIdx, 1);
    return err(409, "undo window expired");
  }
  const idx = state.actions.findIndex((a) => a.id === id);
  const restored: ActionItem = { ...entry.snapshot, state: "open", history: [...entry.snapshot.history, { verb: "undone" as const, at: now.toISOString(), via: "app" as const }] };

  UNDO_EFFECTS[entry.snapshot.kind]?.(entry, now);

  state.actions[idx] = restored;
  state.undoLedger.splice(entryIdx, 1);
  return ok(restored);
}

export function putActionDraft(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.actions.findIndex((a) => a.id === id);
  if (idx === -1) return err(404, "not found");
  const body = (req.body ?? {}) as { subject?: string; body: string };
  state.actions[idx] = { ...state.actions[idx], quote: body.body };
  return ok(state.actions[idx]);
}

export function postInsightAction(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.insights.findIndex((i) => i.id === id);
  if (idx === -1) return err(404, "not found");
  const body = (req.body ?? {}) as { action: "block" | "leave" };
  // TD-03: the collapsed result line is this fixture's own copy (mock v11
  // `today()` line 460), not a generic template — there is one insight in
  // Stage 1 scope (BUGLOG_v2.md A-18).
  const result =
    body.action === "block" ? "Blocked 9 to 12 tomorrow. The EA will hold it." : "Left open. The EA will not ask again this week.";
  state.insights[idx] = { ...state.insights[idx], state: "done", result };
  return ok(state.insights[idx]);
}
