/**
 * lastSeen (A-3, WP-A) — the last copy of the three tabs Josh plans from, kept on
 * this device so a load that fails offline still has something to plan from.
 *
 * WHAT IT KEEPS: the last Today composite, the Tasks list for the filter it was
 * loaded under, and Brain's recent items — each replaced by the next successful
 * load, and each scoped (the focus, and for Tasks the view, slicer, query and
 * filters) so a copy is never shown under a filter it was not loaded for.
 *
 * IT KEEPS THE WHOLE TAB, sensitive items included (Josh, 15 Sep 2026: "all
 * including sensitive"; WPI-1, ADR-66). That is safe for three reasons, and each
 * stays: the copy is ciphertext at rest (`encryptedSet`); it goes with the
 * emergency wipe, and the key that sealed it with it (WPA-14); and nothing is
 * written while the emergency state is set (A-13). Nothing for Life, Agents,
 * Settings or search: the owner asked to plan and capture offline, not to carry
 * the database (ADR-66).
 *
 * WHERE IT LIVES: `lib/encryptedStore.ts`, like `lib/recentFiles.ts` — encrypted
 * at rest, and gone with every other key when `wipeAllLocalData` runs. A copy
 * still waiting behind a write when the wipe runs is dropped, and `encryptedSet`
 * refuses a write the wipe overtook. While the emergency lock is on, no copy is
 * taken at all (A-13): a read the server answered before `POST /lock` can land
 * after the wipe, where the wipe count cannot tell its copy from a fresh one.
 *
 * WHEN: once per successful load, coalesced — one write at a time per tab, the
 * latest copy winning — and no timer, so nothing is left pending to outlive a
 * wipe. Shown ONLY when a load fails while `session.online` is false: a failure
 * on a live connection is A-2's sentence, never an old page.
 */
import { encryptedGet, encryptedSet, secureStoreStatus, wipeCount } from "@/lib/encryptedStore";
import { formatAgo } from "@/lib/time";
import { useSessionStore } from "@/stores/session";

type Tab = "today" | "tasks" | "brain";

/** `tests/unit/lastSeen.test.ts` spells these as literals: renaming one orphans the copy on every device that has one */
const KEYS: Record<Tab, string> = { today: "jstack.lastSeen.today", tasks: "jstack.lastSeen.tasks", brain: "jstack.lastSeen.brain" };

type Copy = { savedAt: string; scope: string; payload: unknown };

const waiting = new Map<Tab, { copy: Copy; wipes: number }>();
const flights = new Map<Tab, Promise<void>>();

/** Keep this as the tab's copy: one write at a time per tab, and the latest copy is the one that lands. Nothing while
 * the emergency lock is on (A-13): not written, and not held for a later write. */
export function rememberLastSeen(tab: Tab, scope: string, payload: unknown): Promise<void> {
  // WPI-2: nor on a phone whose store cannot seal — the write would only fail
  if (useSessionStore.getState().emergency || secureStoreStatus().status !== "ok") return Promise.resolve();
  waiting.set(tab, { copy: { savedAt: new Date().toISOString(), scope, payload }, wipes: wipeCount() });
  const running = flights.get(tab);
  if (running != null) return running;
  const flight = (async () => {
    try {
      for (let next = waiting.get(tab); next != null; next = waiting.get(tab)) {
        waiting.delete(tab);
        if (next.wipes !== wipeCount()) continue; // taken before the device was wiped
        await encryptedSet(KEYS[tab], JSON.stringify(next.copy));
      }
    } catch {
      // a copy that cannot be written is one the device does not have; the load it followed has already succeeded
    } finally {
      flights.delete(tab);
    }
  })();
  flights.set(tab, flight);
  return flight;
}

/** The tab's copy for this scope, or null — and always null online, where a failed load is not a reason to show an old page. */
export async function offlineCopy<T>(tab: Tab, scope: string): Promise<{ savedAt: string; payload: T } | null> {
  if (useSessionStore.getState().online) return null;
  const raw = await encryptedGet(KEYS[tab]);
  if (raw == null) return null;
  try {
    const copy = JSON.parse(raw) as Copy;
    return copy.scope === scope ? { savedAt: copy.savedAt, payload: copy.payload as T } : null;
  } catch {
    return null;
  }
}

/** "last updated 2 h ago · offline" — a copy is never shown without it. */
export function staleLine(savedAt: string): string {
  return `last updated ${formatAgo(savedAt)} · offline`;
}
