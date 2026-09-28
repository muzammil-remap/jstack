/**
 * The Telegram mirror (D-1, TM-01..03) — answering a decision card from
 * somewhere that is not this app.
 *
 * Josh answers cards from Telegram. The app has to behave correctly when a
 * card it is currently showing is answered elsewhere: the card leaves Needs
 * you within a couple of seconds, without a reload, and the history row says
 * where the answer came from. That is the whole point of the server-event
 * stream, and this is the cheapest honest way to drive it in a demo.
 *
 * Mock-only: `POST /__mirror__/telegram`, never in `data/routes.ts` and
 * therefore never in `openapi.yaml` (hard rule 5). A real backend's Telegram
 * bot writes through its own path and emits the same event.
 *
 * TM-03: an answer that arrived via Telegram is NOT undoable in the app. The
 * ten-second window belongs to the surface that took the action — offering
 * undo here would be offering to reverse something the person did somewhere
 * else, possibly minutes ago.
 */
import * as db from "@/data/mock/db";
import { emitServerEvent } from "@/data/mock/events";
import { err, ok } from "@/data/mock/util";
import type { ActionItem, ActionVerb } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

const VERBS: ActionVerb[] = ["approve", "revise", "later", "never", "teach"];

export function postTelegramMirror(req: TransportRequest): TransportResponse {
  const body = (req.body ?? {}) as { actionId?: string; verb?: ActionVerb; option?: 1 | 2 | 3 };
  if (!body.actionId) return err(422, "actionId is required", { field: "actionId" });
  if (body.verb == null || !VERBS.includes(body.verb)) return err(422, "a known verb is required", { field: "verb" });

  const state = db.get();
  const index = state.actions.findIndex((a) => a.id === body.actionId);
  if (index === -1) return err(404, `no card ${body.actionId}`);
  if (state.actions[index].state !== "open") return err(409, "that card has already been answered");

  const now = db.now();
  const answered: ActionItem = {
    ...state.actions[index],
    state: body.verb === "later" ? "later" : "answered",
    history: [
      ...state.actions[index].history,
      { verb: body.verb, option: body.option ?? state.actions[index].recommended, at: now.toISOString(), via: "telegram" },
    ],
  };
  state.actions[index] = answered;

  // the app is not the one that did this, so it has to be told
  emitServerEvent({ kind: "actions", ids: [answered.id], at: now.toISOString() });
  return ok(answered);
}
