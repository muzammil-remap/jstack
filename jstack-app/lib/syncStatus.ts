/**
 * syncStatus (SY-01, seam 9) — the one place that decides what the sync dot
 * is saying, and the one place that words it.
 *
 * It is a pure function of six facts and nothing else: no store, no hook, no
 * clock. That is what makes the table test in `tests/unit/syncStatus.test.ts`
 * able to state every case in one screen — and it is why the rail's dot and
 * the phone header's dot cannot disagree, because there is nothing for them
 * to disagree with each other about (rule 16).
 *
 * The order of the three tests is the whole design:
 *
 *  - ATTENTION first. A conflict or a failed replay is the one state that does
 *    not resolve itself by waiting, so it must not be hidden by a queue that
 *    happens to be draining at the same moment. Something is being kept that
 *    the server would not take, and only a person can settle it. A queue
 *    that cannot persist is attention too, and outranks both (A-7): the
 *    memory fallback forgets every capture when the app closes, so the
 *    capture at risk is the next one, and no waiting makes it safe.
 *  - PENDING next, and OFFLINE is one of its causes. Nothing is confirmed
 *    while the connection is down, even with an empty queue: "ok" then would
 *    be the app saying it is in step with a server it has not spoken to.
 *  - OK last, and it is the narrow case — online, nothing queued, nothing in
 *    flight, nothing refused.
 */

export type SyncStatus = "ok" | "pending" | "attention";

/** Everything the dot is allowed to know. `conflicts` is a COUNT, not the
 * list: the status has no business reading a conflict's contents. */
export type SyncFacts = {
  online: boolean;
  queued: number;
  syncing: boolean;
  conflicts: number;
  lastError: string | null;
  /** A-7: false when the queue is held in memory only (`lib/queueStore.ts`) —
   * neither IndexedDB nor the keychain was there, so closing the app loses it. */
  persistent: boolean;
};

export function syncStatus(f: SyncFacts): SyncStatus {
  if (!f.persistent || f.conflicts > 0 || f.lastError != null) return "attention";
  if (!f.online || f.queued > 0 || f.syncing) return "pending";
  return "ok";
}

/**
 * The state in words, without the "Sync · " that names the thing.
 *
 * SY-02 quotes three of these ("ok", "2 captures waiting", "needs
 * attention"); the other two exist because pending has three causes and a
 * label that said "captures waiting" with an empty queue would be a lie about
 * the one number the person can check. The COUNT outranks the rest of pending
 * — offline with two captures held is still "2 captures waiting", which is
 * the fact worth reading — and the queue's own line says the connection is
 * down beside it.
 *
 * Attention has two phrases (A-7). A queue held in memory only names what it
 * costs, "captures are not being saved on this device", where "needs
 * attention" would have the person look for a refused capture that may not
 * be there; and it outranks a conflict, which is kept, while the next capture
 * is not.
 */
export function syncPhrase(f: SyncFacts): string {
  const status = syncStatus(f);
  if (status === "attention") return f.persistent ? "needs attention" : "captures are not being saved on this device";
  if (status === "ok") return "ok";
  if (f.queued > 0) return `${f.queued} capture${f.queued === 1 ? "" : "s"} waiting`;
  return f.syncing ? "syncing" : "offline";
}

/** What a screen reader is given for the dot (SY-02). */
export function syncLabel(f: SyncFacts): string {
  return `Sync · ${syncPhrase(f)}`;
}
