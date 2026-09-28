/**
 * Where the outbox lives between a capture and a connection (O-1, OF-06,
 * OF-10).
 *
 * Three backings, one interface:
 *
 *   web     IndexedDB, one object store keyed by `offlineId`. It has to
 *           survive a page reload, because the thing an offline capture is
 *           protecting against is exactly the situation where the tab gets
 *           closed on a train. Each row holds the entry SEALED through
 *           `lib/encryptedStore.ts`'s web half (A-4): the row's key, the
 *           `offlineId`, is the only thing in it that is not ciphertext.
 *   native  `lib/encryptedStore.ts`. A queued capture is Josh's own words
 *           sitting on the device for an unknown length of time; it is
 *           encrypted at rest for the same reason the refresh token is —
 *           on both tiers, which this comment claimed before it was true.
 *   neither memory, and `persistent` is FALSE so the app can say so. A queue
 *           that silently forgets is worse than no queue: the person believes
 *           their capture is safe.
 *   native, when the store cannot seal (WPI-2): memory too, decided at each
 *           call from `lib/encryptedStore.ts`'s `secureStoreStatus()` — a phone
 *           with no `crypto.getRandomValues` holds its captures and says so,
 *           rather than refusing each one it was asked to hold.
 *
 * The fallback is deliberately loud in the only way it can be — a fact the UI
 * reads — rather than a console warning nobody sees: the outbox carries it to
 * `stores/sync.ts`, and `lib/syncStatus.ts` makes it attention, "captures are
 * not being saved on this device", on the sync dot and in Settings › Sync (A-7).
 */
import { Platform } from "react-native";
import { encryptedGet, encryptedRemove, encryptedSet, seal, secureStoreStatus, unseal, wipeCount } from "@/lib/encryptedStore";
import type { OutboxEntry } from "@/data/types";
import type { Conflict } from "@/data/transport/outbox";

const DB_NAME = "jstack";
const STORE = "outbox";
const NATIVE_KEY = "jstack.outbox";
/** A-5: the refused captures, beside the queue */
const CONFLICTS = "conflicts";
const NATIVE_CONFLICTS = "jstack.outbox.conflicts";

export type QueueStore = {
  all: () => Promise<OutboxEntry[]>;
  put: (entry: OutboxEntry) => Promise<void>;
  remove: (offlineId: string) => Promise<void>;
  clear: () => Promise<void>;
  /** A-5: the captures the server refused, kept in the same tier as the queue —
   * a reload must not lose their words (A4R7-08). `clear` takes them too. */
  conflicts: () => Promise<Conflict[]>;
  saveConflicts: (list: Conflict[]) => Promise<void>;
  /** False when neither IndexedDB nor the keychain was available. */
  persistent: boolean;
};

const byCreatedAt = (a: OutboxEntry, b: OutboxEntry) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

export function memoryQueue(): QueueStore {
  let entries: OutboxEntry[] = [];
  let refused: Conflict[] = [];
  return {
    all: async () => [...entries].sort(byCreatedAt),
    put: async (entry) => {
      entries = [...entries.filter((e) => e.offlineId !== entry.offlineId), entry];
    },
    remove: async (offlineId) => {
      entries = entries.filter((e) => e.offlineId !== offlineId);
    },
    clear: async () => {
      entries = [];
      refused = [];
    },
    conflicts: async () => [...refused],
    saveConflicts: async (list) => {
      refused = [...list];
    },
    persistent: false,
  };
}

/** A kept conflict list, or none: unreadable is the same as absent, as it is for the queue. */
function parseConflicts(raw: string | null): Conflict[] {
  if (raw == null) return [];
  try {
    const list = JSON.parse(raw) as Conflict[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function nativeQueue(): QueueStore {
  const read = async (): Promise<OutboxEntry[]> => {
    const raw = await encryptedGet(NATIVE_KEY);
    if (raw == null) return [];
    try {
      return JSON.parse(raw) as OutboxEntry[];
    } catch {
      // unreadable is the same as absent — better an empty queue than a
      // crash loop on every boot
      return [];
    }
  };
  const write = async (entries: OutboxEntry[]) => {
    if (entries.length === 0) return encryptedRemove(NATIVE_KEY);
    return encryptedSet(NATIVE_KEY, JSON.stringify(entries));
  };
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(op: () => Promise<T>): Promise<T> => {
    const next = chain.then(op, op);
    chain = next.catch(() => undefined);
    return next;
  };
  return {
    all: async () => (await read()).sort(byCreatedAt),
    // A4R7-05: each write reads the whole queue and writes it back over one
    // key, so two at once lost one. They queue behind each other now.
    put: (entry) => serial(async () => write([...(await read()).filter((e) => e.offlineId !== entry.offlineId), entry])),
    remove: (offlineId) => serial(async () => write((await read()).filter((e) => e.offlineId !== offlineId))),
    clear: () =>
      serial(async () => {
        await write([]);
        await encryptedRemove(NATIVE_CONFLICTS);
      }),
    conflicts: async () => parseConflicts(await encryptedGet(NATIVE_CONFLICTS)),
    saveConflicts: (list) => serial(() => (list.length === 0 ? encryptedRemove(NATIVE_CONFLICTS) : encryptedSet(NATIVE_CONFLICTS, JSON.stringify(list)))),
    persistent: true,
  };
}

/**
 * WPI-2: the native queue while this device's encrypted store can seal, and memory while it cannot, decided at every
 * call — boot's probe answers after the first reads — with `persistent` saying which, for the dot and Settings › Sync.
 * The wipe clears both.
 */
function guardedNativeQueue(): QueueStore {
  const kept = nativeQueue();
  const held = memoryQueue();
  const now = () => (secureStoreStatus().status === "ok" ? kept : held);
  return {
    all: () => now().all(),
    put: (entry) => now().put(entry),
    remove: (offlineId) => now().remove(offlineId),
    clear: async () => {
      await held.clear();
      await kept.clear();
    },
    conflicts: () => now().conflicts(),
    saveConflicts: (list) => now().saveConflicts(list),
    get persistent() {
      return now().persistent;
    },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // A-5: version 2 adds the refused captures' store beside the queue's
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "offlineId" });
      if (!request.result.objectStoreNames.contains(CONFLICTS)) request.result.createObjectStore(CONFLICTS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>, storeName: string = STORE): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(storeName, mode).objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

/** A-4: what an IndexedDB row holds — its key, and the entry as ciphertext */
type SealedRow = { offlineId: string; sealed: string };

const isSealed = (row: SealedRow | OutboxEntry): row is SealedRow => "sealed" in row && typeof row.sealed === "string";

/** A row sealed since A-4, or an entry written plain before it — read once as it
 * is rather than dropped: it is somebody's capture, still waiting to go. */
async function openRow(row: SealedRow | OutboxEntry): Promise<OutboxEntry | null> {
  if (!isSealed(row)) return row;
  const plain = await unseal(row.sealed);
  if (plain == null) return null; // unreadable is the same as absent, as on native
  try {
    return JSON.parse(plain) as OutboxEntry;
  } catch {
    return null;
  }
}

/**
 * A-4b: puts a plain row's sealed form in its place — only if the row is still there and still plain, read and
 * written in one transaction, so a capture sent and removed while its seal was being made is not put back.
 */
function resealPlain(offlineId: string, sealed: string, wipesBefore: number): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        if (wipeCount() !== wipesBefore) return resolve(); // WPA-14: sealed across a wipe, written nowhere
        const store = db.transaction(STORE, "readwrite").objectStore(STORE);
        const current = store.get(offlineId) as IDBRequest<SealedRow | OutboxEntry | undefined>;
        current.onerror = () => reject(current.error);
        current.onsuccess = () => {
          if (current.result == null || isSealed(current.result)) return resolve();
          const row: SealedRow = { offlineId, sealed };
          const put = store.put(row);
          put.onsuccess = () => resolve();
          put.onerror = () => reject(put.error);
        };
      }),
  );
}

/**
 * WPA-14: a sealed write, made as `encryptedSet` makes one — the wipe count read before the seal is checked again on
 * the tick the transaction opens, so a wipe that ran while the value was being sealed (and has emptied the device)
 * gets nothing written after it. A write whose check passes has opened its transaction before the wipe's clear.
 */
function writeUnlessWiped<T>(wipesBefore: number, storeName: string, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        if (wipeCount() !== wipesBefore) return resolve();
        const request = work(db.transaction(storeName, "readwrite").objectStore(storeName));
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
  );
}

function webQueue(): QueueStore {
  return {
    all: async () => {
      const wipesBefore = wipeCount();
      const rows = (await run("readonly", (s) => s.getAll() as IDBRequest<(SealedRow | OutboxEntry)[]>)) ?? [];
      const entries = await Promise.all(rows.map(openRow));
      // A-4b: a row written plain before A-4 is sealed where it lies the first time it is read, rather than
      // staying plain at rest until it is sent; one that will not seal stays readable as it was
      const plain = rows.filter((r): r is OutboxEntry => !isSealed(r));
      // WPA-14: nothing is sealed once a wipe has run — a seal after it would mint a key the wipe never saw
      const toSeal = wipeCount() === wipesBefore ? plain : [];
      await Promise.all(toSeal.map((r) => seal(JSON.stringify(r)).then((sealed) => resealPlain(r.offlineId, sealed, wipesBefore)).catch(() => undefined)));
      return entries.filter((e): e is OutboxEntry => e != null).sort(byCreatedAt);
    },
    put: async (entry) => {
      const wipesBefore = wipeCount();
      const row: SealedRow = { offlineId: entry.offlineId, sealed: await seal(JSON.stringify(entry)) };
      await writeUnlessWiped(wipesBefore, STORE, (s) => s.put(row));
    },
    remove: async (offlineId) => {
      await run("readwrite", (s) => s.delete(offlineId) as unknown as IDBRequest<undefined>);
    },
    clear: async () => {
      await run("readwrite", (s) => s.clear() as unknown as IDBRequest<undefined>);
      await run("readwrite", (s) => s.clear() as unknown as IDBRequest<undefined>, CONFLICTS);
    },
    // one sealed row under one key: the list is small, and it is Josh's words
    conflicts: async () => {
      const row = await run("readonly", (s) => s.get("list") as IDBRequest<{ sealed?: string } | undefined>, CONFLICTS);
      return typeof row?.sealed === "string" ? parseConflicts(await unseal(row.sealed)) : [];
    },
    saveConflicts: async (list) => {
      if (list.length === 0) {
        await run("readwrite", (s) => s.delete("list") as unknown as IDBRequest<undefined>, CONFLICTS);
        return;
      }
      const wipesBefore = wipeCount();
      const row = { sealed: await seal(JSON.stringify(list)) };
      await writeUnlessWiped(wipesBefore, CONFLICTS, (s) => s.put(row, "list"));
    },
    persistent: true,
  };
}

/**
 * The best backing this platform can give, or memory with the capability
 * turned off. Never throws: a queue that fails to open must not take the app
 * down with it, because the app works perfectly well online.
 */
export function createQueueStore(): QueueStore {
  if (Platform.OS !== "web") {
    try {
      return guardedNativeQueue();
    } catch {
      return memoryQueue();
    }
  }
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (idb == null) return memoryQueue();
  try {
    return webQueue();
  } catch {
    return memoryQueue();
  }
}
