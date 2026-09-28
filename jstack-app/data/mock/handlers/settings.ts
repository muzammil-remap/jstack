/** §4.9 Settings and configuration. */
import * as db from "@/data/mock/db";
import type { AnswerEffect } from "@/data/mock/db";
import { proposalCard } from "@/data/mock/cards";
import { emitServerEvent } from "@/data/mock/events";
import { err, ok } from "@/data/mock/util";
import { SILO_META, TYPE_META } from "@/data/labels";
import type { ActionItem, AppLayout, AutonomyRule, AutonomyRuleList, AutonomySettings, Focus, Layout, QuietHours, SyncStatus, VoiceSettings } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

/** ADR-01: sections that cannot hide, by tab. */
const PINNED: Record<string, string[]> = {
  today: ["needs"],
  agents: ["needseyes", "checks", "lock"],
};

export function getNotificationGroups(_req: TransportRequest): TransportResponse {
  // Same B-18/B-27 lesson: putNotificationGroup mutates an element in
  // place, so this must hand back a fresh array every time.
  return ok([...db.get().notificationGroups]);
}

export function putNotificationGroup(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.notificationGroups.findIndex((g) => g.id === id);
  if (idx === -1) return err(404, "not found");
  if (state.notificationGroups[idx].locked) return err(423, "security notifications are always on, by design");
  const body = (req.body ?? {}) as { devices: Record<string, boolean> };
  state.notificationGroups[idx] = { ...state.notificationGroups[idx], devices: { ...state.notificationGroups[idx].devices, ...body.devices } };
  return ok(state.notificationGroups[idx]);
}

export function getQuietHours(_req: TransportRequest): TransportResponse {
  return ok(db.get().quietHours);
}

export function putQuietHours(req: TransportRequest): TransportResponse {
  const state = db.get();
  state.quietHours = req.body as QuietHours;
  return ok(state.quietHours);
}

export function getSchedules(_req: TransportRequest): TransportResponse {
  // B-18's lesson generalised: state.schedules[idx] mutation below keeps
  // the SAME array reference — a bare return here means zustand's set()
  // sees no change and skips the re-render even though a row's `paused`
  // genuinely flipped. Always hand back a fresh array.
  return ok([...db.get().schedules]);
}

function setSchedulePaused(id: string, paused: boolean): TransportResponse {
  const state = db.get();
  const idx = state.schedules.findIndex((s) => s.id === id);
  if (idx === -1) return err(404, "not found");
  state.schedules[idx] = { ...state.schedules[idx], paused };
  return ok(state.schedules[idx]);
}

export function postScheduleRun(_req: TransportRequest, id: string): TransportResponse {
  const s = db.get().schedules.find((s) => s.id === id);
  return s ? ok(s) : err(404, "not found");
}
export function postSchedulePause(_req: TransportRequest, id: string): TransportResponse {
  return setSchedulePaused(id, true);
}
export function postScheduleResume(_req: TransportRequest, id: string): TransportResponse {
  return setSchedulePaused(id, false);
}

export function getAutonomy(_req: TransportRequest): TransportResponse {
  return ok(db.get().autonomy);
}
export function putAutonomy(req: TransportRequest): TransportResponse {
  const state = db.get();
  state.autonomy = req.body as AutonomySettings;
  return ok(state.autonomy);
}

export function getVoiceSettings(_req: TransportRequest): TransportResponse {
  return ok(db.get().voiceSettings);
}
export function putVoiceSettings(req: TransportRequest): TransportResponse {
  const state = db.get();
  state.voiceSettings = req.body as VoiceSettings;
  return ok(state.voiceSettings);
}

export function getFocuses(_req: TransportRequest): TransportResponse {
  return ok(db.get().focuses);
}
export function putFocuses(req: TransportRequest): TransportResponse {
  const state = db.get();
  const body = (req.body ?? {}) as { focuses: Focus[] };
  state.focuses = body.focuses;
  return ok(state.focuses);
}

export function getLayout(_req: TransportRequest, tab: string): TransportResponse {
  const layout = db.get().layouts[tab];
  return layout ? ok(layout) : err(404, "not found");
}

export function putLayout(req: TransportRequest, tab: string): TransportResponse {
  const state = db.get();
  const current = state.layouts[tab];
  if (!current) return err(404, "not found");
  const body = (req.body ?? {}) as Partial<Layout>;
  const hidden = body.hidden ?? current.hidden;
  const pinnedHidden = (PINNED[tab] ?? []).filter((id) => hidden.includes(id));
  if (pinnedHidden.length > 0) return err(422, `cannot hide pinned section(s): ${pinnedHidden.join(", ")}`, { field: "hidden" });
  state.layouts[tab] = { ...current, ...body, managedBy: "josh", changedAt: db.now().toISOString() };
  return ok(state.layouts[tab]);
}

export function revertLayout(_req: TransportRequest, tab: string): TransportResponse {
  const state = db.get();
  const original = state.layoutsOriginal[tab];
  if (!state.layouts[tab] || !original) return err(404, "not found");
  // B-33: restore FROM the pristine snapshot, not from `current` with
  // managedBy/reason merely stripped — that kept whatever order/hidden
  // the last edit (Josh's or the EA's) left behind, so AR-05's "Revert
  // to yesterday" never actually undid anything.
  state.layouts[tab] = { ...original, managedBy: "josh", reason: undefined, changedAt: db.now().toISOString() };
  return ok(state.layouts[tab]);
}

export function postLayoutEa(req: TransportRequest, tab: string): TransportResponse {
  const state = db.get();
  const current = state.layouts[tab];
  if (!current) return err(404, "not found");
  const body = (req.body ?? {}) as { order?: string[]; hidden?: string[]; reason?: string };
  if (!body.reason || body.reason.trim() === "") return err(422, "an EA layout proposal needs a reason", { field: "reason" });
  const hidden = body.hidden ?? current.hidden;
  // AR-06: an EA proposal can add hides but never remove one Josh already
  // made — B-31, this was unenforced until row 17.
  const reshown = current.hidden.filter((id) => !hidden.includes(id));
  if (reshown.length > 0) return err(422, `cannot re-show section(s) hidden by Josh: ${reshown.join(", ")}`, { field: "hidden" });
  const pinnedHidden = (PINNED[tab] ?? []).filter((id) => hidden.includes(id));
  if (pinnedHidden.length > 0) return err(422, `cannot hide pinned section(s): ${pinnedHidden.join(", ")}`, { field: "hidden" });
  state.layouts[tab] = { tab, order: body.order ?? current.order, hidden, managedBy: "ea", reason: body.reason, changedAt: db.now().toISOString() };
  return ok(state.layouts[tab]);
}

export function getAppLayout(_req: TransportRequest): TransportResponse {
  return ok(db.get().appLayout);
}
export function putAppLayout(req: TransportRequest): TransportResponse {
  const state = db.get();
  state.appLayout = { ...state.appLayout, ...(req.body as Partial<AppLayout>) };
  return ok(state.appLayout);
}

export function getCapabilities(_req: TransportRequest): TransportResponse {
  return ok(db.get().capabilities);
}

export function postExport(_req: TransportRequest): TransportResponse {
  return ok({ jobId: `export-${Date.now()}` });
}

export function getLabelsScheme(_req: TransportRequest): TransportResponse {
  return ok({ silos: SILO_META, types: TYPE_META });
}

export function getLabelAudit(_req: TransportRequest): TransportResponse {
  return ok([]);
}

/**
 * §4.12: the SERVER's view of this device's sync (O-1). The client keeps its
 * own queue — it has to, the whole point is that the server is unreachable —
 * so this is not the queue itself: it is what the server has already applied
 * and when it last heard from us. Settings › Sync shows the client's numbers
 * beside these, and a disagreement between them is worth seeing.
 */
export function getSyncStatus(_req: TransportRequest): TransportResponse {
  const state = db.get();
  return ok<SyncStatus>({
    queued: 0,
    lastSyncAt: state.seenAt,
    conflicts: [],
  });
}

/**
 * §4.23 (W-1) — the standing instructions. `PUT` replaces the whole list, as
 * `/slicers` does: a rule set is small and edited as a set, and a per-rule
 * route would need an ordering the list already carries.
 */
/** Every scope a rule may name: `all`, or one card kind. A value rather than a
 * type-only union, so the route can refuse one it has never heard of instead
 * of storing it and failing somewhere later (hard rule 17). */
const RULE_SCOPES: AutonomyRule["scope"][] = ["all", "opts", "quote", "bill", "section", "parameter", "triage", "rule"];

export function getAutonomyRules(): TransportResponse {
  return ok<AutonomyRuleList>({ rules: db.get().autonomyRules });
}

export function putAutonomyRules(req: TransportRequest): TransportResponse {
  const body = (req.body ?? {}) as { rules?: AutonomyRule[] };
  if (!Array.isArray(body.rules)) return err(422, "rules must be a list", { field: "rules" });
  for (const r of body.rules) {
    if (typeof r?.id !== "string" || typeof r?.text !== "string" || r.text.trim() === "") {
      return err(422, "every rule needs an id and something to say", { field: "rules" });
    }
    if (!RULE_SCOPES.includes(r.scope)) return err(422, "no such scope", { field: "scope" });
    if (r.mode !== "auto" && r.mode !== "ask") return err(422, "a rule is either auto or ask", { field: "mode" });
  }
  // A4R4-04: one rule, one id, and the ROUTE is what guarantees it — the same
  // shape `putHabits` uses to refuse a list with a habit missing from it.
  // Two writers derived an id from the same card: `applyTriageVerb` mints
  // `ar-${card.id}` when a triage card is answered `teach`, and the Teach
  // sheet minted `ar-${from}` for the sentence the person then typed. Two
  // different rules, one id — `Rules.tsx` keys by it, so one of the pair could
  // be neither edited nor deleted, and undoing the card took the person's own
  // sentence with it.
  const seen = new Set<string>();
  for (const r of body.rules) {
    if (seen.has(r.id)) return err(422, `two rules share the id ${r.id}`, { field: "rules" });
    seen.add(r.id);
  }
  db.get().autonomyRules = body.rules;
  return ok<AutonomyRuleList>({ rules: db.get().autonomyRules });
}

/**
 * ST-03 — the EA asks whether something it keeps being told should become
 * standing.
 *
 * A real backend raises this when it notices the pattern; the mock needs a
 * lever so the card can be driven, and this is it. The card carries the RULE IT
 * WOULD WRITE, in the words it would write it — Approve appends exactly that
 * text, so what was agreed to and what was stored cannot differ. The evidence
 * is on the card too: a proposal that says only "shall I?" is asking you to
 * take its word for the pattern.
 *
 * `POST /actions/{id}` already carries `approve` and `never` for every card
 * kind; the append happens THERE (`handlers/decisions.ts`), beside every other
 * verb, rather than here — a second place that answers a card is a second
 * grammar for answering one (A-11).
 */
/**
 * §4.23 (ST-1, ST-03): a rule card's verb is the ONLY thing that makes a
 * proposed rule standing. Approve appends EXACTLY the text the card showed,
 * `on: true` — so what was agreed to and what was stored cannot differ, which
 * is the whole reason the proposal carries its own wording rather than a
 * description of one. Never records the refusal in the history and writes
 * nothing; Later and Revise leave it proposed. `addedBy: "josh"` because he
 * answered the card — a rule the EA wrote for itself is a different thing
 * and would say so (ST-04). Applied by `handlers/decisions.ts` through its
 * `KIND_EFFECTS` table (F-06, P-11).
 */
export function applyRuleVerb(action: ActionItem, verb: string, now: Date): AnswerEffect | undefined {
  if (action.rule == null || verb !== "approve") return undefined;
  return writeAnsweredRule({ id: `ar-${action.id}`, text: action.rule.text, scope: action.rule.scope, mode: action.rule.mode, on: true, addedBy: "josh", addedAt: now.toISOString() });
}

/** A4R8-01: what a person can change on a rule — "still as the answer wrote it" compares these */
function sameRule(a: AutonomyRule, b: AutonomyRule): boolean {
  return a.text === b.text && a.scope === b.scope && a.mode === b.mode && a.on === b.on;
}

/**
 * A card's answer writes ONE rule, under the card's own id (A4R6-01: a card
 * reopened and answered again had appended a second rule under the same id,
 * and every rules save after it was refused). A4R8-01: if a rule under that id
 * already stands and does NOT say what this answer would write, Josh rewrote
 * it after an earlier answer — his words stand, and this answer writes nothing,
 * so its undo has nothing to take back. Shared by the rule card and the triage
 * card's teach (`data/mock/ingest.ts`).
 */
export function writeAnsweredRule(rule: AutonomyRule): AnswerEffect | undefined {
  const state = db.get();
  const standing = state.autonomyRules.find((r) => r.id === rule.id);
  if (standing != null && !sameRule(standing, rule)) return undefined;
  state.autonomyRules = [...state.autonomyRules.filter((r) => r.id !== rule.id), rule];
  return { rules: [rule.id], wroteRules: [rule] };
}

/**
 * The undo and the reopen of a rule or triage card (A4R8-01): take a rule back
 * only while it still says what the answer wrote. B-217's rule for the
 * parameter kind, for the two kinds that write a standing rule — a reopen had
 * deleted, by id, the sentence Josh rewrote after answering.
 */
export function removeAnsweredRules(effect: AnswerEffect | undefined): void {
  const wrote = effect?.wroteRules ?? [];
  if (wrote.length === 0) return;
  const state = db.get();
  state.autonomyRules = state.autonomyRules.filter((r) => {
    const written = wrote.find((w) => w.id === r.id);
    return written == null || !sameRule(r, written);
  });
}

export function postAutonomyPropose(req: TransportRequest): TransportResponse {
  const state = db.get();
  const body = (req.body ?? {}) as { text?: string };
  const now = db.now();
  const text = body.text?.trim() != null && body.text.trim() !== "" ? body.text.trim() : "File EO invoices under Work · money without asking";

  // the shared shape is `proposalCard`'s (F-04); a rule is about the EA's own
  // behaviour, not about anyone's data, so it carries the fail-closed default
  // silo and no content type — the same reasoning `parameters.ts` records
  const card = proposalCard(
    {
      id: `rule-${now.getTime()}`,
      type: "Rule",
      kind: "rule",
      title: "Make this a standing rule?",
      rule: { text, scope: "all", mode: "auto", why: "four times in a fortnight" },
      why: "You have told me this four times in a fortnight.",
      sources: [{ label: "your EA", ref: "rule:proposed" }],
      silence: "silence leaves things as they are",
      toast: "Rule added",
      focus: "work",
    },
    now,
  );
  state.actions = [card, ...state.actions];
  emitServerEvent({ kind: "actions", ids: [card.id], at: now.toISOString() });
  return ok(card);
}
