/**
 * A-2 (WP-A, v2.3) — the harness every tab store's failed-load case shares.
 *
 * It runs the load with one adapter read rejecting the way a phone's fetch does
 * when the radio is off, and reports how the load's own promise SETTLED. The tab
 * calls `void load()`, so a load that rejects is a rejection nobody hears: the
 * tab has nowhere to put it, and the person gets a blank shell and no sentence.
 * A load that resolves cannot do that, whatever happened inside it.
 *
 * Why not `process.on("unhandledRejection")`, as WP-A suggested: under
 * jest-circus the event never reaches a listener in the test — Jest's own
 * handler takes it and fails the running test with the reason. The first red
 * run printed exactly that (the counter read 0 while Jest reported
 * "TypeError: Network request failed"), so a counter here would be a guard that
 * cannot go red.
 */
import { getAdapter } from "@/data/provider";
import type { DataProvider } from "@/data/DataProvider";

export async function loadWhileUnreachable(read: keyof DataProvider, load: () => Promise<void>): Promise<{ settled: "resolved" | "rejected" }> {
  const spy = jest.spyOn(getAdapter(), read).mockRejectedValue(new TypeError("Network request failed"));
  try {
    return await load().then(
      () => ({ settled: "resolved" as const }),
      () => ({ settled: "rejected" as const }),
    );
  } finally {
    spy.mockRestore();
  }
}
