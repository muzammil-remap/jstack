/**
 * LV-03 — every mutating route is refused while the session is locked, and the
 * queue survives the refusal.
 *
 * `hardening.test.ts` already proves the rule on five routes somebody chose by
 * hand. That is the shape of guard V2.1 kept getting caught by (R-05): it is
 * true on the day it is written and silently partial the moment a row adds a
 * sixth write. So this one reads `data/routes.ts` and drives what it finds,
 * which means a route added by a later V2.2 row is covered by construction
 * rather than by somebody remembering to come back here.
 *
 * The rule lives in a pair (rule 16), so both halves are tested: the client
 * gate in `lib/lockGate.ts` that refuses before a request leaves, and the mock
 * server's own 401, which is what a real backend must do when the client gate
 * is bypassed — the case B8-01 actually was.
 */
import { ApiAdapter } from "@/data/ApiAdapter";
import { get as dbGet, reset } from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { buildPath, ROUTES } from "@/data/routes";
import { mockTransport } from "@/data/transport/mock";
import { withOutbox } from "@/data/transport/outbox";
import { assertUnlocked, LockedError, setLockSource } from "@/lib/lockGate";
import { memoryQueue } from "@/lib/queueStore";
import type { OutboxEntry } from "@/data/types";

/** the paths that are how a locked session stops being locked — the passkey ceremony among them (WPF-3) */
const RECOVERY = ["/auth/nonce", "/auth/register-device", "/auth/refresh", "/auth/webauthn/{step}", "/recover"];

const MUTATING = ROUTES.filter((r) => r.method !== "GET");
const READS = ROUTES.filter((r) => r.method === "GET");

/** `{id}` → something harmless; the gate and the 401 are decided before any handler reads it */
const fill = (path: string) => buildPath(path, ["x", "y", "z", "w"]);

beforeEach(() => reset());
afterEach(() => setLockSource(() => false));

describe("LV-03 · the routes table is what this test is driven from", () => {
  it("there really are mutating rows, and the ones we know by name are among them", () => {
    // a filter that quietly matched nothing would make every case below pass
    expect(MUTATING.length).toBeGreaterThan(50);
    expect(READS.length).toBeGreaterThan(20);
    expect(MUTATING.map((r) => r.name)).toEqual(
      expect.arrayContaining(["postLock", "postTask", "patchTask", "postJournal", "putQuietHours"]),
    );
  });

  it("the filter selects a planted mutating row — otherwise its silence proves nothing", () => {
    const planted = [{ method: "POST" }, { method: "GET" }, { method: "DELETE" }] as const;
    expect(planted.filter((r) => r.method !== "GET")).toHaveLength(2);
  });

  it("every mutating row has an adapter method, so the gate is on the path each one takes", () => {
    // ApiAdapter.req() is the single place assertUnlocked is called; a row with
    // no method there would be a write that never passes the boundary
    const missing = MUTATING.filter((r) => typeof (ApiAdapter.prototype as never)[r.name] !== "function");
    expect({ routesWithNoAdapterMethod: missing.map((r) => r.name) }).toEqual({ routesWithNoAdapterMethod: [] });
  });
});

describe("LV-03 · the client gate refuses every mutating route while locked", () => {
  it("throws LockedError for each one", () => {
    setLockSource(() => true);
    const allowed: string[] = [];
    const refused: string[] = [];
    for (const route of MUTATING) {
      const path = fill(route.path);
      try {
        assertUnlocked(route.method, path);
        allowed.push(`${route.method} ${route.path}`);
      } catch (e) {
        expect(e).toBeInstanceOf(LockedError);
        refused.push(`${route.method} ${route.path}`);
      }
    }
    // Pinned as literals rather than read back out of the gate's own allow-list:
    // a test that asks the subject which routes it lets through would agree with
    // it whatever it did (rule 14). These are how a locked session stops being
    // locked — registration, refresh, the passkey ceremony and recovery — plus
    // `/lock` itself: the emergency lock must still be reachable from a locked
    // screen. WPF-3 added the ceremony on purpose; it was the request that opens
    // the lock screen once the server verifies it. Any sixth name here is a hole.
    expect(allowed.sort()).toEqual(["POST /auth/refresh", "POST /auth/register-device", "POST /auth/webauthn/{step}", "POST /lock", "POST /recover"]);
    expect(refused).toHaveLength(MUTATING.length - 5);
  });

  it("does not refuse a read — a locked screen that cannot re-read itself cannot say why it locked", () => {
    setLockSource(() => true);
    for (const route of READS) expect(() => assertUnlocked(route.method, fill(route.path))).not.toThrow();
  });

  it("refuses nothing at all once unlocked", () => {
    setLockSource(() => false);
    for (const route of MUTATING) expect(() => assertUnlocked(route.method, fill(route.path))).not.toThrow();
  });

  it("lets the recovery routes through while locked", () => {
    setLockSource(() => true);
    for (const path of RECOVERY) expect(() => assertUnlocked("POST", path)).not.toThrow();
  });
});

describe("LV-03 · the server half answers 401, for when the client gate is bypassed", () => {
  it("every mutating route is 401 while the mock session is locked", async () => {
    const lock = await handle({ method: "POST", path: "/lock", query: {}, body: { nonce: "n", biometricAssertion: "a" } } as never);
    expect(lock.status).toBe(200);

    const wrong: string[] = [];
    for (const route of MUTATING) {
      // how a locked session opens, and the emergency lock, which stays reachable (WPF-3)
      if (RECOVERY.includes(route.path) || route.path === "/lock") continue;
      const res = await handle({ method: route.method, path: fill(route.path), query: {}, body: {} } as never);
      if (res.status !== 401) wrong.push(`${route.method} ${route.path} → ${res.status}`);
    }
    expect({ notRefusedWith401: wrong }).toEqual({ notRefusedWith401: [] });
  });
});

describe("LV-03 · the queue survives a refusal", () => {
  const seeded: OutboxEntry = {
    offlineId: "seeded-1",
    method: "POST",
    path: "/journal",
    body: { text: "written before the lock", source: "typed" },
    createdAt: "2026-09-07T00:00:00.000Z",
  } as OutboxEntry;

  it("a locked write neither queues nor drains — the entry that was there is still there", async () => {
    const queue = memoryQueue();
    await queue.put(seeded);
    const outbox = withOutbox(mockTransport, queue, () => false); // offline: writes would queue
    const adapter = new ApiAdapter(outbox.transport);

    setLockSource(() => true);
    await expect(adapter.postJournal({ text: "written while locked", source: "typed" })).rejects.toBeInstanceOf(LockedError);

    const entries = await outbox.entries();
    expect(entries.map((e) => e.offlineId)).toEqual(["seeded-1"]);
  });

  it("the same write queues once unlocked, so the refusal above was the lock and not the plumbing", async () => {
    const queue = memoryQueue();
    const outbox = withOutbox(mockTransport, queue, () => false);
    const adapter = new ApiAdapter(outbox.transport);

    setLockSource(() => false);
    await adapter.postJournal({ text: "written while offline", source: "typed" }).catch(() => undefined);

    expect((await outbox.entries()).length).toBeGreaterThan(0);
  });

  it("a locked write leaves the record untouched", async () => {
    const before = JSON.stringify(dbGet().tasks);
    setLockSource(() => true);
    await expect(new ApiAdapter(mockTransport).patchTask("t1", { title: "changed while locked" })).rejects.toBeInstanceOf(LockedError);
    expect(JSON.stringify(dbGet().tasks)).toBe(before);
  });
});

describe("WPF-3 · the passkey ceremony and the emergency lock work while locked, on both halves", () => {
  it("the client gate lets the passkey ceremony through while locked", () => {
    setLockSource(() => true);
    expect(() => assertUnlocked("POST", "/auth/webauthn/assertion")).not.toThrow();
  });

  it("the server answers the passkey ceremony and a second emergency lock while locked, rather than 401", async () => {
    const high = { nonce: "n", biometricAssertion: "a" };
    expect((await handle({ method: "POST", path: "/lock", query: {}, body: high } as never)).status).toBe(200);
    const ceremony = await handle({ method: "POST", path: "/auth/webauthn/assertion", query: {}, body: {} } as never);
    const again = await handle({ method: "POST", path: "/lock", query: {}, body: high } as never);
    await handle({ method: "POST", path: "/recover", query: {}, body: { recoveryKey: "k", ...high } } as never);
    expect({ ceremony: ceremony.status, again: again.status }).toEqual({ ceremony: 200, again: 200 });
  });
});
