/**
 * recordLoad (A-2, WP-A) — a tab's load that fails is RECORDED, never thrown.
 *
 * Every tab calls its store's `load()` fire-and-forget from an effect
 * (`void load(focus)`), so a load that rejected had nowhere to go: an unhandled
 * rejection, the store left as it was, and on a first open with no connection a
 * tab that rendered its title over nothing. The store keeps the reason instead,
 * and `layout/TabScreen.tsx` turns "failed, with nothing to show" into one
 * sentence (`components/chrome/TabUnavailable.tsx`).
 *
 * A load that gets through clears it: a fault that has stopped is not one to
 * keep saying. The reason is kept as the error's own words, so what a test or a
 * person reads is what the transport said.
 *
 * A-3: `fallback` runs when a load fails — the three planning tabs pass their
 * offline copy (`lib/lastSeen.ts`) — BEFORE the failure is recorded, so a tab
 * that has a copy never flashes A-2's sentence first. It may not throw either.
 */
export async function recordLoad(set: (partial: { loadError: string | null }) => void, load: () => Promise<void>, fallback?: () => Promise<void>): Promise<void> {
  try {
    await load();
  } catch (e) {
    await fallback?.().catch(() => undefined);
    set({ loadError: e instanceof Error ? e.message : String(e) });
    return;
  }
  set({ loadError: null });
}

/**
 * A-2b: the same for a tab's other loads — the replies beside Today and Brain, the waiting rows and the open
 * count beside the Tasks list — each recorded under a key of its own, so one that fails never speaks for the
 * tab's main load (whose failure is what the tab reads), and one that gets through never clears it.
 */
export async function recordLoadAs<K extends string>(key: K, set: (partial: Record<K, string | null>) => void, load: () => Promise<void>): Promise<void> {
  try {
    await load();
  } catch (e) {
    set({ [key]: e instanceof Error ? e.message : String(e) } as Record<K, string | null>);
    return;
  }
  set({ [key]: null } as Record<K, string | null>);
}

/** What `orNotConnected` answers for a read the backend does not connect yet (a `501`). */
export const NOT_CONNECTED: unique symbol = Symbol("not connected");

/**
 * N8N-2: a section whose source the backend does not connect says so, rather than showing the empty
 * value as a fact ("all healthy", "Nothing failing"). The read's `501` becomes `NOT_CONNECTED` for
 * the store to record against that section alone; any other failure still fails the load, as A-2 has it.
 */
export async function orNotConnected<T>(read: Promise<T>): Promise<T | typeof NOT_CONNECTED> {
  try {
    return await read;
  } catch (error) {
    if ((error as { status?: unknown } | null)?.status === 501) return NOT_CONNECTED;
    throw error;
  }
}
