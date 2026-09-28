/**
 * R-05 (A-0 review) — the outbox is a write too, and the lock gate covers it.
 *
 * `ApiAdapter.request()` refuses every write while the session is locked
 * (CD-14, `lib/lockGate.ts`), but `stores/sync.ts` drove `replay()` straight
 * into the inner transport on every reconnect and focus, with no lock check —
 * so a locked device that regained a connection sent its queue around the
 * gate. Worse: the mock answers 401 to writes while locked, and the old
 * replay deleted an entry on any non-409 4xx, so an auto-lock on the train
 * followed by a tunnel exit purged every capture with no record. Asserted on
 * state: the queue, the server's records, and the store's own counters.
 */
import { ApiAdapter } from "@/data/ApiAdapter";
import { handle } from "@/data/mock/server";
import { useTodayStore } from "@/stores/today";
import type { Transport, TransportRequest } from "@/data/transport/Transport";
import { get as dbGet, reset as resetDb } from "@/data/mock/db";
import { getAdapter, getOutbox } from "@/data/provider";
import { isQueued } from "@/data/transport/outbox";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import { installSync } from "@/lib/syncInstall";
import { syncStatus } from "@/lib/syncStatus";
import type { OutboxEntry } from "@/data/types";
import { installFakeIndexedDb } from "../fakeIndexedDb";

async function drain(): Promise<void> {
  // leave nothing queued for the next test — the outbox is a module singleton
  useSessionStore.setState({ locked: false, online: true });
  await getOutbox().replay();
}

beforeEach(async () => {
  // drain FIRST: a test that proves "nothing was replayed" leaves its entry
  // queued on purpose, and draining after the reset would file it into the
  // next test's fresh database
  await drain();
  resetDb();
  useSyncStore.setState({ entriesNow: [], queued: 0, conflicts: [], lastSyncAt: null, lastError: null, syncing: false });
});

async function captureOffline(text: string): Promise<void> {
  useSessionStore.setState({ locked: false, online: false });
  const res = await getAdapter().postBrainDump({ text, source: "typed" });
  expect(isQueued(res)).toBe(true);
}

const dumpsOnServer = () => dbGet().brainItems.filter((b) => b.text === "captured before the lock").length;

/**
 * WPI-3 (v2.3.1): a case below that loads the app's modules afresh and then waits on a timer — A-5's reloads, WPA-17's four
 * that settle after a Dismiss, WPA-15's two — spends most of its time in that load, which is synchronous and CPU-bound.
 * Beside other sessions' boards it outran Jest's 5 s default and went red on "Exceeded timeout of 5000 ms for a test",
 * run alone as well as in a board: WPA-15's web case at 8918 ms, its native twin at 16798 ms, WPA-17's native case in
 * three of four loaded full runs. So each of those seven carries this budget, sized to that load with room to spare (the
 * slowest seen beside a board was 16.8 s) and the same as A-1b's two reachability cases, which load the app afresh too;
 * what each asserts is unchanged, and a load that truly hangs still fails. A-7's memory-only sync store and WPA-17's wipe
 * case load the app afresh too but carry none: nothing in either waits on a timer, so Jest's timeout cannot interrupt
 * them however long the load takes — with the budget planted to 1 ms, both still passed.
 */
const FRESH_APP_CASE_MS = 60_000;

describe("R-05 · no replay leaves a locked device", () => {
  it("syncNow is a no-op while locked — the capture stays queued and reaches no server", async () => {
    await captureOffline("captured before the lock");
    expect(await getOutbox().entries()).toHaveLength(1);

    useSessionStore.setState({ locked: true, online: true });
    await useSyncStore.getState().syncNow();

    expect(await getOutbox().entries()).toHaveLength(1);
    expect(dumpsOnServer()).toBe(0);
    expect(useSyncStore.getState().syncing).toBe(false);
  });

  it("unlocking is a reconnect: the queue drains once the gate opens", async () => {
    await captureOffline("captured before the lock");
    useSessionStore.setState({ locked: true, online: true });
    const stop = installSync();
    try {
      await useSyncStore.getState().syncNow();
      expect(await getOutbox().entries()).toHaveLength(1);

      useSessionStore.getState().unlock();
      // the subscription fires synchronously; the replay it starts is async
      await new Promise((r) => setTimeout(r, 50));

      expect(await getOutbox().entries()).toHaveLength(0);
      expect(dumpsOnServer()).toBe(1);
      expect(useSyncStore.getState().lastSyncAt).not.toBeNull();
    } finally {
      stop();
    }
  });

  it("an emergency lock holds the queue too — it is a lock", async () => {
    await captureOffline("captured before the lock");
    useSessionStore.setState({ locked: true, emergency: true, online: true });
    await useSyncStore.getState().syncNow();
    expect(await getOutbox().entries()).toHaveLength(1);
    expect(dumpsOnServer()).toBe(0);
    useSessionStore.setState({ emergency: false });
  });
});

/**
 * CD-02 (OF-A, carried from V2.1) — the composites ask what changed since we
 * last looked, and the answer is read.
 *
 * OF-09 says each composite is refetched with `?since=seenAt` on reconnect and
 * focus, and that the response's `delta` names what changed. V2.1 built the
 * half a person sees — the refetch happens, the delta line renders — and none
 * of the wire half: the app sent plain GETs and no `delta` existed to read, so
 * a real backend implementing §4.12 would have had its deltas ignored. The row
 * was carried rather than faked, and OF-09 was recorded PARTIAL.
 *
 * `since` is sent on a REFETCH, never on the first load, which is what OF-09
 * actually says. Before the first response there is no `seenAt` to send, and
 * the server's own sentence is what a cold open should show.
 */
describe("CD-02 · the composites send ?since= and the delta is read (OF-09)", () => {
  const seen: TransportRequest[] = [];
  const spy: Transport = async (req) => {
    seen.push(req);
    return handle(req);
  };
  const adapter = () => new ApiAdapter(spy);

  beforeEach(() => {
    seen.length = 0;
  });

  const queryFor = (path: string) => seen.find((r) => r.path === path)?.query ?? {};

  it("every one of the four composites carries ?since=<seenAt> on a refetch", async () => {
    const since = "2026-09-06T21:00:00.000Z";
    const a = adapter();
    await a.getToday(undefined, since);
    await a.getTasks({}, since);
    await a.getBrainLatest(undefined, since);
    await a.getAgentFeed(24, since);

    // pinned as the four literal paths §4.12 names, not read back out of the
    // route table: the claim is about these four, and a table that lost one
    // should fail here rather than quietly shrink the test
    expect(queryFor("/today").since).toBe(since);
    expect(queryFor("/tasks").since).toBe(since);
    expect(queryFor("/brain/latest").since).toBe(since);
    expect(queryFor("/agents/feed").since).toBe(since);
  });

  it("the three stores take the same `{ since: string }` option, so the reconnect passes one value (P-10, F-17)", async () => {
    const since = "2026-09-06T21:00:00.000Z";
    const today = jest.spyOn(getAdapter(), "getToday");
    try {
      await useTodayStore.getState().load(undefined, { since });
      expect(today).toHaveBeenCalledWith(undefined, since);
    } finally {
      today.mockRestore();
    }
  });

  it("a first load sends no since — there is nothing seen yet to ask about", async () => {
    await adapter().getToday();
    expect(queryFor("/today").since).toBeUndefined();
  });

  it("the server answers a since request with a delta naming what changed", async () => {
    const composite = await adapter().getToday();
    expect(composite.delta).toBeUndefined();

    const after = await adapter().getToday(undefined, composite.seenAt);
    expect(after.delta).toEqual({
      added: expect.any(Array),
      changed: expect.any(Array),
      removed: expect.any(Array),
    });

    // Asked from far enough back that everything in the fixture postdates it,
    // the delta cannot be empty — which is what stops the case above from
    // passing on a handler that returns three empty arrays and calls it a day.
    const everything = await adapter().getToday(undefined, "2020-01-01T00:00:00.000Z");
    expect((everything.delta?.added.length ?? 0) + (everything.delta?.changed.length ?? 0)).toBeGreaterThan(0);
  });

  it("the ids in the delta are real records, not invented", async () => {
    const after = await adapter().getToday(undefined, "2020-01-01T00:00:00.000Z");
    const known = new Set([
      ...dbGet().actions.map((a) => a.id),
      ...dbGet().tasks.map((t) => t.id),
      ...dbGet().brainItems.map((b) => b.id),
    ]);
    const named = [...(after.delta?.added ?? []), ...(after.delta?.changed ?? [])];
    expect(named.filter((id) => !known.has(id))).toEqual([]);
  });

  it("a cold open shows the server's sentence; a refetch stops using it", async () => {
    await useTodayStore.getState().load();
    const cold = useTodayStore.getState();
    expect(cold.composite?.delta).toBeUndefined();
    expect(cold.deltaLine()).toBe(cold.composite?.since);

    await useTodayStore.getState().load(undefined, { since: cold.composite?.seenAt });
    const warm = useTodayStore.getState();
    expect(warm.composite?.delta).toBeDefined();
    // the line is now the app's own, composed from what the server said moved,
    // instead of a sentence the server wrote about its own idea of "last look"
    expect(warm.deltaLine()).not.toBe(warm.composite?.since);
  });

  it("the line counts exactly what the delta names, and says so plainly when nothing moved", async () => {
    await useTodayStore.getState().load();
    const base = useTodayStore.getState().composite!;

    useTodayStore.setState({ composite: { ...base, delta: { added: ["a1"], changed: ["b1", "b2"], removed: [] } } });
    expect(useTodayStore.getState().deltaLine()).toBe("Since you last looked: 1 new, 2 changed.");

    useTodayStore.setState({ composite: { ...base, delta: { added: [], changed: [], removed: ["g1"] } } });
    expect(useTodayStore.getState().deltaLine()).toBe("Since you last looked: 1 gone.");

    // an empty delta is an answer, not a missing one — the day-1 fixture
    // reaches this branch, so it is the case a person is most likely to see
    useTodayStore.setState({ composite: { ...base, delta: { added: [], changed: [], removed: [] } } });
    expect(useTodayStore.getState().deltaLine()).toBe("Nothing changed while you were away.");
  });
});

/**
 * SY-01, the store's half of it. The selector's table proves what `lastError`
 * MEANS; this proves the store ever sets it — a field nothing writes is a
 * status that can never be reached, which is the shape of defect rule 15 is
 * about.
 */
describe("SY-01 · a replay that throws is recorded, and cleared by one that does not", () => {
  it("the message lands in lastError and the dot reads attention", async () => {
    useSessionStore.setState({ locked: false, online: true });
    const outbox = getOutbox();
    const replay = jest.spyOn(outbox, "replay").mockRejectedValueOnce(new Error("Failed to fetch"));
    try {
      await useSyncStore.getState().syncNow();
    } finally {
      replay.mockRestore();
    }

    const s = useSyncStore.getState();
    expect({ lastError: s.lastError, syncing: s.syncing }).toEqual({ lastError: "Failed to fetch", syncing: false });
    // and the state the person is shown, through the one selector that decides
    expect(syncStatus({ online: true, queued: s.queued, syncing: s.syncing, conflicts: s.conflicts.length, lastError: s.lastError, persistent: s.persistent })).toBe("attention");
  });

  it("the next replay that gets through clears it", async () => {
    useSyncStore.setState({ lastError: "Failed to fetch" });
    useSessionStore.setState({ locked: false, online: true });
    await useSyncStore.getState().syncNow();
    expect(useSyncStore.getState().lastError).toBeNull();
  });

  it("syncNow does not throw at its callers — a timer has nowhere to put an error", async () => {
    useSessionStore.setState({ locked: false, online: true });
    const replay = jest.spyOn(getOutbox(), "replay").mockRejectedValueOnce(new Error("boom"));
    try {
      await expect(useSyncStore.getState().syncNow()).resolves.toBeUndefined();
    } finally {
      replay.mockRestore();
    }
  });
});

describe("WPF-2 · a server that says when to come back is not asked before then", () => {
  it("after a replay told to wait, syncNow does not replay again until the wait is over", async () => {
    useSessionStore.setState({ locked: false, online: true });
    const replay = jest.spyOn(getOutbox(), "replay").mockResolvedValue({ sent: 0, conflicts: [], retryAfterMs: 60_000 });
    try {
      await useSyncStore.getState().syncNow();
      await useSyncStore.getState().syncNow();
      expect(replay).toHaveBeenCalledTimes(1);
    } finally {
      replay.mockRestore();
      useSyncStore.setState({ retryAt: null });
    }
  });
});

/**
 * A-5 (WP-A, v2.3) — A4R7-08: a capture the server refuses survives a reload.
 *
 * A refusal leaves the queue and goes on the conflict list with the server's
 * reason, which is how no capture is dropped in silence (OF-07). But the list
 * lived only in this store's memory, so a reload — the app killed on the plane,
 * the tab closed on the train — dropped the words anyway, later and quietly.
 * The e2e OF-07 pattern in unit form: refuse, then load the app's sync modules
 * again over the SAME device storage (a reload loses memory, not the disk), boot
 * them the way the app does, and the row is still there with its words; Dismiss
 * clears it for good.
 */
describe("A-5 · a refused capture survives a reload (A4R7-08)", () => {
  /** the app's sync modules, loaded afresh over this device's storage — what a reload is */
  function reloadApp() {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const storage = require("@react-native-async-storage/async-storage") as unknown;
    const keychain = require("expo-secure-store") as unknown;
    let fresh: { install: typeof installSync; sync: typeof useSyncStore } | undefined;
    jest.isolateModules(() => {
      jest.doMock("@react-native-async-storage/async-storage", () => storage);
      jest.doMock("expo-secure-store", () => keychain);
      fresh = {
        install: (require("@/lib/syncInstall") as typeof import("@/lib/syncInstall")).installSync,
        sync: (require("@/stores/sync") as typeof import("@/stores/sync")).useSyncStore,
      };
    });
    /* eslint-enable @typescript-eslint/no-require-imports */
    jest.dontMock("@react-native-async-storage/async-storage");
    jest.dontMock("expo-secure-store");
    return fresh!;
  }

  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  };

  /** reload, boot, let the boot's reads land, look — then tear the boot down */
  async function afterReload<T>(look: (app: ReturnType<typeof reloadApp>) => T): Promise<T> {
    const app = reloadApp();
    const stop = app.install();
    try {
      await settle();
      const seen = look(app);
      await settle();
      return seen;
    } finally {
      stop();
    }
  }

  it("refused, then reloaded: the row is still there with its words and the server's reason, and Dismiss clears it for good", async () => {
    await captureOffline("the words the server would not take");
    const [entry] = await getOutbox().entries();
    dbGet().conflicting.push(entry.offlineId);
    useSessionStore.setState({ locked: false, online: true });
    await useSyncStore.getState().syncNow();
    const before = useSyncStore.getState().conflicts.map((c) => c.localText);

    const reloaded = await afterReload((app) => app.sync.getState().conflicts.map((c) => ({ words: c.localText, reason: c.serverReason })));
    await afterReload((app) => app.sync.getState().dismissConflict(entry.offlineId));
    const afterDismiss = await afterReload((app) => app.sync.getState().conflicts.length);

    expect({ before, reloaded, afterDismiss }).toEqual({
      before: ["the words the server would not take"],
      reloaded: [{ words: "the words the server would not take", reason: "changed on the server since you captured this" }],
      afterDismiss: 0,
    });
  }, FRESH_APP_CASE_MS);
});

/**
 * A-7 (WP-A, v2.3) — the memory fallback reaches the facts the dot reads. The queue store set
 * `persistent: false` on its memory tier and nothing read it, so a browser that gave the app no
 * IndexedDB held captures in memory while the dot said ok. Which tier is chosen is
 * `outbox.test.ts`'s to prove; this proves the sync store hears what the tier says.
 */
describe("A-7 · a queue held only in memory reaches the sync store", () => {
  it("the device's own queue reads persistent and a memory-only one does not, so its status is attention", async () => {
    await useSyncStore.getState().refresh();
    const device = useSyncStore.getState().persistent;

    // the app's sync modules loaded afresh over a queue store that could only offer memory
    /* eslint-disable @typescript-eslint/no-require-imports */
    let memorySync: typeof useSyncStore | undefined;
    jest.isolateModules(() => {
      jest.doMock("@/lib/queueStore", () => {
        const actual = jest.requireActual("@/lib/queueStore") as typeof import("@/lib/queueStore");
        return { ...actual, createQueueStore: () => actual.memoryQueue() };
      });
      memorySync = (require("@/stores/sync") as typeof import("@/stores/sync")).useSyncStore;
    });
    /* eslint-enable @typescript-eslint/no-require-imports */
    jest.dontMock("@/lib/queueStore");

    await memorySync!.getState().refresh();
    const s = memorySync!.getState();
    const status = syncStatus({ online: true, queued: s.queued, syncing: s.syncing, conflicts: s.conflicts.length, lastError: s.lastError, persistent: s.persistent });
    expect({ device, memory: s.persistent, status }).toEqual({ device: true, memory: false, status: "attention" });
  });
});

/**
 * WPA-17 (WP-H, v2.3) — QA's probe at c30c91ff, one more writer of the audit's D1: after the emergency wipe, Settings ›
 * Sync's Dismiss wrote the other refused captures' words back to the device. The wipe emptied storage but not this
 * store's in-memory list, and the outbox's `keepConflicts` had no look at the lock, so `saveConflicts` sealed the rest
 * under a freshly minted key. Driven through the app's own wiring — `wipeThisDevice`, `data/provider.ts`'s outbox, the
 * session and sync stores — loaded afresh per platform.
 */
describe("WPA-17 · a refused capture dismissed after the wipe writes nothing back", () => {
  const conflict = (offlineId: string, localText: string) => ({ offlineId, path: "/brain/dump", localText, serverReason: "changed on the server" });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

  /** the app's modules loaded afresh — what a reload is — with Platform.OS set before anything under test reads it */
  function app(os: "web" | "ios") {
    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-require-imports */
    const RN = require("react-native") as { Platform: { OS: string } };
    const { createQueueStore } = require("@/lib/queueStore") as typeof import("@/lib/queueStore");
    const { wipeThisDevice } = require("@/lib/emergencyWipe") as typeof import("@/lib/emergencyWipe");
    const session = require("@/stores/session") as typeof import("@/stores/session");
    const sync = require("@/stores/sync") as typeof import("@/stores/sync");
    const asMod = require("@react-native-async-storage/async-storage") as { default?: unknown };
    const keychain = (require("expo-secure-store") as { __store: Map<string, string> }).__store;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const AsyncStorage = (asMod.default ?? asMod) as { getItem: (k: string) => Promise<string | null> };
    RN.Platform.OS = os;
    return { createQueueStore, wipeThisDevice, useSessionStore: session.useSessionStore, useSyncStore: sync.useSyncStore, AsyncStorage, keychain };
  }

  let fake: ReturnType<typeof installFakeIndexedDb>;
  beforeEach(() => {
    fake = installFakeIndexedDb();
  });
  afterEach(() => {
    fake.restore();
    jest.resetModules();
  });

  /** the Dismiss after the wipe, under the lock, as Settings › Sync makes it */
  async function dismissAfterTheWipe(m: ReturnType<typeof app>) {
    m.useSessionStore.setState({ emergency: true, locked: true });
    m.useSyncStore.setState({ conflicts: [conflict("of-1", "the first refused words"), conflict("of-2", "the second refused words")] });
    await m.wipeThisDevice();
    m.useSyncStore.getState().dismissConflict("of-1");
    await settle();
  }

  it("web: nothing of the refused list is at rest, no key row is left, and a reload reads no refused words", async () => {
    await dismissAfterTheWipe(app("web"));
    const again = app("web");
    expect({ conflictRows: fake.rows("jstack", "conflicts").size, keyRows: fake.rows("jstack-keys", "keys").size, readBack: (await again.createQueueStore().conflicts()).length }).toEqual({
      conflictRows: 0,
      keyRows: 0,
      readBack: 0,
    });
  }, FRESH_APP_CASE_MS);

  it("native: no refused list on disk, and no key minted for one", async () => {
    const m = app("ios");
    await dismissAfterTheWipe(m);
    expect({ listOnDisk: (await m.AsyncStorage.getItem("jstack.outbox.conflicts")) != null, keyMinted: m.keychain.has("jstack.enc.key.v1") }).toEqual({ listOnDisk: false, keyMinted: false });
  }, FRESH_APP_CASE_MS);

  it("web: under a lock that wiped nothing, a Dismiss rewrites no list at rest and mints no key", async () => {
    const m = app("web");
    const list = [conflict("of-1", "the first refused words"), conflict("of-2", "the second refused words")];
    await m.createQueueStore().saveConflicts(list); // the list this device already keeps
    const before = JSON.stringify(fake.rows("jstack", "conflicts").get("list"));
    m.useSyncStore.setState({ conflicts: list });
    m.useSessionStore.setState({ emergency: true, locked: true }); // the unconfirmed lock: nothing has been wiped
    m.useSyncStore.getState().dismissConflict("of-1");
    await settle();
    expect({ listRewritten: JSON.stringify(fake.rows("jstack", "conflicts").get("list")) !== before, keyRows: fake.rows("jstack-keys", "keys").size }).toEqual({
      listRewritten: false,
      keyRows: 1,
    });
  }, FRESH_APP_CASE_MS);

  it("native: under a lock that wiped nothing, a Dismiss rewrites no list on disk and mints no key", async () => {
    const m = app("ios");
    const list = [conflict("of-1", "the first refused words"), conflict("of-2", "the second refused words")];
    await m.createQueueStore().saveConflicts(list); // the list this device already keeps
    const before = await m.AsyncStorage.getItem("jstack.outbox.conflicts");
    const keyBefore = m.keychain.get("jstack.enc.key.v1");
    m.useSyncStore.setState({ conflicts: list });
    m.useSessionStore.setState({ emergency: true, locked: true }); // the unconfirmed lock: nothing has been wiped
    m.useSyncStore.getState().dismissConflict("of-1");
    await settle();
    expect({ listRewritten: (await m.AsyncStorage.getItem("jstack.outbox.conflicts")) !== before, keyChanged: m.keychain.get("jstack.enc.key.v1") !== keyBefore }).toEqual({
      listRewritten: false,
      keyChanged: false,
    });
  }, FRESH_APP_CASE_MS);

  it("the wipe empties what this store holds of the wiped queue: the refused words, the queued rows and their count", async () => {
    const m = app("ios");
    const waiting: OutboxEntry = {
      offlineId: "q-1",
      method: "POST",
      path: "/brain/dump",
      body: { text: "a capture still waiting", source: "typed", offlineId: "q-1" },
      createdAt: "2026-09-15T06:00:00.000Z",
      attempts: 0,
      state: "queued",
    };
    m.useSyncStore.setState({ conflicts: [conflict("of-1", "the first refused words"), conflict("of-2", "the second refused words")], entriesNow: [waiting], queued: 1 });
    await m.wipeThisDevice();
    const s = m.useSyncStore.getState();
    expect({ conflicts: s.conflicts.length, entriesNow: s.entriesNow.length, queued: s.queued }).toEqual({ conflicts: 0, entriesNow: 0, queued: 0 });
  });
});

/**
 * WPA-15 (WP-H, v2.3) — the fourth argument `data/provider.ts` hands `withOutbox`, which no case of its own held (QA at
 * c30c91ff): `withOutbox` defaults `isEmergency` to `() => false`, so an edit of `build()` that dropped it would reopen
 * the queue under the lock with only a fingerprint going red. Driven through the outbox the provider builds and the
 * session store's own `emergency`, loaded afresh per platform. The refusal after the write is `outbox.test.ts`'s.
 */
describe("WPA-15 · the app's own outbox, under the emergency lock", () => {
  const dump = (text: string): TransportRequest => ({ method: "POST", path: "/brain/dump", body: { text, source: "typed" } });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

  /** the app's modules loaded afresh, with Platform.OS set before anything under test reads it */
  function app(os: "web" | "ios") {
    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-require-imports */
    const RN = require("react-native") as { Platform: { OS: string } };
    const provider = require("@/data/provider") as typeof import("@/data/provider");
    const { LockedError } = require("@/lib/lockGate") as typeof import("@/lib/lockGate");
    const session = require("@/stores/session") as typeof import("@/stores/session");
    const asMod = require("@react-native-async-storage/async-storage") as { default?: unknown };
    const keychain = (require("expo-secure-store") as { __store: Map<string, string> }).__store;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const AsyncStorage = (asMod.default ?? asMod) as { getItem: (k: string) => Promise<string | null> };
    RN.Platform.OS = os;
    return { outbox: provider.getOutbox, LockedError, useSessionStore: session.useSessionStore, AsyncStorage, keychain };
  }

  let fake: ReturnType<typeof installFakeIndexedDb>;
  beforeEach(() => {
    fake = installFakeIndexedDb();
  });
  afterEach(() => {
    fake.restore();
    jest.resetModules();
  });

  /** a capture made under the lock through the outbox data/provider.ts builds, and what its caller was told */
  async function captureUnderTheLock(m: ReturnType<typeof app>) {
    m.useSessionStore.setState({ emergency: true, online: false });
    const answer = await m
      .outbox()
      .transport(dump("typed under the lock"))
      .then(
        (r) => ({ status: r.status }),
        (e: unknown) => ({ lockedError: e instanceof m.LockedError }),
      );
    await settle();
    return answer;
  }

  it("web: refused as a locked write, and nothing of it — no queued row, no key row — is at rest", async () => {
    const answer = await captureUnderTheLock(app("web"));
    expect({ answer, queueRows: fake.rows("jstack", "outbox").size, keyRows: fake.rows("jstack-keys", "keys").size }).toEqual({
      answer: { lockedError: true },
      queueRows: 0,
      keyRows: 0,
    });
  }, FRESH_APP_CASE_MS);

  it("native: refused as a locked write — no queue on disk, and no key minted for it", async () => {
    const m = app("ios");
    const answer = await captureUnderTheLock(m);
    expect({ answer, queueOnDisk: (await m.AsyncStorage.getItem("jstack.outbox")) != null, keyMinted: m.keychain.has("jstack.enc.key.v1") }).toEqual({
      answer: { lockedError: true },
      queueOnDisk: false,
      keyMinted: false,
    });
  }, FRESH_APP_CASE_MS);
});
