/**
 * The mock server's outbound event stream (D-1, CONTRACT_v21.md §4.13).
 *
 * A real backend pushes over a socket; the mock has no socket, so it calls
 * subscribers in process. Both ends of the app see the same thing: something
 * changed on the server that the client did not ask for, and the surfaces
 * that show it refetch — the Telegram mirror answering a card, an expiry
 * firing, an overnight delegation finishing.
 *
 * Deliberately dumb. No replay, no ordering guarantees, no delivery receipts:
 * an event says "this kind of thing changed, here are the ids", and the
 * client's answer is always to refetch rather than to patch its own state
 * from the payload. A client that trusted an event's contents would be
 * keeping a second copy of the server's data, which is the thing the one
 * adapter boundary exists to prevent.
 */
import type { ServerEvent } from "@/data/types";

type Listener = (event: ServerEvent) => void;

const listeners = new Set<Listener>();

/** Returns its own unsubscribe, so a caller cannot remove somebody else's. */
export function onServerEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitServerEvent(event: ServerEvent): void {
  // a copy, so a listener that mutates cannot reach the next one
  for (const listener of [...listeners]) listener({ ...event, ids: [...event.ids] });
}

/** Test hygiene: a listener left behind by one test fires in the next. */
export function clearServerEventListeners(): void {
  listeners.clear();
}
