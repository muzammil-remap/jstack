/**
 * The Needs-you routes from the actions store, through the `actions` webhook (JSTACK-DASH-actions):
 * the cards the EA writes there (`op: "put"`, never sent from the app), read and answered here with
 * the mock's rules (`data/mock/handlers/decisions.ts`) and the contract's statuses.
 *
 *  - `GET /actions` is the open cards, in focus, by rank, five at most; `?state=history` is the
 *    answered ones, newest first, narrowed by `?q=` in the title — the mock's two lists;
 *  - `POST /actions/{id}` answers a card and `POST /actions/{id}/undo` takes the answer back; the
 *    store keeps the ten-second window, so a late undo, a second answer and an unknown card are the
 *    workflow's `409` and `404`, and a bad body its `VALIDATION_ERROR` (`422`);
 *  - approving an email card (`kind: "quote"`) answers `501` without answering the card: its draft
 *    is the `gmail-draft` key's, which is not wired yet, and "it's in your drafts" would be untrue.
 *
 * A card is the EA's `ActionItem` with the store's state and answer on top. A card the contract
 * could not draw — a required field missing — is left out of the list with one warning naming it,
 * so one bad card cannot empty Needs you; asked for by id, it is this section's 502.
 */
import type { ActionHistoryEntry, ActionItem, ActionKind, ActionState, ActionVerb } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { callWebhook } from "@/data/n8n/client";
import { NOT_CONNECTED } from "@/data/n8n/empty";
import { inFocus } from "@/data/n8n/focus";
import type { Asked } from "@/data/n8n/registry";
import { saveDraftRecord } from "./records";

/** `data/mock/handlers/decisions.ts` `OPEN_CARD_CAP` — the workflow caps at the same five */
const OPEN_CAP = 5;
/** the most the workflow's history list returns */
const HISTORY_LIMIT = 100;

const KINDS: readonly ActionKind[] = ["opts", "quote", "bill", "section", "parameter", "triage", "rule"];
const VERBS: readonly ActionVerb[] = ["approve", "revise", "later", "never", "teach"];
/** the store's three states; `expired` and `undone` are the mock's, which the store does not keep */
const STATES: Record<string, ActionState> = { open: "open", later: "later", answered: "answered" };

const isString = (v: unknown): v is string => typeof v === "string";
const isInstant = (v: unknown): v is string => isString(v) && !Number.isNaN(Date.parse(v));
const isObject = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);
const isOption = (v: unknown) => isObject(v) && isString(v.text) && isString(v.why);
const isSource = (v: unknown) => isObject(v) && isString(v.label) && isString(v.ref);
const isBillLine = (v: unknown) => isObject(v) && isString(v.k) && isString(v.v);

/** Every field `ActionItem` requires that only the EA can write — nothing here is made up for it. */
const REQUIRED: [string, (v: unknown) => boolean][] = [
  ["type", isString],
  ["kind", (v) => KINDS.includes(v as ActionKind)],
  ["title", (v) => isString(v) && v.trim() !== ""],
  ["rank", (v) => typeof v === "number" && Number.isFinite(v)],
  ["why", isString],
  ["expiresAt", isInstant],
  ["thenWhat", isString],
  ["silence", isString],
  ["verb", isString],
  ["toast", isString],
  ["receipt", (v) => isObject(v) && typeof v.cost === "number" && isString(v.model) && typeof v.sources === "number" && typeof v.seconds === "number"],
  ["labels", (v) => isObject(v) && isString(v.silo) && Array.isArray(v.types) && isString(v.setBy)],
  ["setAt", isInstant],
  ["focus", isString],
];
/** Optional, but drawn as they come when present — so they must be what the contract says. */
const OPTIONAL: [string, (v: unknown) => boolean][] = [
  ["options", (v) => Array.isArray(v) && v.length === 3 && v.every(isOption)],
  ["recommended", (v) => v === 1 || v === 2 || v === 3],
  ["sources", (v) => Array.isArray(v) && v.every(isSource)],
  ["quote", isString],
  ["bill", (v) => Array.isArray(v) && v.every(isBillLine)],
  ["sourceUrl", isString],
  ["section", isObject],
  ["triage", isObject],
  ["rule", isObject],
  ["parameter", isObject],
];

/** A reply the section cannot use: the 502 is this section's, never a guess at what was meant. */
class UnexpectedReply extends Error {}

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

function historyEntry(v: unknown): ActionHistoryEntry | null {
  if (!isObject(v) || !isInstant(v.at)) return null;
  const verb = v.verb === "undone" ? "undone" : VERBS.find((known) => known === v.verb);
  if (verb == null) return null;
  const via = v.via === "telegram" || v.via === "expiry" ? v.via : "app";
  return verb === "approve" && (v.option === 1 || v.option === 2 || v.option === 3) ? { verb, option: v.option, at: v.at, via } : { verb, at: v.at, via };
}

/** A card from the store as the contract's `ActionItem`, or why it cannot be one. */
function toCard(raw: unknown): { card: ActionItem } | { missing: string[] } {
  if (!isObject(raw)) return { missing: ["the card"] };
  const missing = [
    ...(isString(raw.id) && raw.id !== "" ? [] : ["id"]),
    ...(isString(raw.state) && STATES[raw.state] != null ? [] : ["state"]),
    ...REQUIRED.filter(([key, ok]) => !ok(raw[key])).map(([key]) => key),
    ...OPTIONAL.filter(([key, ok]) => raw[key] !== undefined && raw[key] !== null && !ok(raw[key])).map(([key]) => key),
  ];
  if (missing.length > 0) return { missing };
  // the EA's own trail, then the store's answer — the mock appends each answer to `history`
  const trail = Array.isArray(raw.history) ? raw.history.map(historyEntry).filter((e): e is ActionHistoryEntry => e != null) : [];
  const answered = historyEntry(raw.answer);
  const pick = <K extends keyof ActionItem>(key: K) => (raw[key] !== undefined && raw[key] !== null ? { [key]: raw[key] as ActionItem[K] } : {});
  const card: ActionItem = {
    id: raw.id as string,
    type: raw.type as string,
    kind: raw.kind as ActionKind,
    title: raw.title as string,
    state: STATES[raw.state as string],
    rank: raw.rank as number,
    ...pick("options"),
    ...pick("recommended"),
    ...pick("quote"),
    ...pick("bill"),
    ...pick("section"),
    ...pick("triage"),
    ...pick("rule"),
    ...pick("parameter"),
    why: raw.why as string,
    sources: (raw.sources as ActionItem["sources"] | undefined) ?? [],
    expiresAt: raw.expiresAt as string,
    thenWhat: raw.thenWhat as string,
    silence: raw.silence as string,
    verb: raw.verb as string,
    toast: raw.toast as string,
    history: answered != null ? [...trail, answered] : trail,
    receipt: raw.receipt as ActionItem["receipt"],
    ...pick("sourceUrl"),
    ...(isInstant(raw.laterUntil) ? { laterUntil: raw.laterUntil } : {}),
    labels: raw.labels as ActionItem["labels"],
    setAt: raw.setAt as string,
    focus: raw.focus as string,
  };
  return { card };
}

const idOf = (raw: unknown) => (isObject(raw) && isString(raw.id) ? raw.id : "(no id)");

/** The cards of a list reply the contract can draw; the rest named once each in the console. */
function cardsOf(data: unknown): ActionItem[] {
  if (!isObject(data) || !Array.isArray(data.items)) throw new UnexpectedReply("no items list");
  return data.items.flatMap((raw) => {
    const made = toCard(raw);
    if ("card" in made) return [made.card];
    warnOnce(`${idOf(raw)} ${made.missing.join(",")}`, `n8n actions: card ${idOf(raw)} is not shown — ${made.missing.join(", ")} missing or not the contract's`);
    return [];
  });
}

/** The one card of a `get`, `answer` or `undo` reply. */
function cardOf(data: unknown): ActionItem {
  const raw = isObject(data) ? data.item : undefined;
  const made = toCard(raw);
  if ("missing" in made) throw new UnexpectedReply(`card ${idOf(raw)}: ${made.missing.join(", ")} missing or not the contract's`);
  return made.card;
}

async function answering(make: () => Promise<TransportResponse>): Promise<TransportResponse> {
  try {
    return await make();
  } catch (error) {
    if (error instanceof UnexpectedReply) return { status: 502, json: { reason: `the actions store answered in an unexpected shape: ${error.message}` } };
    throw error;
  }
}

/** `data/mock/handlers/decisions.ts` `getActions`: open by rank and capped, or history newest first */
function listFor(cards: ActionItem[], asked: Asked): ActionItem[] {
  const q = asked.req.query;
  const inView = inFocus(cards, q?.focus);
  if (q?.state !== "history") return [...inView].sort((a, b) => a.rank - b.rank).slice(0, OPEN_CAP);
  const words = q.q?.toLowerCase();
  const found = words ? inView.filter((a) => a.title.toLowerCase().includes(words)) : inView;
  return [...found].sort((a, b) => Date.parse(b.setAt) - Date.parse(a.setAt));
}

const listBody = (asked: Asked) => (asked.req.query?.state === "history" ? { op: "list", state: "history", limit: HISTORY_LIMIT } : { op: "list", state: "open" });

/** The answer the app sends, in the workflow's words: only the fields the verb carries. */
function answerBody(id: string, body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { op: "answer", id, verb: body.verb };
  for (const key of ["option", "revision", "rule", "until"] as const) if (body[key] !== undefined && body[key] !== null) out[key] = body[key];
  return out;
}

export const actionsAnswers = {
  /** `GET /actions` — also what the Today composite's Needs you is */
  list: (asked: Asked) => answering(async () => ({ status: 200, json: listFor(cardsOf(await callWebhook("actions", listBody(asked))), asked) })),
  byId: (asked: Asked) => answering(async () => ({ status: 200, json: cardOf(await callWebhook("actions", { op: "get", id: asked.params[0] })) })),
  answer: (asked: Asked) =>
    answering(async () => {
      const id = asked.params[0];
      const body = isObject(asked.req.body) ? asked.req.body : {};
      if (body.verb === "approve") {
        // the email card's draft is `gmail-draft`'s (not wired yet): refused before the card is touched
        const current = await callWebhook("actions", { op: "get", id });
        if (isObject(current) && isObject(current.item) && current.item.kind === "quote") return NOT_CONNECTED;
      }
      return { status: 200, json: cardOf(await callWebhook("actions", answerBody(id, body), { write: true })) };
    }),
  undo: (asked: Asked) => answering(async () => ({ status: 200, json: cardOf(await callWebhook("actions", { op: "undo", id: asked.params[0] }, { write: true })) })),
  /** `PUT /actions/{id}/draft` (the mock sets the card's quote): kept as a record; the answer is the card with it */
  draft: (asked: Asked) =>
    answering(async () => {
      const id = asked.params[0];
      const card = cardOf(await callWebhook("actions", { op: "get", id }));
      const body = isObject(asked.req.body) ? asked.req.body : {};
      if (typeof body.body !== "string") return { status: 422, json: { reason: "a draft needs its text", field: "body" } };
      const saved = await saveDraftRecord(id, { ...(typeof body.subject === "string" ? { subject: body.subject } : {}), body: body.body });
      return saved.status === 200 ? { status: 200, json: { ...card, quote: body.body } } : saved;
    }),
};
