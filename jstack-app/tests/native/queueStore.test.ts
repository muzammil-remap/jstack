/**
 * A4R7-05 — the Expo build's outbox queue keeps every write, even two at once.
 *
 * On native the queue is one encrypted key that every `put` and `remove` reads
 * whole and writes back (`lib/queueStore.ts`, `nativeQueue`). Two writes that
 * overlapped each read the same queue and the second write lost the first — a
 * capture made while a replay was removing the entry it had just sent, the
 * flaky-connection case the queue exists for. The web queue is IndexedDB and
 * was never exposed; this runs in the native project, over the real
 * `createQueueStore()` and the AsyncStorage and SecureStore mocks.
 */
import { createQueueStore } from "@/lib/queueStore";
import type { OutboxEntry } from "@/data/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { withOutbox } from "@/data/transport/outbox";
import type { Transport } from "@/data/transport/Transport";
import { wipeAllLocalData } from "@/lib/encryptedStore";
import { LockedError } from "@/lib/lockGate";

const entry = (offlineId: string): OutboxEntry => ({
  offlineId,
  method: "POST",
  path: "/brain/dump",
  body: { text: offlineId, source: "typed", offlineId },
  createdAt: new Date().toISOString(),
  attempts: 0,
  state: "queued",
});

describe("A4R7-05 · the native queue keeps every write", () => {
  it("two captures queued at the same moment are both kept", async () => {
    const q = createQueueStore();
    await q.clear();
    await Promise.all([q.put(entry("a")), q.put(entry("b"))]);
    expect((await q.all()).map((e) => e.offlineId).sort()).toEqual(["a", "b"]);
  });

  it("a remove and a put at the same moment each do exactly their own write", async () => {
    const q = createQueueStore();
    await q.clear();
    await q.put(entry("x"));
    await Promise.all([q.remove("x"), q.put(entry("y"))]);
    expect((await q.all()).map((e) => e.offlineId)).toEqual(["y"]);
  });
});

/**
 * WPA-15 (WP-H, v2.3) — the native branch of the audit's D1: a capture whose request failed at the network after the
 * emergency wipe was written into the wiped device's queue through `encryptedSet`, which minted a fresh key for it.
 * While the emergency lock is on, the outbox refuses it the way a locked write is refused, and nothing reaches the disk.
 */
describe("WPA-15 · on native, while the emergency lock is on, the queue keeps nothing new", () => {
  const keychain = (SecureStore as unknown as { __store: Map<string, string> }).__store;

  it("a capture failing at the network after the wipe is refused as a locked write: no queue on disk, and no key minted for it", async () => {
    await wipeAllLocalData(); // the wiped device: no queue, no key
    const inner: Transport = async () => {
      throw new TypeError("Network request failed");
    };
    const outbox = withOutbox(inner, createQueueStore(), () => true, () => true);
    const refused = await outbox.transport({ method: "POST", path: "/brain/dump", body: { text: "typed as the phone was taken", source: "typed" } }).then(() => null, (e: unknown) => e);
    expect({ lockedError: refused instanceof LockedError, queueOnDisk: await AsyncStorage.getItem("jstack.outbox"), keyMinted: keychain.has("jstack.enc.key.v1") }).toEqual({
      lockedError: true,
      queueOnDisk: null,
      keyMinted: false,
    });
  });
});
