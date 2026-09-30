/**
 * What Josh sends the EA and what the EA sends back, through the `brain` webhook
 * (JSTACK-DASH-brain): captures, journal lines and Dictate-to-EA chat in; replies and insights out
 * (`remap/WORKFLOWS-NEEDED.md` §2, "Brain store, the EA's side").
 *
 *  - `POST /brain/dump`, `/journal`, `/chat` put an item by Josh, with the app's `offlineId` (the
 *    store dedupes on it). It shows at once as not yet filed — the app's own provisional line,
 *    "→ filing · Librarian" (`lib/routingLine.ts`), and no routing — until the EA files it; then its
 *    routing is the EA's `data.routing`, never one made up here;
 *  - `GET /brain/latest` is the captures and journal lines, newest first; `GET /chat/thread` Josh's
 *    chat and the EA's answers to it, oldest first; `GET /brain/replies` the EA's open replies;
 *    Today's insight the newest open insight that carries a block;
 *  - a chat answer arrives later, as a reply in the thread, so `POST /chat` answers with no reply yet;
 *  - `PATCH /brain/replies/{id}` read → the reply dismissed; `POST /insights/{id}`: "Block it" makes
 *    the event through `calendar-edit` (`op: "block"`) and answers the insight; "Leave it" answers it.
 *
 * Anything else in a reply is this section's 502.
 */
import { now } from "@/lib/time";
import { TYPE_META, UNLABELLED, type LabelType, type Silo } from "@/data/labels";
import type { BrainItem, BrainSource, CaptureRouting, ChatReply, ChatThread, DumpResult, Insight, Reply } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { callWebhook } from "@/data/n8n/client";
import { FOCUSES, inFocus, OWNER_SILOS } from "@/data/n8n/focus";
import type { Asked } from "@/data/n8n/registry";

type RawItem = { id: string; kind: string; text: string; source: string; by: "josh" | "ea"; state: string; offlineId: string | null; data: Record<string, unknown>; createdAt: string; updatedAt: string };

class UnexpectedReply extends Error {}

/** the app's own words for a capture on its way to being filed (`lib/routingLine.ts` FILING) */
const FILING = "→ filing · Librarian";
const LIST_LIMIT = 100;
const SOURCES: readonly BrainSource[] = ["voice", "typed", "transcript", "journal", "agent", "share", "system"];
const KINDS: readonly CaptureRouting["kind"][] = ["task", "journal", "memory", "question", "note", "reading"];
const STORAGE: readonly CaptureRouting["storage"][] = ["twenty", "journal", "memory", "dropbox"];

const isObject = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isRaw = (v: unknown): v is RawItem => isObject(v) && isString(v.id) && isString(v.kind) && isString(v.text) && isString(v.state) && isString(v.createdAt) && isObject(v.data);

function itemOf(data: unknown): RawItem {
  const item = isObject(data) ? data.item : undefined;
  if (!isRaw(item)) throw new UnexpectedReply("no item");
  return item;
}

async function list(kinds: string[], states?: string[]): Promise<RawItem[]> {
  const data = await callWebhook("brain", { op: "list", kinds, ...(states != null ? { states } : {}), limit: LIST_LIMIT });
  if (!isObject(data) || !Array.isArray(data.items) || !data.items.every(isRaw)) throw new UnexpectedReply("no items list");
  return data.items as RawItem[];
}

async function answering(make: () => Promise<TransportResponse>): Promise<TransportResponse> {
  try {
    return await make();
  } catch (error) {
    if (error instanceof UnexpectedReply) return { status: 502, json: { reason: `the brain store answered in an unexpected shape: ${error.message}` } };
    throw error;
  }
}

/** the EA's routing, as the contract's — or nothing, never a guess */
function routingOf(v: unknown): CaptureRouting | null {
  if (!isObject(v)) return null;
  const ok = KINDS.includes(v.kind as CaptureRouting["kind"]) && STORAGE.includes(v.storage as CaptureRouting["storage"]) && Array.isArray(v.silos) && v.silos.every(isString) && Array.isArray(v.labels) && v.labels.every(isString) && (v.sensitivity === "normal" || v.sensitivity === "sensitive");
  return ok ? ({ ...(v as unknown as CaptureRouting), provisional: false }) : null;
}

const focusOf = (silo: string) => FOCUSES.find((f) => f.filter.silos?.includes(silo))?.id ?? "personal";

function toBrainItem(r: RawItem): BrainItem {
  const routing = r.state === "filed" ? routingOf(r.data.routing) : null;
  const silo = routing?.silos[0];
  const known = silo != null && OWNER_SILOS.includes(silo as Silo) ? (silo as Silo) : null;
  // the EA's own label words where they are the contract's types; set by the EA's reading of the content
  const types = (routing?.labels ?? []).filter((l): l is LabelType => l in TYPE_META);
  const labels = routing != null && known != null ? { silo: known, types, setBy: "content" as const } : UNLABELLED;
  const source: BrainSource = r.kind === "journal" ? "journal" : SOURCES.includes(r.source as BrainSource) ? (r.source as BrainSource) : "typed";
  return {
    id: r.id,
    text: r.text,
    at: r.createdAt,
    meta: r.kind === "journal" ? `${r.source} · Close the day` : r.source,
    source,
    routed: r.state === "new" ? [FILING] : [],
    ...(routing != null ? { routing } : {}),
    labels,
    setAt: r.updatedAt,
    focus: labels === UNLABELLED ? "personal" : focusOf(labels.silo),
  };
}

const sourcesOf = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is { label: string; ref: string } => isObject(s) && isString(s.label) && isString(s.ref)) : []);

function toReply(r: RawItem): Reply {
  return { id: r.id, toCaptureId: isString(r.data.inReplyTo) ? r.data.inReplyTo : "", text: r.text, sources: sourcesOf(r.data.sources), at: r.createdAt, read: r.state !== "open", labels: UNLABELLED, setAt: r.createdAt, focus: "personal" };
}

type Block = { title: string; startsAt: string; endsAt: string };
const blockOf = (v: unknown): Block | null => (isObject(v) && isString(v.title) && isString(v.startsAt) && isString(v.endsAt) ? { title: v.title, startsAt: v.startsAt, endsAt: v.endsAt } : null);

function toInsight(r: RawItem): Insight {
  const answer = isObject(r.data.answer) ? r.data.answer : null;
  return {
    id: r.id,
    text: r.text,
    why: isString(r.data.because) ? r.data.because : "",
    sources: sourcesOf(r.data.sources),
    primary: { label: "Block it", action: "block" },
    secondary: { label: "Leave it", action: "leave" },
    state: r.state === "open" ? "open" : "done",
    ...(answer != null ? { result: answer.verb === "block" ? "Blocked · in your calendar" : "Left open" } : {}),
    labels: UNLABELLED,
    setAt: r.updatedAt,
    focus: "personal",
  };
}

const offlineIdOf = (v: unknown) => (isString(v) && /^[A-Za-z0-9-]{8,100}$/.test(v) ? { offlineId: v } : {});
const bodyOf = (asked: Asked) => (isObject(asked.req.body) ? asked.req.body : {});

async function put(item: Record<string, unknown>): Promise<RawItem> {
  return itemOf(await callWebhook("brain", { op: "put", by: "josh", item }, { write: true }));
}

export const brainAnswers = {
  latest: (asked: Asked) => answering(async () => ({ status: 200, json: inFocus((await list(["capture", "journal"])).map(toBrainItem), asked.req.query?.focus) })),
  byId: (asked: Asked) => answering(async () => ({ status: 200, json: toBrainItem(itemOf(await callWebhook("brain", { op: "get", id: asked.params[0] }))) })),
  replies: () => answering(async () => ({ status: 200, json: (await list(["reply"], ["open"])).map(toReply) })),
  thread: () =>
    answering(async () => {
      const rows = (await list(["chat", "reply"])).filter((r) => r.kind === "chat" || (r.kind === "reply" && isString(r.data.inReplyTo) && r.data.inReplyTo !== ""));
      const turns = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => ({ from: r.by, text: r.text, ...(r.by === "ea" ? { sources: sourcesOf(r.data.sources).map((s) => s.label) } : {}) }));
      return { status: 200, json: { turns } satisfies ChatThread };
    }),

  dump: (asked: Asked) =>
    answering(async () => {
      const b = bodyOf(asked);
      if (!isString(b.text) || b.text.trim() === "") return { status: 422, json: { field: "text", reason: "a capture needs its words" } };
      const data = { ...(isString(b.url) ? { url: b.url } : {}), ...(Array.isArray(b.attachmentIds) ? { attachmentIds: b.attachmentIds } : {}) };
      const item = toBrainItem(await put({ kind: "capture", text: b.text, source: isString(b.source) ? b.source : "typed", ...offlineIdOf(b.offlineId), data }));
      return { status: 200, json: { item, routed: item.routed } satisfies DumpResult };
    }),
  journal: (asked: Asked) =>
    answering(async () => {
      const b = bodyOf(asked);
      if (!isString(b.text) || b.text.trim() === "") return { status: 422, json: { field: "text", reason: "a journal line needs its words" } };
      return { status: 200, json: toBrainItem(await put({ kind: "journal", text: b.text, source: isString(b.source) ? b.source : "typed", ...offlineIdOf(b.offlineId) })) };
    }),
  chat: (asked: Asked) =>
    answering(async () => {
      const b = bodyOf(asked);
      if (!isString(b.text) || b.text.trim() === "") return { status: 422, json: { field: "text", reason: "say something first" } };
      await put({ kind: "chat", text: b.text, source: "voice" });
      // the EA answers into the thread, later: no reply to show yet
      return { status: 200, json: { reply: "", sources: [] } satisfies ChatReply };
    }),

  /** `patchReply`: read is the reply dismissed; unread puts it back */
  reply: (asked: Asked) =>
    answering(async () => {
      const read = bodyOf(asked).read;
      if (typeof read !== "boolean") return { status: 422, json: { field: "read", reason: "read must be true or false" } };
      return { status: 200, json: toReply(itemOf(await callWebhook("brain", { op: "update", id: asked.params[0], patch: { state: read ? "dismissed" : "open" } }, { write: true }))) };
    }),

  /** `postInsightAction`: Block it makes the event (calendar-edit, protected by the EA), then answers; Leave it answers */
  insight: (asked: Asked) =>
    answering(async () => {
      const id = asked.params[0];
      const action = bodyOf(asked).action;
      if (action !== "block" && action !== "leave") return { status: 422, json: { field: "action", reason: "block or leave" } };
      const current = itemOf(await callWebhook("brain", { op: "get", id }));
      let answer: Record<string, unknown> = { verb: action };
      if (action === "block") {
        const block = blockOf(current.data.block);
        if (block == null) return { status: 422, json: { field: "block", reason: "this insight holds no time to block" } };
        const made = await callWebhook("calendar-edit", { op: "block", ...block, description: current.text }, { write: true });
        const event = isObject(made) && isObject(made.event) ? made.event : null;
        answer = { verb: "block", eventId: isString(event?.id) ? event.id : null };
      }
      const updated = itemOf(await callWebhook("brain", { op: "update", id, patch: { state: "answered", data: { answer: { ...answer, at: now().toISOString() } } } }, { write: true }));
      return { status: 200, json: toInsight(updated) };
    }),
};

/** Today's insight: the newest open one that carries a block — the one "Block it" can act on. */
export async function openInsight(): Promise<Insight | undefined> {
  const rows = await list(["insight"], ["open"]);
  const withBlock = rows.find((r) => blockOf(r.data.block) != null);
  return withBlock != null ? toInsight(withBlock) : undefined;
}
