/**
 * The emergency lock's round trip (AG-12; v2.3 WPF-4) — what "Lock everything
 * now" does when the server confirms it, refuses it, or cannot be reached.
 *
 *  - CONFIRMED: this device locks into the emergency state and is wiped — the
 *    queue, the cache, and the tokens, the refresh token in the keychain
 *    included (`lib/emergencyWipe.ts`).
 *  - REFUSED (the server answered no): nothing is locked or wiped by the
 *    refusal. Josh's A-0 row 5: a request the server refused must not empty
 *    the device the person is still using. The error goes back to the dialog,
 *    which says why.
 *  - UNREACHABLE (the network, or a request that timed out): the device locks
 *    itself at once — the microphone off, the emergency screen up, the access
 *    token dropped — and wipes nothing, because nothing has confirmed. It
 *    remembers that the server has not been told, tries again with the press's
 *    own assertion when the connection comes back or the app regains focus
 *    (`lib/syncInstall.ts`), and after a reload the lock screen offers "Tell
 *    the server now", which asks for a fresh passkey. Whether an unreachable
 *    server should ever wipe is Josh's question.
 *
 * Here rather than in `stores/session.ts`, which is at its size cap: the
 * store's `lock` is one call to `emergencyLock`.
 */
import { encryptedGet, encryptedSet } from "@/lib/encryptedStore";
import { create } from "zustand";
import { isNetworkFailure } from "@/data/transport/outbox";
import { forgetAccessToken } from "@/lib/authTokens";
import { wipeThisDevice } from "@/lib/emergencyWipe";
import { assertHighRisk } from "@/lib/highRisk";
import { stopActiveMic } from "@/lib/mic";
import { useSessionStore } from "@/stores/session";

/** survives a reload; the wipe that follows the server's confirmation clears it with everything else */
const UNCONFIRMED_KEY = "jstack.lock.unconfirmed";

type HighRiskAuth = { nonce: string; biometricAssertion: string };

/** What the lock screen reads: locked on this device, and the server has not confirmed. */
export const useEmergencyLockStore = create<{ unconfirmed: boolean }>(() => ({ unconfirmed: false }));

/** the press's own nonce and assertion, for the retry — memory only, never written down */
let pending: HighRiskAuth | null = null;
let retrying = false;

/** The server could not be reached — as opposed to a server that answered no. */
export function isUnreachable(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return isNetworkFailure(error) || name === "TimeoutError" || name === "AbortError";
}

async function confirmed(): Promise<void> {
  pending = null;
  useSessionStore.setState({ emergency: true });
  useSessionStore.getState().relock();
  useEmergencyLockStore.setState({ unconfirmed: false });
  await wipeThisDevice(); // this device's queue, cache and tokens; the server's records stay (AG-12)
}

/** Locks here at once; the flag that survives a reload is written last, through the encrypted store (SEC-06). */
async function lockHere(auth: HighRiskAuth | null): Promise<void> {
  pending = auth;
  useSessionStore.setState({ emergency: true });
  useSessionStore.getState().relock();
  forgetAccessToken();
  useEmergencyLockStore.setState({ unconfirmed: true });
  await encryptedSet(UNCONFIRMED_KEY, "1").catch(() => undefined);
}

/** `stores/session.ts`'s `lock`, which hands in the route call so that it stays in the store
 * action the wiring map reads. Rejects only when the server refused, which changed nothing. */
export async function emergencyLock(nonce: string, biometricAssertion: string, post: (auth: HighRiskAuth) => Promise<unknown>): Promise<void> {
  stopActiveMic();
  const auth = { nonce, biometricAssertion };
  try {
    await post(auth);
  } catch (error) {
    if (!isUnreachable(error)) throw error;
    await lockHere(auth);
    return;
  }
  await confirmed();
}

/** The dialog's way when even the nonce could not be fetched: this device locks now, and the lock screen tells the server later. */
export function lockWithoutServer(): void {
  stopActiveMic();
  void lockHere(null);
}

/** Reconnect or focus (`lib/syncInstall.ts`): tell the server with the press's own assertion. One at a time. */
export async function retryUnconfirmedLock(): Promise<void> {
  if (pending == null || retrying) return;
  retrying = true;
  const auth = pending;
  try {
    // through the store's own lock action; still unreachable leaves this
    // assertion pending for the next reconnect
    await useSessionStore.getState().lock(auth.nonce, auth.biometricAssertion);
  } catch {
    // a refusal (a nonce the server will not take twice) cannot be retried with
    // this assertion: the lock screen's "Tell the server now" asks for a fresh one
    pending = null;
  } finally {
    retrying = false;
  }
}

/** The lock screen's "Tell the server now": a fresh passkey, then the same round trip. */
export async function tellServerNow(): Promise<"told" | "cancelled" | "unreachable" | "refused"> {
  let auth: HighRiskAuth | null;
  try {
    auth = await assertHighRisk();
  } catch (error) {
    return isUnreachable(error) ? "unreachable" : "refused";
  }
  if (auth == null) return "cancelled";
  try {
    await useSessionStore.getState().lock(auth.nonce, auth.biometricAssertion);
  } catch {
    return "refused";
  }
  return useEmergencyLockStore.getState().unconfirmed ? "unreachable" : "told";
}

/** At boot: a lock the server was never told about is still a lock. */
export async function loadUnconfirmedLock(): Promise<void> {
  const flag = await encryptedGet(UNCONFIRMED_KEY).catch(() => null);
  if (flag == null) return;
  useSessionStore.setState({ emergency: true });
  useSessionStore.getState().relock();
  useEmergencyLockStore.setState({ unconfirmed: true });
}
