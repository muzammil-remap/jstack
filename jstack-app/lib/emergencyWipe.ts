/**
 * What the emergency lock does to THIS device (AG-12, SEC-08; Josh's A-0 row 5).
 *
 * "Someone has my phone" is a device problem: after `POST /lock` has revoked
 * every session and token server-side, the bytes on the device are the last
 * thing the phone's holder could read. The encrypted store — the refresh token
 * on native, every persisted record, the queued captures, and the key that
 * sealed them — goes. The server's
 * records are untouched, per the brief: memory and databases stay, and
 * recovery (`POST /recover`) restores the session and reloads them.
 *
 * Only AFTER the server has confirmed the lock: a request the server refused
 * must not empty the device the person is still using.
 */
import { getOutbox } from "@/data/provider";
import { clearTokens } from "@/lib/authTokens";
import { wipeAllLocalData } from "@/lib/encryptedStore";
import { useSyncStore } from "@/stores/sync";

export async function wipeThisDevice(): Promise<void> {
  // WPA-17: what the sync store still holds of the wiped queue goes with it — above all the refused captures' words,
  // which a Dismiss in Settings › Sync would otherwise hand back to the device
  useSyncStore.setState({ conflicts: [], entriesNow: [], queued: 0 });
  // WPA-14: the encrypted store first — it counts the wipe before it removes anything, so a capture still being
  // sealed sees the count move and writes nothing, rather than landing after the queue is cleared below
  await wipeAllLocalData().catch(() => undefined);
  await getOutbox()
    .clear()
    .catch(() => undefined);
  // WPF-4 (finding 5): the tokens go too — the refresh token in the keychain,
  // which the header above always promised, and the access token in memory
  await clearTokens().catch(() => undefined);
}
