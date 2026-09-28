/**
 * A-4 (WP-A, v2.3) — the smallest IndexedDB the app's two web stores use, in memory.
 *
 * `lib/queueStore.ts` keeps the web outbox in IndexedDB and `lib/encryptedStore.ts`
 * keeps the web cipher key there, and neither had ever run under Jest: this lane has
 * no IndexedDB, and the repo takes no dependency (fake-indexeddb would be one). This
 * implements exactly the calls those two files make — `open` with an upgrade,
 * `objectStoreNames.contains`, `createObjectStore`, and a transaction's `get`,
 * `getAll`, `put`, `delete` and `clear` — and fires each request's handlers on a
 * later microtask, as the real one fires them after the call has returned.
 *
 * `rows()` hands a test the values AS STORED. That is the point of it: the claim
 * under test is about the bytes at rest, not about what the store gives back.
 */
type Request = { result: unknown; error: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null; onupgradeneeded?: (() => void) | null };
type Store = { keyPath?: string; rows: Map<unknown, unknown> };
type Db = { version: number; stores: Map<string, Store> };

const blank = (): Request => ({ result: undefined, error: null, onsuccess: null, onerror: null });

/** the request comes back now; its outcome arrives after the caller has attached handlers */
function later(req: Request, work: () => unknown, beforeSuccess?: () => void): Request {
  void Promise.resolve().then(() => {
    try {
      req.result = work();
      beforeSuccess?.();
      req.onsuccess?.();
    } catch (e) {
      req.error = e;
      req.onerror?.();
    }
  });
  return req;
}

export function installFakeIndexedDb(): { rows: (db: string, store: string) => Map<unknown, unknown>; restore: () => void } {
  const dbs = new Map<string, Db>();

  const storeHandle = (store: Store) => ({
    get: (key: unknown) => later(blank(), () => store.rows.get(key)),
    getAll: () => later(blank(), () => [...store.rows.values()]),
    put: (value: Record<string, unknown>, key?: unknown) =>
      later(blank(), () => {
        const k = key ?? (store.keyPath != null ? value[store.keyPath] : undefined);
        store.rows.set(k, value);
        return k;
      }),
    delete: (key: unknown) => later(blank(), () => void store.rows.delete(key)),
    clear: () => later(blank(), () => store.rows.clear()),
  });

  const dbHandle = (db: Db) => ({
    objectStoreNames: { contains: (name: string) => db.stores.has(name) },
    createObjectStore: (name: string, options?: { keyPath?: string }) => void db.stores.set(name, { keyPath: options?.keyPath, rows: new Map() }),
    transaction: () => ({ objectStore: (name: string) => storeHandle(db.stores.get(name)!) }),
  });

  const factory = {
    open: (name: string, version = 1) => {
      const req: Request = { ...blank(), onupgradeneeded: null };
      let upgrade = false;
      return later(
        req,
        () => {
          const existing = dbs.get(name);
          const db = existing ?? { version, stores: new Map<string, Store>() };
          if (existing == null || existing.version < version) upgrade = true;
          db.version = version;
          dbs.set(name, db);
          return dbHandle(db);
        },
        () => {
          if (upgrade) req.onupgradeneeded?.();
        },
      );
    },
  };

  const g = globalThis as { indexedDB?: unknown };
  const saved = g.indexedDB;
  g.indexedDB = factory;
  return {
    rows: (db, store) => dbs.get(db)?.stores.get(store)?.rows ?? new Map(),
    restore: () => {
      if (saved === undefined) delete g.indexedDB;
      else g.indexedDB = saved;
    },
  };
}
