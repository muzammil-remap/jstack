/** §4.6 Brain (REMAP memory, Librarian, EA). */
import { UNLABELLED } from "@/data/labels";
import * as db from "@/data/mock/db";
import { err, inFocus, ok } from "@/data/mock/util";
import { emitServerEvent } from "@/data/mock/events";
import { replyTo, replyToTurn, triage } from "@/data/mock/triage";
import { ingestShare } from "@/data/mock/ingest";
import { UNDO_WINDOW_MS } from "@/data/mock/handlers/decisions";
import type { BrainDumpBody, BrainItem, DumpResult, Reply, ReplyPatch } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

export function postBrainDump(req: TransportRequest): TransportResponse {
  const state = db.get();
  const body = (req.body ?? {}) as BrainDumpBody;
  // The dedupe is `data/mock/server.ts`'s (O-1, F-02): the router answers a
  // replayed `offlineId` before any handler runs, so the rule lives once
  // instead of in each capture handler. The record's id is still
  // `dump-${offlineId}`, so the row the outbox holds is the row on the server.
  const now = db.now();

  // W-1 (UP-04, §4.23): a SHARE goes down the ingestion path — extract, then
  // triage, then the standing rules, then a card only if the filing is still
  // provisional. Same door for the Shortcut, the share target and the Dropbox
  // inbox, so how a thing got in cannot change how it is filed.
  if (body.source === "share") {
    const { item: shared } = ingestShare({
      text: body.text ?? "",
      url: body.url,
      id: body.offlineId ? `dump-${body.offlineId}` : `dump-${now.getTime()}`,
      at: now.toISOString(),
    });
    if (body.attachmentIds != null && body.attachmentIds.length > 0) attachTo(shared.id, body.attachmentIds);
    emitServerEvent({ kind: "brain", ids: [shared.id], at: shared.at });
    return ok<DumpResult>({ item: shared, routed: shared.routed });
  }

  const item: BrainItem = {
    id: body.offlineId ? `dump-${body.offlineId}` : `dump-${now.getTime()}`,
    text: body.text ?? "(voice capture)",
    at: now.toISOString(),
    meta: body.source,
    source: body.source,
    // BR-01: the new Latest-in row reads "→ filing · Librarian" while
    // the Librarian hasn't triaged it yet. `routed` is V2.1's line and
    // `routing` is R-1's structured replacement (resolution #50); both are
    // written while both are read, and the row prefers `routing`.
    routed: ["→ filing · Librarian"],
    routing: triage(body.text ?? ""),
    // R1 fail-closed: a dump arrives untriaged, so it gets the scheme's own
    // unlabelled default rather than a literal that happens to match it
    labels: UNLABELLED,
    setAt: now.toISOString(),
    focus: "personal",
  };
  state.brainItems = [item, ...state.brainItems];
  // X-1 (UP-02, ADR-64): the files were uploaded first and named here. The
  // capture does not carry the bytes — it carries ids — so a file and the
  // thought that came with it are two records that know about each other,
  // and the offline queue can replay them in that order. The attachment gains
  // the capture's silo: it arrived as part of this thought, not as a loose
  // file, and inheriting the label is what keeps the two visible to the same
  // people.
  if (body.attachmentIds != null && body.attachmentIds.length > 0) attachTo(item.id, body.attachmentIds);
  // RP-01: a capture that was a QUESTION gets an answer. Not synchronously —
  // the EA is not a function call, and a reply that landed in the same tick as
  // the capture would let the app get away with never handling the case where
  // one arrives while Josh is looking at something else. It arrives on the
  // `brain` event like any other server-side change, and the app refetches.
  if (item.routing?.kind === "question") answerLater(item.id, item.text);
  return ok<DumpResult>({ item, routed: item.routed });
}

/** How long the EA takes to answer in the mock. Long enough to be a second
 * event rather than part of the POST, short enough that a person watching the
 * demo does not think it failed. */
const REPLY_MS = 1200;

function answerLater(captureId: string, text: string): void {
  const timer = setTimeout(() => {
    const state = db.get();
    // the capture may have been edited or the db reset while we waited; a
    // reply to a record that is gone is a row pointing at nothing
    if (!state.brainItems.some((b) => b.id === captureId)) return;
    const reply = replyTo(captureId, text, db.now().toISOString());
    state.replies = [reply, ...state.replies.filter((r) => r.id !== reply.id)];
    emitServerEvent({ kind: "brain", ids: [reply.id], at: reply.at });
  }, REPLY_MS);
  // a pending timer must not hold a jest worker open
  (timer as unknown as { unref?: () => void }).unref?.();
}

/**
 * RP-02: unread first, then newest. The ORDER is the server's, not the
 * section's — a configured section is a renderer and cannot sort, and two
 * surfaces (Brain › Replies and Today's card) that each sorted for
 * themselves would eventually disagree about which reply is "the newest
 * unread one".
 */
export function getReplies(_req: TransportRequest): TransportResponse {
  const rows = [...db.get().replies].sort((a, b) => (a.read === b.read ? b.at.localeCompare(a.at) : a.read ? 1 : -1));
  return ok<Reply[]>(rows);
}

/** RP-02/RP-03: opening a reply marks it read, and so does Dismiss. The only
 * field a client may set — the text and the sources are the EA's. */
export function patchReply(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.replies.findIndex((r) => r.id === id);
  if (idx === -1) return err(404, "not found");
  const body = (req.body ?? {}) as ReplyPatch;
  if (typeof body.read !== "boolean") return err(422, "read must be true or false", { field: "read" });
  state.replies[idx] = { ...state.replies[idx], read: body.read };
  return ok<Reply>(state.replies[idx]);
}

export function getBrainLatest(req: TransportRequest): TransportResponse {
  return ok(inFocus(db.get().brainItems, req.query?.focus));
}

export function putBrainItem(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.brainItems.findIndex((b) => b.id === id);
  if (idx === -1) return err(404, "not found");
  const prev = state.brainItems[idx];
  const versions = [...(prev.versions ?? []), { at: db.now().toISOString(), text: prev.text, editor: "josh" as const }];
  state.brainItems[idx] = { ...prev, ...(req.body as Partial<BrainItem>), versions, editedAt: db.now().toISOString() };
  return ok(state.brainItems[idx]);
}

/** O-1 / OP-01, OP-02: the one item a Find result or a Latest in row opens. */
export function getBrainItem(_req: TransportRequest, id: string): TransportResponse {
  const item = db.get().brainItems.find((b) => b.id === id);
  return item == null ? err(404, "not found") : ok(item);
}

/** OP-03: every correction, newest first — what was proposed, what was
 * decided, by whom, and what the value was before. */
export function getMemoryHistory(): TransportResponse {
  return ok(db.get().memoryHistory);
}

export function getBrainItemVersions(_req: TransportRequest, id: string): TransportResponse {
  const item = db.get().brainItems.find((b) => b.id === id);
  return item ? ok(item.versions ?? []) : err(404, "not found");
}

export function getBrainSearch(req: TransportRequest): TransportResponse {
  const q = (req.query?.q ?? "").toLowerCase();
  const state = db.get();
  if (q === "") return ok({ answer: null, results: [] });
  const matches = state.brainItems.filter((b) => b.text.toLowerCase().includes(q));
  return ok({
    answer: {
      headline: matches[0]?.text ?? "Nothing found",
      synthesis: matches.length > 0 ? `${matches.length} capture(s) mention this.` : "No captures mention this yet.",
      sources: matches.slice(0, 3).map((m) => ({ label: m.source, ref: m.id })),
      confidence: matches.length > 0 ? 0.8 : 0,
      seconds: 0.4,
    },
    results: matches.map((m) => ({ id: m.id, title: m.text, snippet: m.meta, ref: m.id })),
  });
}

/** TS-04: the thread as the server holds it. */
export function getChatThread(): TransportResponse {
  return ok({ turns: db.get().chatThread });
}

export function postChat(req: TransportRequest): TransportResponse {
  const body = (req.body ?? {}) as { text: string };
  const state = db.get();
  const q = body.text.toLowerCase();
  const matches = state.brainItems.filter((b) => b.text.toLowerCase().includes(q)).slice(0, 2);
  const reply = `Got it — "${body.text}". I'll look into that.`;
  const sources = matches.map((m) => m.text);
  // TS-04: BOTH sides are appended to the server's thread, which is what makes
  // `GET /chat/thread` worth asking. Before this the reply existed only in the
  // component's own state and vanished with the modal.
  state.chatThread.push({ from: "josh", text: body.text }, { from: "ea", text: reply, sources });
  // RP-05: the EA's turn is also a reply. The turn has no id of its own — a
  // ChatTurn is a position in a thread — so `toCaptureId` names that position,
  // which is what "naming the turn" can mean for a record shaped like this.
  const turnId = `chat-${state.chatThread.length - 1}`;
  const at = db.now().toISOString();
  state.replies = [
    replyToTurn(turnId, reply, matches.map((m) => ({ label: m.text, ref: `brain:${m.id}` })), at),
    ...state.replies.filter((r) => r.id !== `rp-${turnId}`),
  ];
  return ok({ reply, sources });
}

export function getMemoryProposals(req: TransportRequest): TransportResponse {
  return ok(inFocus(db.get().memoryProposals, req.query?.focus).filter((p) => p.state === "open"));
}

export function postMemoryProposal(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.memoryProposals.findIndex((p) => p.id === id);
  if (idx === -1) return err(404, "not found");
  const body = (req.body ?? {}) as { verb: "ok" | "edit"; text?: string };
  const before = state.memoryProposals[idx];
  const decision = body.verb === "ok" ? "accepted" : "edited";
  state.memoryProposals[idx] = { ...before, state: decision, text: body.text ?? before.text };
  state.memoryUndo[id] = { at: db.now().getTime(), before, wrote: state.memoryProposals[idx] };
  // MH-A, CONTRACT.md §4.18: accepting or editing appends a memory-history
  // entry — newest first, matching what GET /memory/history promises.
  state.memoryHistory = [
    {
      id: `mh-${id}-${db.now().getTime()}`,
      text: state.memoryProposals[idx].text,
      decision,
      at: db.now().toISOString(),
      by: "Josh",
      ...(decision === "edited" ? { was: before.text } : {}),
    },
    ...state.memoryHistory,
  ];
  return ok(state.memoryProposals[idx]);
}

/** A4R9-11: the answer's undo puts back what THAT answer overwrote — the state
 * and, for an edit, the words — inside ten seconds, and only while the proposal
 * still says what the answer wrote; otherwise `409`, as every other undo. */
export function undoMemoryProposal(_req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.memoryProposals.findIndex((p) => p.id === id);
  if (idx === -1) return err(404, "not found");
  const entry = state.memoryUndo[id];
  delete state.memoryUndo[id];
  const now = state.memoryProposals[idx];
  if (entry == null || db.now().getTime() - entry.at > UNDO_WINDOW_MS || now.state !== entry.wrote.state || now.text !== entry.wrote.text) {
    return err(409, "nothing of that answer's to take back");
  }
  state.memoryProposals[idx] = entry.before;
  return ok(state.memoryProposals[idx]);
}

export function getMemoryHitRate(_req: TransportRequest): TransportResponse {
  return ok(db.get().memoryHitRate);
}





/**
 * X-1 (UP-02, ADR-64): the files were uploaded first and named here. The
 * capture does not carry the bytes — it carries ids — so a file and the
 * thought that came with it are two records that know about each other, and
 * the offline queue can replay them in that order. The attachment gains the
 * capture's silo: it arrived as part of this thought, not as a loose file, and
 * inheriting the label is what keeps the two visible to the same people.
 */
function attachTo(captureId: string, attachmentIds: string[]): void {
  const state = db.get();
  const item = state.brainItems.find((b) => b.id === captureId);
  if (item == null) return;
  // A4R7-04: `offline:<offlineId>` is a file that was queued with the capture;
  // its upload replays first, so by now it has a real id. A4R8-03: unless the
  // capture went straight through while its upload waited in the queue — the
  // reference is kept, and `postFile` files the upload with it on arrival
  for (const id of attachmentIds) {
    if (id.startsWith("offline:") && state.fileByOfflineId[id.slice(8)] == null) state.captureByPendingUpload[id.slice(8)] = item.id;
  }
  const wanted = new Set(attachmentIds.map((id) => (id.startsWith("offline:") ? (state.fileByOfflineId[id.slice(8)] ?? id) : id)));
  state.files = state.files.map((f) => (wanted.has(f.id) ? { ...f, brainId: item.id, captureId: item.id, labels: item.labels, focus: item.focus } : f));
}
