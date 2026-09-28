/**
 * recentFiles.ts (X-1, FL-05) — the file details this device keeps, so Find
 * and the Files lists can answer without a connection.
 *
 * WHAT IT KEEPS, and the rule is the whole point of the file:
 *
 *   metadata (name, kind, size, who, when, what it belongs to), the
 *   `previewText`, and the `dropboxUrl`.
 *
 * WHAT IT NEVER KEEPS: `url`, `urlExpiresAt`, or a body.
 *
 * `url` is a SHORT-LIVED SIGNED URL — a bearer credential for the file,
 * minted per `GET /files/{id}`. Writing one to disk turns a link that was
 * meant to live for ten minutes into a link that lives until the device is
 * wiped, and anything that can read the store can then read the file without
 * a session. `strip()` below enforces that on the way IN rather than asking
 * every caller to remember, because a rule that lives at four call sites is a
 * rule that will be missed at one of them. `tests/unit/recentFiles.test.ts`
 * asserts the stored shape — it plants a record carrying a `url` and proves it
 * is not there when it comes back.
 *
 * WHERE IT LIVES: `lib/encryptedStore.ts`, not `lib/queueStore.ts`. The row's
 * paragraph in `17_CC_V22_EXEC_PROMPT.md` says "on `queueStore`", and that is
 * the right STORAGE CLASS — device-local, encrypted at rest, cleared by the
 * emergency wipe — but `QueueStore` is typed to `OutboxEntry` and is a queue:
 * things go in, get replayed, and leave. This is a cache, and putting it in
 * the outbox would mean the sync engine walking file metadata looking for
 * things to send. Same backing, correct shape; recorded here under rule 15.
 * `wipeAllLocalData` (AG-12) clears every AsyncStorage key, so this one goes
 * with the rest by construction rather than by being remembered.
 *
 * EXPIRY is `files.recentDays`, read at every open — the parameter Josh can
 * change in Settings › Security, and the one X-1 owes (it was declared at L-1
 * and unread until now). Entries older than the window are dropped on the
 * next read, so the cache shrinks by being used rather than needing a sweep.
 */
import { encryptedGet, encryptedSet, secureStoreStatus } from "@/lib/encryptedStore";
import { currentParameter } from "@/stores/parameters";
import { dayKey, addDays } from "@/lib/time";
import type { Attachment } from "@/data/types";
import { useSessionStore } from "@/stores/session";

/** `tests/unit/recentFiles.test.ts` spells this literal out rather than
 * importing it, deliberately: renaming the key orphans the cache on every
 * device that already has one, so it is a thing a test should notice. */
const KEY = "jstack.recentFiles";

/**
 * The stored shape. Spelled as an explicit pick rather than
 * `Omit<Attachment, "url" | "urlExpiresAt">` so that a field added to
 * `Attachment` later is NOT silently persisted: a new field arrives absent
 * from the cache and someone has to decide, which is the safe direction for a
 * store that has already been told to hold no credentials.
 */
type CachedFile = Pick<
  Attachment,
  "id" | "name" | "kind" | "size" | "storage" | "folder" | "dropboxUrl" | "previewText" | "taskId" | "subtaskId" | "brainId" | "captureId" | "addedBy" | "at" | "labels" | "setAt" | "focus"
>;

function strip(file: Attachment): CachedFile {
  return {
    id: file.id,
    name: file.name,
    kind: file.kind,
    size: file.size,
    storage: file.storage,
    folder: file.folder,
    dropboxUrl: file.dropboxUrl,
    previewText: file.previewText,
    taskId: file.taskId,
    subtaskId: file.subtaskId,
    brainId: file.brainId,
    captureId: file.captureId,
    addedBy: file.addedBy,
    at: file.at,
    labels: file.labels,
    setAt: file.setAt,
    focus: file.focus,
  };
}

/** the cut-off, from the parameter, as a day key */
function oldestKept(): string {
  const days = currentParameter("files.recentDays");
  return addDays(dayKey(new Date()), -(typeof days === "number" ? days : 14));
}

async function read(): Promise<CachedFile[]> {
  const raw = await encryptedGet(KEY);
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(raw) as CachedFile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Every file the device still holds, expired entries dropped. The drop is
 * WRITTEN BACK, not just filtered on the way out — an expiry that only hid
 * rows would leave the bytes on the device forever while claiming a fourteen
 * day window.
 */
export async function cachedFiles(): Promise<Attachment[]> {
  const all = await read();
  const cutoff = oldestKept();
  const kept = all.filter((f) => dayKey(new Date(f.at)) >= cutoff);
  // WPA-16: written back only while this device may keep anything — under the emergency lock the read still hides it,
  // and on a phone whose store cannot seal (WPI-2)
  if (kept.length !== all.length && !useSessionStore.getState().emergency && secureStoreStatus().status === "ok") await encryptedSet(KEY, JSON.stringify(kept));
  return kept.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) as Attachment[];
}

/** Merge a fresh list in, newest wins on id. Called after every successful
 * read, so the cache is filled by ordinary use rather than by a sync step. */
export async function cacheFiles(files: readonly Attachment[]): Promise<void> {
  if (files.length === 0) return;
  const existing = await read();
  const incoming = files.map(strip);
  const ids = new Set(incoming.map((f) => f.id));
  // WPA-16: A-13's rule — under the emergency lock this device keeps nothing new, and a Files read answered before
  // `POST /lock` can land after the wipe; one already writing when the wipe runs is refused by `encryptedSet`'s count
  // WPI-2: nor on a phone whose store cannot seal — the write would throw, and the load would trade its answer for the empty cache
  if (useSessionStore.getState().emergency || secureStoreStatus().status !== "ok") return;
  await encryptedSet(KEY, JSON.stringify([...incoming, ...existing.filter((f) => !ids.has(f.id))]));
}
