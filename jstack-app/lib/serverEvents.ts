/**
 * The server pushed; which stores should refetch? (D-1, ADR-36, TM-02.)
 *
 * One subscription, started once by `app/_layout.tsx`. A `ServerEvent` says a
 * KIND of thing changed and names ids; the answer is always to reload the
 * stores that show that kind, never to patch state from the payload. An
 * event carrying data the client trusted would be a second copy of the
 * server's records, which is the thing the one-adapter boundary exists to
 * prevent.
 *
 * TM-02 asks for the card to leave Needs you within two seconds and for
 * exactly ONE refetch. So events are COALESCED: three cards answered in the
 * same tick are one reload, not three, and a burst while a reload is already
 * in flight is folded into a single follow-up rather than queued behind it.
 * `calls()` is what the acceptance test counts, and it counts what the
 * network actually saw.
 *
 * Lives here rather than on `stores/session.ts` (ADR-36): it is wiring
 * between the transport and four stores, not session state, and the store is
 * at its SM-03 size cap.
 */
import { onServerEvent } from "@/data/transport/mock";
import { clearTokens } from "@/lib/authTokens";
import type { ServerEvent } from "@/data/types";
import { useAgentsStore } from "@/stores/agents";
import { useBrainStore } from "@/stores/brain";
import { useSessionStore } from "@/stores/session";
import { useLifeStore } from "@/stores/life";
import { useTasksStore } from "@/stores/tasks";
import { useRepliesStore } from "@/stores/replies";
import { useTodayStore } from "@/stores/today";

/** How long to gather events before reloading. Long enough that a burst is
 * one refetch, far short of TM-02's two seconds. */
const COALESCE_MS = 50;

type Kind = ServerEvent["kind"];

// Named once, so the Set below can actually dedupe them. Written inline as
// arrow literals they are fresh objects every time and a Set of them keeps
// all of the duplicates — which would have made `actions` + `tasks` in one
// burst reload Today TWICE, the exact thing TM-02 counts.
const loadToday = () => useTodayStore.getState().load();
const loadTasks = () => useTasksStore.getState().load();
const loadBrain = () => useBrainStore.getState().load();
const loadReplies = () => useRepliesStore.getState().load();
const loadLife = () => useLifeStore.getState().load();
const loadAgents = () => useAgentsStore.getState().load();

/** Which stores show a kind. `today` is in most of them because the Today
 * composite carries a slice of nearly everything. */
const RELOAD: Record<Kind, (() => Promise<unknown>)[]> = {
  actions: [loadToday],
  tasks: [loadTasks, loadToday],
  // R-1: a reply arrives on the `brain` event, which is why the mock emits
  // one rather than returning the reply from the POST that caused it.
  brain: [loadBrain, loadReplies, loadToday],
  life: [loadLife, loadToday],
  agents: [loadAgents],
  // sections are Stage 3c's B-1; the kind exists in the contract already
  sections: [loadToday],
  // `session` reloads NOTHING — see `signOut` below. It is the one kind whose
  // answer is not "refetch": there is nothing left to fetch with.
  session: [],
};

/**
 * SH-09: the server has signed this device out. Tokens go, the app locks, and
 * the locked screen says which of the two locked states this is — a passkey
 * will not reopen it, and showing "unlock with your passkey" would be telling
 * somebody to try something that cannot work.
 *
 * Synchronous and unconditional. A revocation that waits on anything is a
 * revocation with a window in it.
 */
function signOut(): void {
  // A4R10-03: through `relock()`, the lock that releases the microphone (MC-07)
  // — setting `locked` directly left a live mic behind the signed-out screen
  useSessionStore.setState({ signedOut: true, emergency: false });
  useSessionStore.getState().relock();
  void clearTokens().catch(() => {
    // the keychain may refuse while the device itself is locked; the session
    // is already closed either way, and the access token lives only in memory
  });
}

export function subscribeServerEvents(): () => void {
  let pending = new Set<Kind>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const kinds = [...pending];
    // handled before any reload: there is no point refetching for a session
    // that has just been closed
    if (kinds.includes("session")) {
      pending = new Set();
      signOut();
      return;
    }
    pending = new Set();
    // dedupe the store loads themselves: `actions` and `tasks` both reload
    // Today, and TM-02 counts one refetch
    const loads = new Set(kinds.flatMap((kind) => RELOAD[kind] ?? []));
    for (const load of loads) {
      void load().catch(() => {
        // a failed reload leaves the last good data on screen; the next event
        // or the next manual refresh tries again
      });
    }
  };

  return onServerEvent((event: ServerEvent) => {
    pending.add(event.kind);
    if (timer != null) return;
    timer = setTimeout(flush, COALESCE_MS);
    (timer as unknown as { unref?: () => void }).unref?.();
  });
}
