/**
 * OF-01..10 — the queue that does not lose a capture (row O-1).
 *
 * The promise this row makes to Josh is small and absolute: if he says
 * something into the app, it is not gone, whatever the connection is doing.
 * Everything here is a way that promise could quietly fail — a write that
 * queues but never replays, a replay that duplicates, a conflict that
 * disappears, a queue that forgets on reload.
 *
 * The transport is exercised directly with a fake inner transport rather than
 * through the app, so each failure mode can be produced on demand. A network
 * failure is a `TypeError`, which is what `fetch` actually throws.
 */
import { isQueueable, withOutbox } from "@/data/transport/outbox";
import { ROUTES } from "@/data/routes";
import { memoryQueue, type QueueStore } from "@/lib/queueStore";
import type { OutboxEntry } from "@/data/types";
import { installFakeIndexedDb } from "./fakeIndexedDb";
import { LockedError } from "@/lib/lockGate";
import { get as dbGet, reset } from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import type { Transport, TransportRequest, TransportResponse } from "@/data/transport/Transport";

const networkError = () => new TypeError("Failed to fetch");

/** An inner transport whose behaviour each test decides. */
function fakeInner() {
  const seen: TransportRequest[] = [];
  let behaviour: (req: TransportRequest) => TransportResponse | Promise<TransportResponse> = () => ({ status: 200, json: { ok: true } });
  const inner: Transport = async (req) => {
    seen.push(JSON.parse(JSON.stringify(req)) as TransportRequest);
    return behaviour(req);
  };
  return {
    inner,
    seen,
    answer: (fn: typeof behaviour) => {
      behaviour = fn;
    },
  };
}

const dump = (text: string): TransportRequest => ({ method: "POST", path: "/brain/dump", body: { text, source: "typed" } });

beforeEach(() => reset());

describe("OF-01 · the allow-list comes from the route table", () => {
  it("the ten capture writes are queueable, the table marks exactly these ten, and nothing else is", () => {
    expect(isQueueable(dump("x"))).toBe(true);
    expect(isQueueable({ method: "POST", path: "/journal" })).toBe(true);
    expect(isQueueable({ method: "POST", path: "/habits/h1/log" })).toBe(true);
    expect(isQueueable({ method: "PATCH", path: "/tasks/t1" })).toBe(true);
    expect(isQueueable({ method: "POST", path: "/tasks" })).toBe(true);
    expect(isQueueable({ method: "POST", path: "/people/pe1/act" })).toBe(true);

    // reads are not captures, and neither is anything that acts outward
    expect(isQueueable({ method: "GET", path: "/today" })).toBe(false);
    expect(isQueueable({ method: "POST", path: "/devices/d1/revoke" })).toBe(false);
    expect(isQueueable({ method: "POST", path: "/actions/c1" })).toBe(false);

    // A-10 (WP-A, v2.3): the case named six and there are ten. The table's own list, spelled
    // out, so the next route marked offline is a decision this test makes somebody take —
    // and each one is queueable in its concrete form, through the matcher the outbox uses.
    const marked = ROUTES.filter((r) => r.offline === true).map((r) => `${r.method} ${r.path}`).sort();
    expect(marked).toEqual([
      "PATCH /tasks/{id}",
      "PATCH /tasks/{id}/subtasks/{sid}",
      "POST /brain/dump",
      "POST /files",
      "POST /habits/{id}/log",
      "POST /journal",
      "POST /people/{id}/act",
      "POST /tasks",
      "POST /tasks/{id}/complete",
      "PUT /parameters/{key}",
    ]);
    const concrete = ["PATCH /tasks/t1", "PATCH /tasks/t1/subtasks/s1", "POST /brain/dump", "POST /files", "POST /habits/h1/log", "POST /journal", "POST /people/pe1/act", "POST /tasks", "POST /tasks/t1/complete", "PUT /parameters/lock.afterMinutes"];
    expect(concrete.filter((c) => !isQueueable({ method: c.split(" ")[0] as TransportRequest["method"], path: c.split(" ")[1] }))).toEqual([]);
  });

  it("an offlineId is sent even when the connection is fine", async () => {
    // the case that makes dedupe possible at all: a request that arrived and
    // whose RESPONSE was lost. Without an id on the happy path the retry
    // creates a second record.
    const { inner, seen } = fakeInner();
    const outbox = withOutbox(inner, memoryQueue(), () => true);
    await outbox.transport(dump("hello"));
    expect((seen[0].body as { offlineId?: string }).offlineId).toEqual(expect.any(String));
  });
});

describe("OF-02 · offline, a capture is accepted rather than lost", () => {
  it("answers 202 { queued } and holds one entry", async () => {
    const { inner, seen } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);

    const res = await outbox.transport(dump("a thought"));
    expect(res.status).toBe(202);
    expect(res.json).toMatchObject({ queued: true });
    expect(seen).toEqual([]); // nothing was even attempted
    expect(await queue.all()).toHaveLength(1);
  });

  it("a network failure while believing itself online queues too", async () => {
    const { inner, answer } = fakeInner();
    answer(() => {
      throw networkError();
    });
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => true);

    expect((await outbox.transport(dump("b"))).status).toBe(202);
    expect(await queue.all()).toHaveLength(1);
  });

  it("a REAL error is not swallowed into the queue", async () => {
    // a bug queued and replayed forever is worse than a bug reported once
    const { inner, answer } = fakeInner();
    answer(() => {
      throw new RangeError("something is actually broken");
    });
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => true);

    await expect(outbox.transport(dump("c"))).rejects.toThrow(RangeError);
    expect(await queue.all()).toEqual([]);
  });
});

describe("OF-04 · replay is in order, once each", () => {
  it("sends the queue oldest first and drains it", async () => {
    const { inner, seen } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);

    for (const text of ["first", "second", "third"]) await outbox.transport(dump(text));
    expect(await queue.all()).toHaveLength(3);

    const result = await outbox.replay();
    expect(result.sent).toBe(3);
    expect(seen.map((r) => (r.body as { text: string }).text)).toEqual(["first", "second", "third"]);
    expect(await queue.all()).toEqual([]);
  });

  it("a second replay sends nothing — the queue is empty, not merely quiet", async () => {
    const { inner, seen } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);
    await outbox.transport(dump("only"));
    await outbox.replay();
    const after = seen.length;
    expect((await outbox.replay()).sent).toBe(0);
    expect(seen).toHaveLength(after);
  });

  it("still offline: the queue is kept, not dropped", async () => {
    const { inner, answer } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);
    await outbox.transport(dump("kept"));
    await outbox.transport(dump("also kept"));

    answer(() => {
      throw networkError();
    });
    expect((await outbox.replay()).sent).toBe(0);
    expect(await queue.all()).toHaveLength(2);
  });
});

describe("OF-07 · a conflict is recorded, never silently dropped", () => {
  it("409 drops the entry and keeps the local text with the server's reason", async () => {
    const { inner, answer } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);
    await outbox.transport(dump("my version of it"));

    answer(() => ({ status: 409, json: { reason: "answered on another device" } }));
    const { sent, conflicts } = await outbox.replay();

    expect(sent).toBe(0);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ localText: "my version of it", serverReason: "answered on another device" });
    // dropped from the queue: repeating will not change the server's mind
    expect(await queue.all()).toEqual([]);
  });
});

/**
 * A-0 review, R-05. `replay()` treated every non-409 4xx and every non-network
 * throw as "the server will never accept it" and REMOVED the entry — with no
 * conflict, no toast, nothing. A 401 is the case that made it matter: a
 * locked session (the mock answers 401 to every write while locked, and a
 * real backend answers 401 to a revoked token) turned a reconnect into a
 * silent purge of everything captured on the train. A 5xx went the same way.
 * The promise this queue makes is "your words are not gone"; the only honest
 * outcomes for an entry are sent, kept for later, or LISTED with the reason.
 */
describe("A4-10 · a client-side TypeError is a bug, not a bad connection", () => {
  /**
   * `fetch` throws a `TypeError` when the network is gone — so the predicate
   * read EVERY `TypeError` as "still offline". A `TypeError` raised inside the
   * transport by a bug (a response shape the client mis-parses, say) then took
   * the offline path: `break`, the entry kept at `attempts: 0`, no conflict
   * listed, `lastError` null, and the UI still saying "queued · syncs when
   * you're back online" through every reconnect. Everything queued behind it
   * stopped too.
   *
   * That contradicts the invariant CODEMAP §4 states in those words — "no
   * capture is dropped in silence: an outbox entry is sent, kept for later, or
   * listed with the server's reason". Silence was the fourth outcome.
   */
  it("a TypeError that is not a fetch failure is LISTED, not read as offline", async () => {
    const { inner, answer } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);
    await outbox.transport(dump("the words that wedged"));
    await outbox.transport(dump("and the one behind it"));

    answer(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'json')");
    });
    const { sent, conflicts } = await outbox.replay();

    expect(sent).toBe(0);
    // each entry gets its own attempt and its own line — the bug throws for
    // all of them, so all of them are LISTED with the reason rather than one
    // wedging and the rest never being tried
    expect(conflicts.map((c) => c.localText)).toEqual(["the words that wedged", "and the one behind it"]);
    expect(conflicts[0].serverReason).toContain("Cannot read properties of undefined");
    expect(await queue.all()).toEqual([]);
  });

  it("the real offline TypeErrors are still read as offline, on every engine that words it differently", async () => {
    // Chrome "Failed to fetch", Firefox "NetworkError when attempting to fetch
    // resource", Safari "Load failed" — the last of which the old regex could
    // not match either, and only the bare `instanceof TypeError` was catching.
    for (const message of ["Failed to fetch", "NetworkError when attempting to fetch resource", "Load failed"]) {
      const { inner, answer } = fakeInner();
      const queue = memoryQueue();
      const outbox = withOutbox(inner, queue, () => false);
      await outbox.transport(dump(message));
      answer(() => {
        throw new TypeError(message);
      });
      const { sent, conflicts } = await outbox.replay();
      expect({ message, sent, conflicts }).toEqual({ message, sent: 0, conflicts: [] });
      expect((await queue.all())).toHaveLength(1); // kept, for the next attempt
    }
  });
});

describe("R-05 · a refusal is kept or listed, never silently dropped", () => {
  it("a 401 keeps the entry and stops — an unauthorised session replays nothing and loses nothing", async () => {
    const { inner, answer, seen } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);
    await outbox.transport(dump("first"));
    await outbox.transport(dump("second"));

    answer(() => ({ status: 401, json: { reason: "locked" } }));
    const { sent, conflicts } = await outbox.replay();

    expect(sent).toBe(0);
    expect(conflicts).toEqual([]);
    // both still queued, in order — and the second was never even attempted
    expect((await queue.all()).map((e) => (e.body as { text: string }).text)).toEqual(["first", "second"]);
    expect(seen.filter((r) => r.path === "/brain/dump")).toHaveLength(1);
  });

  it("a 5xx keeps the entry for the next attempt rather than deleting it", async () => {
    const { inner, answer } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);
    await outbox.transport(dump("kept"));

    answer(() => ({ status: 503, json: { reason: "maintenance" } }));
    const { sent, conflicts } = await outbox.replay();

    expect(sent).toBe(0);
    expect(conflicts).toEqual([]);
    expect(await queue.all()).toHaveLength(1);
  });

  it("WPF-2: a 429 keeps the entry and stops, and says how long the server asked for", async () => {
    const { inner, answer, seen } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);
    await outbox.transport(dump("first"));
    await outbox.transport(dump("second"));

    answer(() => ({ status: 429, json: { reason: "slow down", retryAfter: 30 } }));
    const result = await outbox.replay();

    expect(result.sent).toBe(0);
    expect(result.conflicts).toEqual([]);
    // both still queued, in order, and the second never attempted
    expect((await queue.all()).map((e) => (e.body as { text: string }).text)).toEqual(["first", "second"]);
    expect(seen.filter((r) => r.path === "/brain/dump")).toHaveLength(1);
    expect(result.retryAfterMs).toBe(30_000);
  });

  it("WPF-2: a 408 keeps the entry for the next attempt rather than listing it", async () => {
    const { inner, answer } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);
    await outbox.transport(dump("kept"));

    answer(() => ({ status: 408, json: { reason: "request timeout" } }));
    const { conflicts } = await outbox.replay();

    expect(conflicts).toEqual([]);
    expect(await queue.all()).toHaveLength(1);
  });

  it("a refusal the server will never accept (422) is listed with the reason and the local text", async () => {
    const { inner, answer } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);
    await outbox.transport(dump("too long, apparently"));

    answer(() => ({ status: 422, json: { field: "text", reason: "must be 2000 characters or fewer" } }));
    const { sent, conflicts } = await outbox.replay();

    expect(sent).toBe(0);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ localText: "too long, apparently" });
    expect(conflicts[0].serverReason).toContain("must be 2000 characters or fewer");
    // out of the queue — repeating a 422 is a 422 — but the words are on the list
    expect(await queue.all()).toEqual([]);
  });

  it("a transport that throws something other than a network failure is listed, not swallowed", async () => {
    const { inner, answer } = fakeInner();
    const queue = memoryQueue();
    const outbox = withOutbox(inner, queue, () => false);
    await outbox.transport(dump("bug bait"));

    answer(() => {
      throw new Error("ContractError: response shape");
    });
    const { conflicts } = await outbox.replay();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ localText: "bug bait" });
    expect(conflicts[0].serverReason).toContain("response shape");
    expect(await queue.all()).toEqual([]);
  });
});

describe("OF-04 · the server answers a replay with the first answer, not a second record", () => {
  const call = (path: string, body: unknown) => handle({ method: "POST", path, body } as TransportRequest);

  it("a repeated offlineId returns { duplicate: true } and creates nothing", async () => {
    const body = { text: "said once", source: "typed", offlineId: "of-1" };
    const first = await call("/brain/dump", body);
    const second = await call("/brain/dump", body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.json).toMatchObject({ duplicate: true });

    const items = ((await handle({ method: "GET", path: "/brain/latest" })).json ?? []) as { text: string }[];
    expect(items.filter((i) => i.text === "said once")).toHaveLength(1);
  });

  it("the gate covers every capture route, not just the one that had it by hand", async () => {
    // brain/dump had a hand-rolled dedupe; the other five had none. The rule
    // lives in the router now, so the check is that they ALL behave.
    const cases: [string, unknown][] = [
      ["/journal", { text: "j", source: "typed", offlineId: "of-j" }],
      ["/habits/h1/log", { date: "2026-09-06", done: true, offlineId: "of-h" }],
      ["/people/pe1/act", { action: "done", offlineId: "of-p" }],
    ];
    for (const [path, body] of cases) {
      await call(path, body);
      expect((await call(path, body)).json).toMatchObject({ duplicate: true });
    }
  });

  it("a route that is not a capture is not deduped — its second call means a second thing", async () => {
    // POST /actions/{id} is a verb, not a capture: repeating it is a real
    // second answer and must not be quietly swallowed
    const body = { verb: "later", offlineId: "of-x" };
    const first = await handle({ method: "POST", path: "/actions/c2", body } as TransportRequest);
    expect(first.status).toBe(200);
    expect(first.json).not.toMatchObject({ duplicate: true });
  });

  it("an armed conflict answers 409 once, then behaves normally", async () => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const db = require("@/data/mock/db") as typeof import("@/data/mock/db");
    db.get().conflicting.push("of-c");

    const body = { text: "conflicted", source: "typed", offlineId: "of-c" };
    expect((await call("/brain/dump", body)).status).toBe(409);
    // armed once: a conflict that fired forever would be a stuck queue
    expect((await call("/brain/dump", body)).status).toBe(200);
  });
});

describe("OF-06/OF-10 · where the queue lives", () => {
  it("the memory queue keeps order and replaces by offlineId", async () => {
    const q = memoryQueue();
    const entry = (id: string, at: string) => ({
      offlineId: id,
      method: "POST" as const,
      path: "/brain/dump",
      body: {},
      createdAt: at,
      attempts: 0,
      state: "queued" as const,
    });
    await q.put(entry("b", "2026-09-06T02:00:00.000Z"));
    await q.put(entry("a", "2026-09-06T01:00:00.000Z"));
    expect((await q.all()).map((e) => e.offlineId)).toEqual(["a", "b"]);

    // the same id twice is one entry, not two — a retry must not multiply
    await q.put(entry("a", "2026-09-06T01:00:00.000Z"));
    expect(await q.all()).toHaveLength(2);

    await q.remove("a");
    expect((await q.all()).map((e) => e.offlineId)).toEqual(["b"]);
  });

  it("the memory queue says it is not persistent, so the app can be honest about it", () => {
    // a queue that silently forgets is worse than no queue: the person
    // believes their capture is safe (OF-10)
    expect(memoryQueue().persistent).toBe(false);
  });

  it("on web with no IndexedDB the queue falls back to memory rather than throwing", () => {
    // Platform has to be mocked as well as IndexedDB removed: this project's
    // Jest environment is the native one, which takes the encrypted-store
    // branch and is persistent whatever the browser has. Removing IndexedDB
    // alone tested nothing — it passed for the wrong reason.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const saved = (globalThis as { indexedDB?: unknown }).indexedDB;
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    try {
      jest.resetModules();
      jest.doMock("react-native", () => ({ Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default } }));
      const { createQueueStore } = require("@/lib/queueStore") as typeof import("@/lib/queueStore");
      expect(createQueueStore().persistent).toBe(false);
    } finally {
      if (saved !== undefined) (globalThis as { indexedDB?: unknown }).indexedDB = saved;
      jest.dontMock("react-native");
      jest.resetModules();
    }
    /* eslint-enable @typescript-eslint/no-require-imports */
  });

  it("on web WITH IndexedDB it is persistent — else the check above passes for the wrong reason", () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const saved = (globalThis as { indexedDB?: unknown }).indexedDB;
    (globalThis as { indexedDB?: unknown }).indexedDB = { open: () => ({}) };
    try {
      jest.resetModules();
      jest.doMock("react-native", () => ({ Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default } }));
      const { createQueueStore } = require("@/lib/queueStore") as typeof import("@/lib/queueStore");
      expect(createQueueStore().persistent).toBe(true);
    } finally {
      if (saved === undefined) delete (globalThis as { indexedDB?: unknown }).indexedDB;
      else (globalThis as { indexedDB?: unknown }).indexedDB = saved;
      jest.dontMock("react-native");
      jest.resetModules();
    }
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
});

/**
 * A-4 (WP-A, v2.3) — the web outbox at rest is ciphertext, as the native one is.
 *
 * `lib/queueStore.ts` said both tiers were encrypted, and only the native one was:
 * the web tier put each entry into IndexedDB as it was, so a capture made offline
 * sat on the disk in Josh's own words for as long as the connection stayed down.
 * Driven on the web branch (`Platform.OS` mocked, as the fallback cases above do)
 * over an in-memory IndexedDB, and asserted on the ROWS as stored rather than on
 * what the queue reads back, because the claim is about the bytes at rest.
 */
describe("A-4 · the web outbox at rest is encrypted like the native one", () => {
  const entry = (offlineId: string, text: string, at = "2026-09-14T10:00:00.000Z"): OutboxEntry => ({
    offlineId,
    method: "POST",
    path: "/brain/dump",
    body: { text, source: "typed", offlineId },
    createdAt: at,
    attempts: 0,
    state: "queued",
  });
  const words = (entries: OutboxEntry[]) => entries.map((e) => (e.body as { text: string }).text);

  function webQueue() {
    jest.resetModules();
    jest.doMock("react-native", () => ({ Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default } }));
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { createQueueStore } = require("@/lib/queueStore") as typeof import("@/lib/queueStore");
    return createQueueStore();
  }

  let fake: ReturnType<typeof installFakeIndexedDb>;
  beforeEach(() => {
    fake = installFakeIndexedDb();
  });
  afterEach(() => {
    fake.restore();
    jest.dontMock("react-native");
    jest.resetModules();
  });

  it("a queued capture's words are not in its IndexedDB row, the row is still keyed by its offlineId, and the queue reads the words back", async () => {
    const q = webQueue();
    await q.put(entry("of-plane", "the words I said on the plane"));
    const rows = fake.rows("jstack", "outbox");
    const raw = JSON.stringify([...rows.values()]);
    expect({ keys: [...rows.keys()], plaintext: raw.includes("the words I said on the plane"), sealed: raw.includes("jstack-enc-v1:"), readBack: words(await q.all()) }).toEqual({
      keys: ["of-plane"],
      plaintext: false,
      sealed: true,
      readBack: ["the words I said on the plane"],
    });
  });

  it("entries still read back in the order they were captured, and remove and clear still work", async () => {
    const q = webQueue();
    await q.put(entry("b", "second", "2026-09-14T10:02:00.000Z"));
    await q.put(entry("a", "first", "2026-09-14T10:01:00.000Z"));
    const ordered = (await q.all()).map((e) => e.offlineId);
    await q.remove("a");
    const afterRemove = (await q.all()).map((e) => e.offlineId);
    await q.clear();
    expect({ ordered, afterRemove, afterClear: await q.all() }).toEqual({ ordered: ["a", "b"], afterRemove: ["b"], afterClear: [] });
  });

  it("an entry queued before the upgrade — plain in IndexedDB — still reads back rather than being lost", async () => {
    const q = webQueue();
    await q.put(entry("new", "sealed after the upgrade", "2026-09-14T10:02:00.000Z"));
    fake.rows("jstack", "outbox").set("old", entry("old", "queued before the upgrade", "2026-09-14T09:00:00.000Z"));
    expect(words(await q.all())).toEqual(["queued before the upgrade", "sealed after the upgrade"]);
  });

  // A-4b (WP-A, v2.3) — QA on A-4: that row was read as it is, and then left plain at rest until it was sent
  it("the first read after the upgrade seals a plain row where it lies, and it still reads back", async () => {
    const q = webQueue();
    await q.all(); // the database exists before the old row is in it, as on a device that queued before the upgrade
    fake.rows("jstack", "outbox").set("old", entry("old", "queued before the upgrade", "2026-09-14T09:00:00.000Z"));
    const firstRead = words(await q.all());
    const raw = JSON.stringify(fake.rows("jstack", "outbox").get("old"));
    expect({ firstRead, plaintext: raw.includes("queued before the upgrade"), sealed: raw.includes("jstack-enc-v1:"), readBack: words(await q.all()) }).toEqual({
      firstRead: ["queued before the upgrade"],
      plaintext: false,
      sealed: true,
      readBack: ["queued before the upgrade"],
    });
  });

  it("a plain row removed while its seal was being made stays removed — sealing never puts back a capture that was sent", async () => {
    const q = webQueue();
    await q.all(); // the database exists before the old row is in it, as on a device that queued before the upgrade
    fake.rows("jstack", "outbox").set("old", entry("old", "queued before the upgrade", "2026-09-14T09:00:00.000Z"));
    const reading = q.all();
    await q.remove("old");
    await reading;
    expect({ left: [...fake.rows("jstack", "outbox").keys()] }).toEqual({ left: [] });
  });
});

/**
 * A-5 (WP-A, v2.3) — on web, a refused capture is kept beside the queue.
 *
 * The reload case in stores/sync.test.ts proves the sync store keeps the list; this
 * proves the web tier under it does: IndexedDB version 2 adds a conflicts store beside
 * the outbox, one sealed row under one key. Saved through one queue store, read through
 * a fresh one over the same database, with no words in the row — and the emergency
 * wipe's clear takes it with the queue.
 */
describe("A-5 · on web, a refused capture is kept beside the queue, sealed, and a fresh store still has it", () => {
  function webQueue() {
    jest.resetModules();
    jest.doMock("react-native", () => ({ Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default } }));
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { createQueueStore } = require("@/lib/queueStore") as typeof import("@/lib/queueStore");
    return createQueueStore();
  }

  let fake: ReturnType<typeof installFakeIndexedDb>;
  beforeEach(() => {
    fake = installFakeIndexedDb();
  });
  afterEach(() => {
    fake.restore();
    jest.dontMock("react-native");
    jest.resetModules();
  });

  it("saved through one store and read through the next, its row holds no words, and clear takes it with the queue", async () => {
    const refused = { offlineId: "of-refused", path: "/brain/dump", localText: "the words the server would not take", serverReason: "changed on the server since you captured this" };
    await webQueue().saveConflicts([refused]);
    const raw = JSON.stringify([...fake.rows("jstack", "conflicts").values()]);
    const next = webQueue();
    const kept = await next.conflicts();
    await next.clear();
    const afterClear = await webQueue().conflicts();
    expect({ kept, plaintext: raw.includes("the words the server would not take"), sealed: raw.includes("jstack-enc-v1:"), afterClear }).toEqual({
      kept: [refused],
      plaintext: false,
      sealed: true,
      afterClear: [],
    });
  });
});

/**
 * A-12 (WP-A, v2.3) — CODE_REVIEW_v23 finding 6: an online write overtook older queued writes to the
 * same record. A queueable write went straight to the network whenever the session was online,
 * whatever was still queued, so on a flaky link an edit that failed and queued was overtaken by the
 * next edit to the same task, and the retry then replayed the older value over the newer one — two
 * valid writes in the wrong order, which the server cannot tell apart. Driven over the mock server,
 * so the last word is the server's own record.
 */
describe("A-12 · an online write never overtakes an older write to the same record (CODE_REVIEW_v23 finding 6)", () => {
  /** the mock server behind a connection whose next `n` requests fail at the network */
  function flakyServer() {
    let failing = 0;
    const inner: Transport = async (req) => {
      if (failing > 0) {
        failing -= 1;
        throw networkError();
      }
      return handle(req);
    };
    return {
      inner,
      failNext: (n = 1) => {
        failing = n;
      },
    };
  }
  const task = (id: string) => dbGet().tasks.find((t) => t.id === id);

  it("an edit that failed and queued is not overtaken: the next edit to the task queues behind it, and after replay the server has the newer title", async () => {
    const server = flakyServer();
    const outbox = withOutbox(server.inner, memoryQueue(), () => true);
    server.failNext();
    const first = await outbox.transport({ method: "PATCH", path: "/tasks/t2", body: { title: "the older title" } });
    const second = await outbox.transport({ method: "PATCH", path: "/tasks/t2", body: { title: "the newer title" } });
    await outbox.replay();
    expect({ first: first.status, second: second.status, title: task("t2")?.title, left: (await outbox.entries()).length }).toEqual({
      first: 202,
      second: 202,
      title: "the newer title",
      left: 0,
    });
  });

  it("the record keeps the order, not the path: a completion that queued is not overtaken by a status edit to the same task", async () => {
    const server = flakyServer();
    const outbox = withOutbox(server.inner, memoryQueue(), () => true);
    server.failNext();
    await outbox.transport({ method: "POST", path: "/tasks/t2/complete", body: { includeSubtasks: true } });
    const reopen = await outbox.transport({ method: "PATCH", path: "/tasks/t2", body: { status: "in_progress" } });
    await outbox.replay();
    expect({ reopen: reopen.status, status: task("t2")?.status }).toEqual({ reopen: 202, status: "in_progress" });
  });

  it("an edit made while the previous one is still on the wire waits its turn, even inside one millisecond: when the first then fails, both replay in the order they were made", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    let calls = 0;
    const inner: Transport = async (req) => {
      calls += 1;
      if (calls === 1) {
        await held;
        throw networkError();
      }
      return handle(req);
    };
    const now = jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-14T12:00:00.000Z"));
    try {
      const outbox = withOutbox(inner, memoryQueue(), () => true);
      const first = outbox.transport({ method: "PATCH", path: "/tasks/t2", body: { title: "the older title" } });
      const second = await outbox.transport({ method: "PATCH", path: "/tasks/t2", body: { title: "the newer title" } });
      release();
      await first;
      await outbox.replay();
      expect({ second: second.status, title: task("t2")?.title }).toEqual({ second: 202, title: "the newer title" });
    } finally {
      now.mockRestore();
    }
  });

  it("the order is kept per record: while one task's edit waits in the queue, an edit to another task still goes straight through", async () => {
    const server = flakyServer();
    const outbox = withOutbox(server.inner, memoryQueue(), () => true);
    server.failNext();
    await outbox.transport({ method: "PATCH", path: "/tasks/t2", body: { title: "waiting its turn" } });
    const other = await outbox.transport({ method: "PATCH", path: "/tasks/t4", body: { title: "straight through" } });
    expect({ other: other.status, title: task("t4")?.title }).toEqual({ other: 200, title: "straight through" });
  });
});

/**
 * WPA-14 (WP-H, v2.3) — the audit's D1 at bffb227f, its web half: after the emergency wipe a capture could still be
 * read. A capture or a refused list still being sealed when the wipe ran was written after the queue had been cleared,
 * and the web cipher key was never deleted, so whatever had been sealed before the wipe still opened after a reload.
 * Driven over the in-memory IndexedDB, with the modules loaded afresh for a reload.
 */
describe("WPA-14 · after the web wipe, nothing the queue held can be read", () => {
  const entry = (offlineId: string, text: string): OutboxEntry => ({
    offlineId,
    method: "POST",
    path: "/brain/dump",
    body: { text, source: "typed", offlineId },
    createdAt: "2026-09-15T05:00:00.000Z",
    attempts: 0,
    state: "queued",
  });
  const words = (entries: OutboxEntry[]) => entries.map((e) => (e.body as { text: string }).text);

  /** the web branch's modules, loaded afresh — what a page reload is */
  function web() {
    jest.resetModules();
    jest.doMock("react-native", () => ({ Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default } }));
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { createQueueStore } = require("@/lib/queueStore") as typeof import("@/lib/queueStore");
    const store = require("@/lib/encryptedStore") as typeof import("@/lib/encryptedStore");
    /* eslint-enable @typescript-eslint/no-require-imports */
    return { queue: createQueueStore(), seal: store.seal, unseal: store.unseal, wipeAllLocalData: store.wipeAllLocalData };
  }

  let fake: ReturnType<typeof installFakeIndexedDb>;
  beforeEach(() => {
    fake = installFakeIndexedDb();
  });
  afterEach(() => {
    fake.restore();
    jest.dontMock("react-native");
    jest.resetModules();
  });

  it("a capture and a refused list still being sealed when the wipe runs are not written after it, and a reload reads neither back", async () => {
    const m = web();
    await m.queue.all(); // the database exists, as on a device that has queued before
    await m.seal("the key is already in use");
    const writing = m.queue.put(entry("in-flight", "the words typed as the phone was taken"));
    const keeping = m.queue.saveConflicts([{ offlineId: "of-refused", path: "/brain/dump", localText: "the words the server would not take", serverReason: "changed on the server" }]);
    await m.wipeAllLocalData(); // lib/emergencyWipe.ts's order: the encrypted store, which counts the wipe, then the queue
    await m.queue.clear();
    await Promise.all([writing, keeping]);
    const again = web();
    expect({
      queueRows: [...fake.rows("jstack", "outbox").keys()],
      conflictRows: [...fake.rows("jstack", "conflicts").keys()],
      readBack: words(await again.queue.all()),
      refused: await again.queue.conflicts(),
    }).toEqual({ queueRows: [], conflictRows: [], readBack: [], refused: [] });
  });

  it("a value sealed before the wipe does not open after a reload, and no key is left in IndexedDB", async () => {
    const m = web();
    const sealed = await m.seal("sealed before the wipe");
    await m.wipeAllLocalData();
    const again = web(); // no key in memory: whatever opens it now reads IndexedDB
    const opened = await again.unseal(sealed);
    expect({ opened, keysLeft: [...fake.rows("jstack-keys", "keys").keys()] }).toEqual({ opened: null, keysLeft: [] });
  });

  it("A-6's rule on web: the wipe forgets the key it deletes, so the next seal mints afresh and what it seals opens after a reload", async () => {
    const m = web();
    const before = await m.seal("sealed before the wipe");
    await m.wipeAllLocalData();
    const after = await m.seal("sealed after the wipe, as after recovery");
    const again = web();
    expect({ before: await again.unseal(before), after: await again.unseal(after), keys: fake.rows("jstack-keys", "keys").size }).toEqual({
      before: null,
      after: "sealed after the wipe, as after recovery",
      keys: 1,
    });
  });

  it("WPA-16: a key mint still under way when the web wipe runs puts no key row back", async () => {
    const m = web(); // a device that has never sealed anything, so this seal mints the key
    const sealing = m.seal("the first words this device ever sealed");
    await m.wipeAllLocalData();
    await sealing;
    expect({ keysLeft: [...fake.rows("jstack-keys", "keys").keys()] }).toEqual({ keysLeft: [] });
  });

  it("a plain row being sealed where it lies (A-4b) as the wipe runs mints no key after it, and nothing of it is at rest", async () => {
    const m = web();
    await m.queue.all(); // the database exists, as on a device that queued before the upgrade
    fake.rows("jstack", "outbox").set("plain-1", entry("plain-1", "written plain before A-4"));
    const again = web(); // a reload: no key in memory, and none at rest
    const reading = again.queue.all();
    await again.wipeAllLocalData();
    await again.queue.clear();
    await reading;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect({ queueRows: fake.rows("jstack", "outbox").size, keysLeft: fake.rows("jstack-keys", "keys").size }).toEqual({ queueRows: 0, keysLeft: 0 });
  });
});

/**
 * WPA-15 (WP-H, v2.3) — the audit's D1, its other half, on both platforms: a capture whose request failed at the network
 * after the emergency wipe went into the wiped device's queue, and its caller was told `{ queued: true }`. While the
 * emergency lock is on the device keeps nothing new — A-13's rule, applied to the queue — and the capture is refused the
 * way a locked write is, so the field keeps its words (A-9). The native branch is in `tests/native/queueStore.test.ts`.
 */
describe("WPA-15 · while the emergency lock is on, the outbox keeps nothing new", () => {
  const words = (entries: OutboxEntry[]) => entries.map((e) => (e.body as { text: string }).text);

  function webQueue() {
    jest.resetModules();
    jest.doMock("react-native", () => ({ Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default } }));
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { createQueueStore } = require("@/lib/queueStore") as typeof import("@/lib/queueStore");
    return createQueueStore();
  }

  let fake: ReturnType<typeof installFakeIndexedDb>;
  beforeEach(() => {
    fake = installFakeIndexedDb();
  });
  afterEach(() => {
    fake.restore();
    jest.dontMock("react-native");
    jest.resetModules();
  });

  it("emergency on, a capture that fails at the network is refused as a locked write, and nothing of it is at rest", async () => {
    const { inner, answer } = fakeInner();
    answer(() => {
      throw networkError();
    });
    const outbox = withOutbox(inner, webQueue(), () => true, () => true);
    const refused = await outbox.transport(dump("typed as the lock landed")).then(() => null, (e: unknown) => e);
    expect({ lockedError: refused instanceof LockedError, path: (refused as LockedError | null)?.path, rows: [...fake.rows("jstack", "outbox").keys()] }).toEqual({
      lockedError: true,
      path: "/brain/dump",
      rows: [],
    });
  });

  it("once recovery clears the emergency state, the same transport queues again with no reload", async () => {
    const { inner, answer } = fakeInner();
    answer(() => {
      throw networkError();
    });
    let emergency = true;
    const queue = webQueue();
    const outbox = withOutbox(inner, queue, () => true, () => emergency);
    await outbox.transport(dump("typed while locked")).catch(() => undefined);
    emergency = false;
    const res = await outbox.transport(dump("typed after recovery"));
    expect({ status: res.status, queued: (res.json as { queued?: boolean }).queued, readBack: words(await queue.all()) }).toEqual({
      status: 202,
      queued: true,
      readBack: ["typed after recovery"],
    });
  });

  it("a lock that lands while the capture is being written is refused after the write, never answered queued", async () => {
    const queue = webQueue();
    let emergency = false;
    const landing: QueueStore = {
      ...queue,
      put: async (entry) => {
        const writing = queue.put(entry);
        emergency = true; // the lock lands during the write
        await writing;
      },
    };
    const outbox = withOutbox(fakeInner().inner, landing, () => false, () => emergency);
    const answer = await outbox.transport(dump("typed as the lock landed")).then(
      (r) => ({ status: r.status, queued: (r.json as { queued?: boolean }).queued === true }),
      (e: unknown) => ({ lockedError: e instanceof LockedError }),
    );
    expect(answer).toEqual({ lockedError: true });
  });

  it("WPA-17: keepConflicts writes nothing while the emergency lock is on — no refused words and no key reach the device", async () => {
    const { inner } = fakeInner();
    const outbox = withOutbox(inner, webQueue(), () => true, () => true);
    await outbox.keepConflicts([{ offlineId: "of-refused", path: "/brain/dump", localText: "the words the server would not take", serverReason: "changed on the server" }]);
    expect({ keptRows: fake.rows("jstack", "conflicts").size, keyRows: fake.rows("jstack-keys", "keys").size }).toEqual({ keptRows: 0, keyRows: 0 });
  });
});
