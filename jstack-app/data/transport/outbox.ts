/**
 * `withOutbox(inner, queue, isOnline, isEmergency)` — the transport that does not lose a
 * capture (O-1, OF-01..07).
 *
 * It wraps another transport rather than replacing it, so `ApiAdapter` is
 * oblivious: every call still goes through one boundary, and the outbox is a
 * layer on that boundary rather than a second path through the app.
 *
 * What it does, and only for the routes `data/routes.ts` marks `offline:
 * true`:
 *
 *  1. Mints an `offlineId` and puts it in the body, ALWAYS — online as well
 *     as offline (OF-01). A capture that only carries an id when it happens
 *     to be queued gives the server no way to dedupe the one case that
 *     matters: the request that was sent, arrived, and whose response was
 *     lost on the way back.
 *  2. If the connection is known to be down, or the send fails at the network
 *     layer, the write is queued and the caller gets `202 { queued: true,
 *     offlineId }`. A 202 is the honest status: accepted, not done. So is a
 *     write to a record that already has an older write waiting — queued, or
 *     still on the wire — which joins the queue behind it rather than
 *     overtaking it (A-12). While the emergency lock is on nothing is queued
 *     at all (WPA-15): the write is refused the way a locked write is
 *     (`LockedError`), and the caller keeps the words rather than hearing that
 *     a wiped device holds them.
 *  3. `replay()` sends the queue in the order it was written. A `2xx` drops
 *     the entry; a `409` drops it too and records a conflict, because the
 *     server has already decided and repeating will not change its mind; a
 *     network error, a `401`/`403` (the session is not authorised right
 *     now), a `408`/`429` (the server has put it off, WPF-2) or a `5xx`
 *     KEEPS it and stops; any other refusal leaves the queue
 *     but goes on the same list with the server's reason, so no capture is
 *     ever dropped in silence (R-05).
 *
 *  `stores/sync.ts` is the only caller of `replay()`, and it does not call
 *  while the session is locked: the queue is a write too, and the lock gate
 *  that stops every adapter write (`lib/lockGate.ts`) covers it there.
 *
 * Anything not on the allow-list fails the way it always did. Queuing a write
 * that is not safe to repeat would be worse than losing it — SEC-15's verbs
 * are not on the list, and neither is anything whose second application would
 * mean something different from its first.
 */
import { pathToPattern, ROUTES } from "@/data/routes";
import type { OutboxEntry } from "@/data/types";
import { MAX_QUEUED_UPLOAD_BYTES } from "@/data/files";
import type { QueueStore } from "@/lib/queueStore";
import { LockedError } from "@/lib/lockGate";
import type { Transport, TransportRequest, TransportResponse } from "./Transport";

/** The allow-list, read off the one table — never a second copy of it. The
 * pattern comes from `pathToPattern` for the same reason: `data/routes.ts`
 * already knows how to turn `/habits/{id}/log` into a matcher, and a second
 * implementation of that is a second thing to get wrong. */
const OFFLINE_ROUTES = ROUTES.filter((r) => r.offline === true).map((r) => ({ method: r.method, pattern: pathToPattern(r.path), template: r.path }));

export function isQueueable(req: TransportRequest): boolean {
  return OFFLINE_ROUTES.some((r) => r.method === req.method && r.pattern.test(req.path));
}

/**
 * A-12: the record a queueable write lands on — its path up to the first `{param}` of its route, so
 * `/tasks/t1`, `/tasks/t1/subtasks/s1` and `/tasks/t1/complete` are one task. A create (`/brain/dump`,
 * `/journal`, `/tasks`, `/files`) names no record: nothing it writes can be overwritten by an older copy.
 */
function recordOf(method: string, path: string): string | null {
  const route = OFFLINE_ROUTES.find((r) => r.method === method && r.pattern.test(path));
  const at = route == null ? -1 : route.template.split("/").findIndex((segment) => segment.startsWith("{"));
  return at < 0 ? null : path.split("/").slice(0, at + 1).join("/");
}

/** Sortable and unique without a dependency; the server only needs it to be
 * the same string on a replay as it was on the first attempt. */
function mintOfflineId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * What a lost connection actually looks like, per engine: Chrome "Failed to
 * fetch", Firefox "NetworkError when attempting to fetch resource", Safari
 * "Load failed".
 *
 * This used to be `error instanceof TypeError ||` the first two patterns, and
 * the bare instanceof was doing the real work — including for Safari, whose
 * "Load failed" matched none of them. The cost was that EVERY `TypeError`
 * counted as a bad connection, so a TypeError raised by a bug inside the
 * transport took the offline path: kept at `attempts: 0`, no conflict, no
 * `lastError`, the UI still promising to sync when you are back online, and
 * everything queued behind it stopped too (A4-10, B-178). Silence is the one
 * outcome CODEMAP §4's invariant does not allow.
 *
 * So: the message decides, and Safari's is in the list. A `TypeError` the
 * client raised itself now falls through to `listed()` with every other real
 * error — the words leave the queue and go on the list with the reason, which
 * is the honest way to stop retrying somebody's capture. No attempts cap:
 * during a genuinely long offline the cap would list a capture that was
 * always going to send.
 *
 * A-1: `reachability.ts` reads the same class, so the app counts itself
 * offline exactly when a capture would queue — one definition of a lost
 * connection, not two.
 */
const NETWORK_FAILURE = /network|fetch|load failed|connection/i;
export const isNetworkFailure = (error: unknown) => error instanceof Error && NETWORK_FAILURE.test(error.message);

export type Conflict = { offlineId: string; path: string; localText: string; serverReason: string };

export type Outbox = {
  transport: Transport;
  /** `retryAfterMs` when the server said how long to wait (a `429`'s `retryAfter`, WPF-2) */
  replay: () => Promise<{ sent: number; conflicts: Conflict[]; retryAfterMs?: number }>;
  entries: () => Promise<OutboxEntry[]>;
  /** the emergency wipe (`lib/emergencyWipe.ts`): a queued capture, or a refused
   * one, is Josh's words on a device somebody else may be holding */
  clear: () => Promise<void>;
  /** A-5: the refused captures as the device kept them, and the list to keep now */
  storedConflicts: () => Promise<Conflict[]>;
  keepConflicts: (list: Conflict[]) => Promise<void>;
  /** A-7: false when the queue behind it is held in memory only — the sync store carries it to the dot */
  persistent: boolean;
};

/** The words a person would recognise as the thing they typed (OF-07). */
function localTextOf(body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>;
  for (const key of ["text", "title", "note", "summary"]) {
    if (typeof b[key] === "string" && b[key] !== "") return b[key] as string;
  }
  return JSON.stringify(body ?? {});
}

export function withOutbox(inner: Transport, queue: QueueStore, isOnline: () => boolean, isEmergency: () => boolean = () => false): Outbox {
  /**
   * A-12 (CODE_REVIEW_v23 finding 6): no write overtakes an older one to the same record. An edit that
   * failed at the network waited in the queue while the next edit to the same task went straight out
   * and landed, and the retry then replayed the older value over it — on exactly the flaky connection
   * the queue exists for. So a write joins the queue while an older write to its record is queued or
   * still on the wire (`onTheWire` counts those), and every entry is stamped when its write was MADE,
   * strictly increasing, so the queue's order is the order the writes were made in — even when the
   * first is queued after the second, or both fall in one millisecond.
   */
  const onTheWire = new Map<string, number>();
  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };

  const enqueue = async (req: TransportRequest, offlineId: string, createdAt: string): Promise<TransportResponse> => {
    // WPA-15: while the emergency lock is on the device keeps nothing new (A-13's rule, applied to the queue), and a
    // capture nothing kept is never answered `queued: true` — asked again after the write, for a lock that landed during it
    if (isEmergency()) throw new LockedError(req.path);
    await queue.put({
      offlineId,
      method: req.method as OutboxEntry["method"],
      path: req.path,
      body: req.body,
      multipart: req.multipart,
      createdAt,
      attempts: 0,
      state: "queued",
    });
    if (isEmergency()) throw new LockedError(req.path);
    return { status: 202, json: { queued: true, offlineId } };
  };

  const transport: Transport = async (req) => {
    if (!isQueueable(req)) return inner(req);
    const createdAt = stamp();

    const body = (req.body ?? {}) as Record<string, unknown>;
    const offlineId = typeof body.offlineId === "string" ? body.offlineId : mintOfflineId();
    // An upload has no JSON body to carry the id in, and inventing one would
    // make the request neither valid JSON nor valid multipart. The id rides in
    // the form fields instead, which is where a real backend would read it.
    const withId: TransportRequest =
      req.multipart != null
        ? { ...req, multipart: { ...req.multipart, fields: { ...req.multipart.fields, offlineId } } }
        : { ...req, body: { ...body, offlineId } };

    // X-1 (UP-03): the QUEUE's ceiling, which is not the server's. Ten
    // megabytes is how much of somebody's device the app is willing to hold
    // while the connection is down; twenty-five is what the backend accepts
    // when it is up. A file over the queue's ceiling is REFUSED rather than
    // queued, because queuing it would be a promise the app cannot keep — and
    // a person who is told now can wait for wifi, while a person told nothing
    // finds out when the sync fails.
    if (!isOnline() && req.multipart != null && req.multipart.file.size > MAX_QUEUED_UPLOAD_BYTES) {
      return { status: 507, json: { reason: "too large to hold offline" } };
    }

    if (!isOnline()) return enqueue(withId, offlineId, createdAt);

    const live = async (): Promise<TransportResponse> => {
      try {
        return await inner(withId);
      } catch (error) {
        // A network failure is the case the queue exists for. Anything else is
        // a real error and belongs to the caller — swallowing a bug into a
        // queue would replay it forever.
        if (!isNetworkFailure(error)) throw error;
        return enqueue(withId, offlineId, createdAt);
      }
    };
    const record = recordOf(req.method, req.path);
    if (record == null) return live();
    const ahead = onTheWire.get(record) ?? 0;
    // counted from before the first await, so a write that starts meanwhile sees this one
    onTheWire.set(record, ahead + 1);
    try {
      if (ahead > 0 || (await queue.all()).some((e) => recordOf(e.method, e.path) === record)) return await enqueue(withId, offlineId, createdAt);
      return await live();
    } finally {
      const left = (onTheWire.get(record) ?? 1) - 1;
      if (left > 0) onTheWire.set(record, left);
      else onTheWire.delete(record);
    }
  };

  const replay = async (): Promise<{ sent: number; conflicts: Conflict[]; retryAfterMs?: number }> => {
    const conflicts: Conflict[] = [];
    let sent = 0;
    let retryAfterMs: number | undefined;
    // an entry the server will never accept leaves the queue, but never the
    // person's sight: it is listed with the reason, beside the conflicts
    const listed = async (entry: OutboxEntry, serverReason: string) => {
      conflicts.push({ offlineId: entry.offlineId, path: entry.path, localText: localTextOf(entry.body), serverReason });
      await queue.remove(entry.offlineId);
    };
    // in order: a task edited then completed must arrive that way round
    for (const entry of await queue.all()) {
      let res: TransportResponse;
      try {
        res = await inner({ method: entry.method, path: entry.path, body: entry.body, multipart: entry.multipart as TransportRequest["multipart"] });
      } catch (error) {
        if (!isNetworkFailure(error)) {
          // A-0 review, R-05: this used to be a silent removal ("a permanent
          // error would otherwise be retried forever"). It still leaves the
          // queue — but the words go on the list with what went wrong, which
          // is the only honest way to stop retrying somebody's capture.
          await listed(entry, error instanceof Error ? error.message : String(error));
          continue;
        }
        // still offline — stop, keep the rest, try again next time
        break;
      }
      if (res.status === 409) {
        const reason = ((res.json ?? {}) as { reason?: string }).reason ?? "changed on the server";
        await listed(entry, reason);
        continue;
      }
      if (res.status >= 200 && res.status < 300) {
        await queue.remove(entry.offlineId);
        sent += 1;
        continue;
      }
      // R-05: a 401/403 is not the entry's fault — the session is not
      // authorised right now (locked, revoked, a token to refresh). Keep
      // everything and stop; the next authorised replay sends it. The same
      // for a 5xx: the server is having a bad minute, not refusing the words.
      // WPF-2: and for a 408 or a 429. The server has put the request off, not
      // refused the words, and a 429 may say for how long (`retryAfter`, Q8)
      if (res.status === 401 || res.status === 403 || res.status === 408 || res.status === 429 || res.status >= 500) {
        const after = ((res.json ?? {}) as { retryAfter?: unknown }).retryAfter;
        if (typeof after === "number" && after > 0) retryAfterMs = after * 1000;
        break;
      }
      // any other 4xx the server will never accept — the words go on the
      // list with the server's reason rather than vanishing (R-05)
      const body = (res.json ?? {}) as { reason?: string; field?: string };
      const why = body.reason != null ? `${body.field != null ? `${body.field} · ` : ""}${body.reason}` : `refused (${res.status})`;
      await listed(entry, why);
    }
    return { sent, conflicts, ...(retryAfterMs != null ? { retryAfterMs } : {}) };
  };

  // WPA-17: the refused list is Josh's words too — under the emergency lock the device keeps no new copy of it (the
  // store's in-memory list may still change), and a Dismiss after the wipe used to mint a key to write the rest back
  const keepConflicts = async (list: Conflict[]): Promise<void> => {
    if (isEmergency()) return;
    await queue.saveConflicts(list);
  };

  return {
    transport,
    replay,
    entries: () => queue.all(),
    clear: () => queue.clear(),
    storedConflicts: () => queue.conflicts(),
    keepConflicts,
    // WPI-2: read at each call — a native queue is held in memory once boot's probe finds the store cannot seal
    get persistent() {
      return queue.persistent;
    },
  };
}

/**
 * Did this write get queued rather than applied? A `202` carries
 * `{ queued: true, offlineId }` and NOT the record the caller asked for, so a
 * store that reads `result.item` off it throws. Every capture call site checks
 * this before touching the response (O-2).
 */
export function isQueued(result: unknown): result is { queued: true; offlineId: string } {
  return typeof result === "object" && result !== null && (result as { queued?: unknown }).queued === true;
}

/** The one wording, so five surfaces cannot each invent their own (OF-02). */
export const QUEUED_META = "queued · syncs when you're back online";

/** The queued brain captures, newest first, shaped like the rows they will
 * become so `LatestIn` renders one list rather than two. */
export function queuedDumps(entries: OutboxEntry[]): { id: string; text: string; meta: string; queued: true }[] {
  return entries
    .filter((e) => e.path === "/brain/dump")
    .slice()
    .reverse()
    .map((e) => ({
      id: `queued-${e.offlineId}`,
      text: ((e.body ?? {}) as { text?: string }).text ?? "(voice capture)",
      meta: QUEUED_META,
      queued: true as const,
    }));
}

/**
 * Ids a queued capture is waiting on, per surface (O-2, OF-03). A row shows
 * the queued line when its own id is in here — derived from the queue, so it
 * clears itself when the queue drains.
 */
export function queuedIdsIn(entries: OutboxEntry[], pattern: RegExp): Set<string> {
  const ids = new Set<string>();
  for (const e of entries) {
    const m = pattern.exec(e.path);
    if (m?.[1] != null) ids.add(m[1]);
  }
  return ids;
}

export const QUEUED_HABIT = /^\/habits\/([^/]+)\/log$/;

/** A-9 (A4R8-09): a task whose completion is still queued — Today's tick and the Tasks row read it as done until it lands */
export const QUEUED_COMPLETE = /^\/tasks\/([^/]+)\/complete$/;
