/**
 * WPI-2 (v2.3.1) — a phone whose runtime gives `lib/encryptedStore.ts` no `crypto.getRandomValues`.
 *
 * Nothing in the v2.3 tree provides it on Hermes (`AUDIT_v23.md`), and the native key mint and every native seal call
 * it. On such a phone an offline capture was refused where the queue should have held it, and a Files load threw its
 * own answer away for the empty cache. Josh: "Important we protect against this failure mode." Driven in the native
 * lane through boot's own sync installer and the outbox `data/provider.ts` builds, over a fresh launch of the app's
 * modules and the AsyncStorage and SecureStore mocks — the runtime's `crypto` is the only thing changed.
 */
import type { SecureStoreStatus } from "@/lib/encryptedStore";

const NATIVE_KEY_ID = "jstack.enc.key.v1";
const OK: SecureStoreStatus = { status: "ok", reason: null };
const unavailable = (reason: string): SecureStoreStatus => ({ status: "unavailable", reason });
const realCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

/**
 * Each case loads the app's modules afresh (`launch()`), and that load is synchronous and CPU-bound: in WPI-2's first full
 * board the first case outran Jest's 5 s default ("Exceeded timeout of 5000 ms for a test"; the file took 56.5 s). So each
 * case carries this budget, sized to that load with room to spare, as A-1b's reachability cases carry theirs; what each
 * asserts is unchanged, and a launch that truly hangs still fails.
 */
const FRESH_APP_CASE_MS = 60_000;

/** the runtime's `crypto` as a phone gives it — `undefined` is Hermes with nothing to provide one */
function runtimeCrypto(value: unknown): void {
  Object.defineProperty(globalThis, "crypto", { configurable: true, writable: true, value });
}

function realRuntimeCrypto(): void {
  if (realCrypto != null) Object.defineProperty(globalThis, "crypto", realCrypto);
  else delete (globalThis as { crypto?: unknown }).crypto;
}

afterEach(() => {
  realRuntimeCrypto();
  jest.resetModules();
});

/** the app's modules loaded afresh — what a launch is — unlocked and online */
function launch() {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { getAdapter, getOutbox } = require("@/data/provider") as typeof import("@/data/provider");
  const { isQueued } = require("@/data/transport/outbox") as typeof import("@/data/transport/outbox");
  const { installSync } = require("@/lib/syncInstall") as typeof import("@/lib/syncInstall");
  const { useSessionStore } = require("@/stores/session") as typeof import("@/stores/session");
  const { useTodayStore } = require("@/stores/today") as typeof import("@/stores/today");
  const { useFilesStore } = require("@/stores/files") as typeof import("@/stores/files");
  const db = require("@/data/mock/db") as typeof import("@/data/mock/db");
  const keychain = require("expo-secure-store") as { getItemAsync: jest.Mock };
  /* eslint-enable @typescript-eslint/no-require-imports */
  db.reset();
  // unlocked: the case is the device's store, not the lock gate
  useSessionStore.setState({ locked: false, online: true, emergency: false });
  return {
    getAdapter,
    getOutbox,
    isQueued,
    installSync,
    useSessionStore,
    useTodayStore,
    useFilesStore,
    brainTexts: () => db.get().brainItems.map((b) => b.text),
    /** what the session store says boot found, or "none" where it says nothing */
    probe: () => (useSessionStore.getState() as { secureStoreStatus?: unknown }).secureStoreStatus ?? "none",
    /** a seal with no key yet reads the Keychain for one first, so each read of it here is a write the store tried */
    sealsTried: () => keychain.getItemAsync.mock.calls.filter(([k]) => k === NATIVE_KEY_ID).length,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("WPI-2 · a phone that cannot seal still runs, keeps nothing offline, and says so", () => {
  it("with no crypto.getRandomValues (Hermes gives no `crypto` at all): boot throws nothing and says unavailable, the queue is held in memory, no write is tried, a Files load shows what it fetched, a capture still goes live and an offline one is held", async () => {
    runtimeCrypto(undefined);
    try {
      const app = launch();
      let booted = true;
      let stop: () => void = () => {};
      try {
        stop = app.installSync();
      } catch {
        booted = false;
      }
      try {
        await settle();
        await app.useTodayStore.getState().load();
        await app.useFilesStore.getState().loadRecent();
        const live = await app.getAdapter().postBrainDump({ text: "said on a phone that cannot seal", source: "typed" });
        app.useSessionStore.setState({ online: false });
        const held = await app
          .getAdapter()
          .postBrainDump({ text: "said offline on that phone", source: "typed" })
          .then(
            (r) => app.isQueued(r),
            () => false,
          );
        expect({
          booted,
          probe: app.probe(),
          persistent: app.getOutbox().persistent,
          sealsTried: app.sealsTried(),
          filesShown: app.useFilesStore.getState().recent.length > 0,
          live: !app.isQueued(live) && app.brainTexts().includes("said on a phone that cannot seal"),
          held,
        }).toEqual({
          booted: true,
          probe: unavailable("crypto.getRandomValues is not provided on this device"),
          persistent: false,
          sealsTried: 0,
          filesShown: true,
          live: true,
          held: true,
        });
      } finally {
        stop();
      }
    } finally {
      realRuntimeCrypto();
    }
  }, FRESH_APP_CASE_MS);

  it("with a crypto.getRandomValues that throws: boot's round trip says unavailable with the reason, and the queue is held in memory", async () => {
    runtimeCrypto({
      getRandomValues: () => {
        throw new Error("getRandomValues is not supported on this runtime");
      },
    });
    try {
      const app = launch();
      const stop = app.installSync();
      try {
        await settle();
        expect({ probe: app.probe(), persistent: app.getOutbox().persistent }).toEqual({
          probe: unavailable("getRandomValues is not supported on this runtime"),
          persistent: false,
        });
      } finally {
        stop();
      }
    } finally {
      realRuntimeCrypto();
    }
  }, FRESH_APP_CASE_MS);

  it("with crypto.getRandomValues present: boot says ok, and the queue is the persistent native one", async () => {
    const app = launch();
    const stop = app.installSync();
    try {
      await settle();
      expect({ probe: app.probe(), persistent: app.getOutbox().persistent }).toEqual({ probe: OK, persistent: true });
    } finally {
      stop();
    }
  }, FRESH_APP_CASE_MS);
});
