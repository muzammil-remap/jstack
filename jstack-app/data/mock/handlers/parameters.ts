/**
 * §4.14 — the parameter registry (ADR-41, L-1).
 *
 * Three routes and one rule: **the range the app publishes is the range the
 * server enforces**. `GET /parameters` hands back the definition with the
 * value, so a control can render its own bounds from the record it already
 * has, and a `PUT` outside those bounds is a `422 { field: "value" }` — the
 * same shape §4.10's section validator uses, so the app's one error path
 * serves both.
 *
 * The EA never writes here. `POST /parameters/propose` raises a decision card
 * and nothing else changes; approving the card is what applies the value, in
 * `handlers/decisions.ts`, through the undo ledger every other card uses. That
 * asymmetry is the point of the row: an agent that can quietly lengthen the
 * lock timeout is an agent that can quietly unlock the phone.
 */
import * as db from "@/data/mock/db";
import type { AnswerEffect } from "@/data/mock/db";
import { proposalCard } from "@/data/mock/cards";
import { parameterDef } from "@/data/parameters";
import { created, err, ok } from "@/data/mock/util";
import type { Parameter, ParameterProposeBody, ParameterValueBody } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

/**
 * The one validator, used by BOTH writes — `PUT` and `propose` — so a value
 * the EA may not propose is exactly a value Josh's own control would refuse.
 * Two copies of a range is two ranges (rule 16).
 */
function rangeError(record: Parameter, value: unknown): string | null {
  if (record.unit === "boolean") {
    return typeof value === "boolean" ? null : "this parameter is on or off";
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return `${record.label} is a number of ${record.unit}`;
  if (!Number.isInteger(value)) return `${record.label} is a whole number of ${record.unit}`;
  if (value < record.min! || value > record.max!) return `${record.label} must be between ${record.min} and ${record.max} ${record.unit}`;
  return null;
}

export function getParameters(_req: TransportRequest): TransportResponse {
  return ok(db.get().parameters);
}

export function putParameter(req: TransportRequest, key: string): TransportResponse {
  const state = db.get();
  const idx = state.parameters.findIndex((p) => p.key === key);
  // 404 rather than creating one: the table is the registry, and a server
  // that accepted `PUT /parameters/anything` would make it a suggestion.
  if (idx === -1 || parameterDef(key) == null) return err(404, "no such parameter");

  const { value } = (req.body ?? {}) as ParameterValueBody;
  const reason = rangeError(state.parameters[idx], value);
  if (reason != null) return err(422, reason, { field: "value" });

  state.parameters[idx] = { ...state.parameters[idx], value };
  // a value Josh has now set is not a value he refused — the EA may ask again
  delete state.parameters[idx].refused;
  state.parameters = [...state.parameters];
  return ok(state.parameters[idx]);
}

export function proposeParameter(req: TransportRequest): TransportResponse {
  const state = db.get();
  const now = db.now();
  const body = (req.body ?? {}) as ParameterProposeBody;

  const record = state.parameters.find((p) => p.key === body.key);
  if (record == null) return err(404, "no such parameter");
  if (record.changeable !== "josh-or-ea-proposal") return err(422, "this parameter is Josh's alone", { field: "key" });
  if (typeof body.reason !== "string" || body.reason.trim() === "") return err(422, "a proposal needs a reason", { field: "reason" });

  // refused at the door, not at approval: a card Josh cannot approve is a
  // card that wastes the one thing the flow is spending, which is his attention
  const bad = rangeError(record, body.value);
  if (bad != null) return err(422, bad, { field: "value" });

  // the shared shape — open, rank 3, 5pm on the third day, the " · then"
  // `shortExpiry` splits on, the fail-closed labels — is `proposalCard`'s (F-04)
  const card = proposalCard(
    {
      id: `param-${record.key}-${now.getTime()}`,
      type: "Parameter",
      kind: "parameter",
      title: `${record.label}: ${String(record.value)} → ${String(body.value)}`,
      parameter: { key: record.key, label: record.label, current: record.value, proposed: body.value, reason: body.reason },
      why: body.reason,
      sources: [{ label: "your EA", ref: `parameter:${record.key}` }],
      silence: "silence leaves the setting as it is",
      toast: `Changed · ${record.label}`,
      receipt: { cost: 0.01, model: "haiku", sources: 1, seconds: 3 },
    },
    now,
  );
  state.actions = [...state.actions.filter((a) => a.id !== card.id), card];
  return created(card);
}

/**
 * Applied by `handlers/decisions.ts` when a parameter card is answered — here
 * rather than there because the range and the record belong to this file, and
 * because `postAction` should not know how a parameter is stored (it already
 * knows too much about sections).
 */
export function applyParameterVerb(verb: string, proposal: { key: string; proposed: number | boolean }, at: Date): AnswerEffect | undefined {
  const state = db.get();
  const idx = state.parameters.findIndex((p) => p.key === proposal.key);
  if (idx === -1) return undefined;
  // A4R6-03: the record as THIS answer found it — what its undo puts back
  const before = state.parameters[idx];
  if (verb === "approve") {
    state.parameters[idx] = { ...before, value: proposal.proposed };
    delete state.parameters[idx].refused;
  } else if (verb === "never") {
    // the EA can read its own refusal and stop asking every Monday
    state.parameters[idx] = { ...before, refused: { value: proposal.proposed, at: at.toISOString() } };
  } else {
    return undefined; // later/revise/teach leave the setting exactly as it is — so there is nothing to undo
  }
  state.parameters = [...state.parameters];
  return { parameter: before, wrote: state.parameters[idx] };
}

/**
 * The undo path (A4R6-03): put back the record the answer overwrote — its value
 * AND its refusal, exactly. It used to write the value from when the card was
 * PROPOSED, for every verb: an Undo on "Later" moved a lock Josh had set to 5
 * back to 10, and one Undo took back two approvals on the same key.
 */
export function restoreParameter(before: Parameter, wrote?: Parameter): void {
  const state = db.get();
  const idx = state.parameters.findIndex((p) => p.key === before.key);
  if (idx === -1) return;
  // A4R7-03: only while the record still holds what the answer WROTE — a value
  // Josh chose after answering is his, and a reopen or an Undo does not take it
  const now = state.parameters[idx];
  if (wrote != null && (now.value !== wrote.value || now.refused?.value !== wrote.refused?.value)) return;
  state.parameters[idx] = before;
  state.parameters = [...state.parameters];
}
