/**
 * SY-01 — the sync status derives, and it is a table because the interesting
 * part is the PRECEDENCE between overlapping facts, not any single case.
 *
 * Every row here is a state the app can actually be in: offline with a queue,
 * online mid-replay, a conflict sitting in a drained queue, a failed replay
 * with nothing left to send. Written as one table so that a change to the
 * order of the three tests shows up as several rows moving at once, which is
 * what it would be.
 */
import { syncLabel, syncPhrase, syncStatus, type SyncFacts } from "@/lib/syncStatus";

const settled: SyncFacts = { online: true, queued: 0, syncing: false, conflicts: 0, lastError: null, persistent: true };
const facts = (over: Partial<SyncFacts>): SyncFacts => ({ ...settled, ...over });

describe("SY-01 · the status derives from six facts", () => {
  it.each([
    ["online and nothing queued", "ok", "Sync · ok", {}],
    ["offline with an empty queue", "pending", "Sync · offline", { online: false }],
    ["online with one capture waiting", "pending", "Sync · 1 capture waiting", { queued: 1 }],
    ["online with two captures waiting", "pending", "Sync · 2 captures waiting", { queued: 2 }],
    ["a replay in flight", "pending", "Sync · syncing", { syncing: true }],
    ["offline with two captures waiting", "pending", "Sync · 2 captures waiting", { online: false, queued: 2 }],
    ["a conflict the server would not take", "attention", "Sync · needs attention", { conflicts: 1 }],
    ["a replay that threw", "attention", "Sync · needs attention", { lastError: "Failed to fetch" }],
    // A-7 (WP-A, v2.3): the memory fallback — a closed app forgets every capture it was holding
    ["captures held only in memory", "attention", "Sync · captures are not being saved on this device", { persistent: false }],
  ] as [string, string, string, Partial<SyncFacts>][])("%s → %s", (_name, status, label, over) => {
    expect({ status: syncStatus(facts(over)), label: syncLabel(facts(over)) }).toEqual({ status, label });
  });

  it("attention outranks a queue that is draining, because waiting will not fix it", () => {
    // the state a person is in the second after a reconnect with one refused
    // capture: two things are true and only one of them needs them
    const both = facts({ queued: 3, syncing: true, conflicts: 1 });
    expect({ status: syncStatus(both), phrase: syncPhrase(both) }).toEqual({ status: "attention", phrase: "needs attention" });
  });

  it("a queue that cannot persist outranks everything else the dot could say — the next capture is the one at risk", () => {
    const worst = facts({ persistent: false, conflicts: 1, queued: 2, online: false });
    expect({ status: syncStatus(worst), phrase: syncPhrase(worst) }).toEqual({ status: "attention", phrase: "captures are not being saved on this device" });
  });

  it("offline alone is pending, not ok — nothing is confirmed against a server you cannot reach", () => {
    expect(syncStatus(facts({ online: false }))).toBe("pending");
  });

  it("no phrase prints a status name that is not English on its own", () => {
    // "pending" is a wire word: it names the state to the code and says
    // nothing to a person about which of its three causes they are in
    const everyPending = [{ online: false }, { queued: 2 }, { syncing: true }].map((o) => syncPhrase(facts(o)));
    expect(everyPending).not.toContain("pending");
    expect(new Set(everyPending).size).toBe(3);
  });
});
