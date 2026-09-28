/**
 * sync.ts (ADR-37, O-1) — what is waiting to reach the server, and what
 * happened when it tried.
 *
 * Separate from `stores/session.ts` on purpose. `online` is about this
 * session and lives there; a queue of captures outlives any session, which is
 * the point of persisting it. The two are also read by different surfaces for
 * different reasons — the health line and the disabled verbs read `online`,
 * Settings › Sync reads this.
 *
 * The rules that matter:
 *
 *  - Replay happens on reconnect, on unlock, on focus, and on a 30-second
 *    timer WHILE something is queued (`lib/syncInstall.ts` wires those, P-10). Not on a timer otherwise: a poll that
 *    runs when there is nothing to send is a battery cost with no benefit.
 *    While the app believes it is offline that timer PROBES first — one cheap
 *    read, because a phone has no `online` event to say it is back (A-1).
 *  - Never while locked (R-05). The queue is a write; the lock gate covers it.
 *  - Only one replay at a time. Two overlapping replays send the same entry
 *    twice, and while the server dedupes it, the toast would count it twice
 *    and the stores would reload twice for one capture.
 *  - After a replay that sent anything, the affected stores reload ONCE each
 *    (OF-05) and the toast says how many. After one that sent nothing, in
 *    silence — a reconnect is not news.
 */
import { create } from "zustand";
import { getAdapter, getOutbox } from "@/data/provider";
import { QUEUED_META, type Conflict } from "@/data/transport/outbox";
import type { OutboxEntry } from "@/data/types";
import { useBrainStore } from "@/stores/brain";
import { useFilesStore } from "@/stores/files";
import { useLifeStore } from "@/stores/life";
import { useParametersStore } from "@/stores/parameters";
import { useSessionStore } from "@/stores/session";
import { useTasksStore } from "@/stores/tasks";
import { useTodayStore } from "@/stores/today";

/** While anything is queued, try again this often (OF-04). `lib/syncInstall.ts` runs the timer. */
export const RETRY_MS = 30_000;

type SyncState = {
  /**
   * The queue itself, kept in state so surfaces can render it (O-2, OF-02/03).
   *
   * The optimistic row IS the queued entry. The alternative — writing a shadow
   * record into each store and remembering to remove it on replay — is five
   * places to get wrong and a second copy of the truth. When the queue drains
   * these disappear and the reload brings the real records, which is exactly
   * the transition the person should see.
   */
  entriesNow: OutboxEntry[];
  queued: number;
  conflicts: Conflict[];
  lastSyncAt: string | null;
  /** Why the last replay did not finish, or null (SY-01). A replay that THREW
   * is not one that found a conflict: the queue is intact and the server said
   * nothing, so without this nobody is ever told. Cleared by the next replay
   * that gets through — a fault that has stopped is not one to keep a dot for. */
  lastError: string | null;
  /** True while a replay is in flight — see "only one replay at a time". */
  syncing: boolean;
  /** WPF-2: a server that answered with `retryAfter` is not asked again before this (epoch ms) */
  retryAt: number | null;
  /** A-7: false when the outbox is held in memory only, read at each refresh — `lib/syncStatus.ts` makes it attention */
  persistent: boolean;
  entries: () => Promise<OutboxEntry[]>;
  refresh: () => Promise<void>;
  /** A-5: the refused captures the device kept, loaded once at boot (`lib/syncInstall.ts`) */
  loadConflicts: () => Promise<void>;
  /** A-1: one cheap read while offline, so the transport has an answer to
   * hear (`data/transport/reachability.ts` moves `session.online` on it). */
  probe: () => Promise<void>;
  syncNow: () => Promise<void>;
  dismissConflict: (offlineId: string) => void;
};

async function reloadAffected(): Promise<void> {
  // OF-09: this IS the reconnect-and-focus refetch, so it is where the
  // composites ask what changed. One `seenAt` for all of them — it says when
  // this PERSON last looked, not when an endpoint was last read — carried on
  // the Today composite, which is the only one whose shape can hold it.
  // Absent on the very first pass, and absent is correct: nothing has been
  // seen yet to have missed anything since.
  const seenAt = useTodayStore.getState().composite?.seenAt;

  // Once each, in parallel: a replay may have touched captures across five
  // surfaces and the person is waiting to see them settle.
  //
  // X-1 (B-52): files are one of them. An upload made offline is a capture
  // like any other and replays with the rest, but nothing reloaded the files
  // store afterwards — so the file was on the server and the section that
  // lists it still said what it said before the connection came back, until
  // something else happened to reload the tab. A queue that drains invisibly
  // is the same defect as a queue that does not drain: the person cannot tell.
  await Promise.all([
    useTodayStore.getState().load(undefined, { since: seenAt }),
    useTasksStore.getState().load(undefined, { since: seenAt }),
    useBrainStore.getState().load(undefined, { since: seenAt }),
    useLifeStore.getState().load(),
    useFilesStore.getState().loadRecent(),
    // A4R7-02: a parameter is a capture too, and a refused one left the device
    // enforcing the value the server had just said no to
    useParametersStore.getState().load(),
  ]).catch(() => {
    // a failed reload leaves the last good data on screen; the queue is
    // already drained, which is the part that must not be lost
  });
}

export const useSyncStore = create<SyncState>((set, get) => ({
  entriesNow: [],
  queued: 0,
  conflicts: [],
  lastSyncAt: null,
  lastError: null,
  syncing: false,
  retryAt: null,
  persistent: true,

  entries: () => getOutbox().entries(),

  refresh: async () => {
    const entriesNow = await getOutbox().entries();
    set({ entriesNow, queued: entriesNow.length, persistent: getOutbox().persistent });
  },

  loadConflicts: async () => {
    const stored = await getOutbox().storedConflicts();
    // anything refused in this session before the read landed stays, and is not listed twice
    set((s) => ({ conflicts: [...stored.filter((c) => !s.conflicts.some((m) => m.offlineId === c.offlineId)), ...s.conflicts] }));
  },

  probe: async () => {
    // The answer is not the point: the transport under the adapter sets
    // `session.online` from whether one came back, so a refusal is as good as
    // a success, and a failure is simply what offline looks like.
    await getAdapter()
      .getCapabilities()
      .catch(() => undefined);
  },

  syncNow: async () => {
    if (get().syncing) return;
    // WPF-2: a server that said when to come back is not asked before then
    const retryAt = get().retryAt;
    if (retryAt != null && Date.now() < retryAt) return;
    const session = useSessionStore.getState();
    if (!session.online) return;
    // R-05: the queue is a write too, and a replay goes UNDER the adapter's
    // lock gate — so the gate is applied here; `installSync` replays on unlock.
    if (session.locked) return;
    set({ syncing: true });
    try {
      const { sent, conflicts, retryAfterMs } = await getOutbox().replay();
      const remaining = await getOutbox().entries();
      set({
        entriesNow: remaining,
        queued: remaining.length,
        conflicts: [...get().conflicts, ...conflicts],
        lastSyncAt: sent > 0 ? new Date().toISOString() : get().lastSyncAt,
        lastError: null,
        retryAt: retryAfterMs != null ? Date.now() + retryAfterMs : null,
      });
      // A-5: the kept list grows with the store's (A4R7-08) — a reload must not lose the words
      if (conflicts.length > 0) await getOutbox().keepConflicts(get().conflicts);
      // A4R7-02, A4R7-07: a REFUSED replay leaves the device showing what the
      // server said no to, so it reloads as well — not only one that sent something
      if (sent > 0 || conflicts.length > 0) await reloadAffected();
      if (sent > 0) {
        useSessionStore.getState().showToast(`Synced · ${sent} capture${sent === 1 ? "" : "s"}`);
      }
      if (conflicts.length > 0) {
        // never silently: the local text is kept and listed under Settings ›
        // Sync, and the person is told there is something to look at (OF-07)
        useSessionStore
          .getState()
          .showToast(`${conflicts.length} capture${conflicts.length === 1 ? "" : "s"} could not be applied · see Settings › Sync`);
      }
    } catch (e) {
      // SY-01. A replay that throws used to be silent in every surface: the
      // captures stayed queued, the retry timer kept firing into the same
      // failure, and the app said "offline · captures queue" or nothing at
      // all. Recorded rather than re-thrown — the caller is a timer and an
      // event listener, neither of which has anywhere to put an error.
      set({ lastError: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ syncing: false });
    }
  },

  dismissConflict: (offlineId) => {
    set({ conflicts: get().conflicts.filter((c) => c.offlineId !== offlineId) });
    // A-5: dismissed here is dismissed for good — the kept list shrinks with it
    void getOutbox()
      .keepConflicts(get().conflicts)
      .catch(() => undefined);
  },
}));

