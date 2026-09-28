/**
 * syncInstall.ts (P-10, the `stores/sync.ts` margin) — the listeners that give
 * the queue its chances to drain: the browser saying it is back, the app
 * coming to the foreground, an unlock, and a timer that only runs while
 * something is actually waiting. `lib/boot.ts` installs it once and tears it
 * down with the rest. The store owns the replay; this only decides WHEN.
 *
 * A-1: the browser's events are one signal, on web only. React Native fires
 * neither, so the connection is otherwise read off the transport
 * (`data/transport/reachability.ts`), and while offline the timer probes before
 * it replays — on a phone that is the only way back.
 *
 * A-3b: a reconnect is also when an offline copy stops being true, so after the
 * replay it reloads the three planning tabs, whatever the queue held — a replay
 * reloads them itself only when it sent or refused something.
 *
 * WPI-2: boot is also when a phone learns whether it can keep anything
 * encrypted (`lib/encryptedStore.ts`'s probe); one that cannot is told here.
 */
import { useSessionStore } from "@/stores/session";
import { RETRY_MS, useSyncStore } from "@/stores/sync";
import { useBrainStore } from "@/stores/brain";
import { useSettingsStore } from "@/stores/settings";
import { useTasksStore } from "@/stores/tasks";
import { useTodayStore } from "@/stores/today";
import { retryUnconfirmedLock } from "@/lib/emergencyLock";
import { probeSecureStore } from "@/lib/encryptedStore";

export function installSync(): () => void {
  const setOnline = (online: boolean) => {
    useSessionStore.getState().setOnline(online);
    if (online) void useSyncStore.getState().syncNow();
  };
  const onOnline = () => setOnline(true);
  const onOffline = () => setOnline(false);
  const onFocus = () => {
    if (useSessionStore.getState().online) void useSyncStore.getState().syncNow();
    void retryUnconfirmedLock();
  };

  const w = globalThis as unknown as {
    addEventListener?: (t: string, f: () => void) => void;
    removeEventListener?: (t: string, f: () => void) => void;
    navigator?: { onLine?: boolean };
  };
  w.addEventListener?.("online", onOnline);
  w.addEventListener?.("offline", onOffline);
  w.addEventListener?.("focus", onFocus);
  if (typeof w.navigator?.onLine === "boolean") useSessionStore.getState().setOnline(w.navigator.onLine);

  // R-05: unlocking is a reconnect for the queue, not a wait for the next focus
  const unsubscribeLock = useSessionStore.subscribe((s, prev) => {
    if (prev.locked && !s.locked && s.online) void useSyncStore.getState().syncNow();
  });
  // WPF-4: a lock the server was never told about is told the moment there is a connection
  const unsubscribeOnline = useSessionStore.subscribe((s, prev) => {
    if (!prev.online && s.online) void retryUnconfirmedLock();
  });

  // A-3b: back online, the planning tabs' offline copies come down — reloaded whatever the queue held, because a
  // replay reloads them only when it sent or refused something, and "· offline" stayed on screen without one. The
  // queue goes first, so a reload shows what the replay sent.
  const unsubscribeReconnect = useSessionStore.subscribe((s, prev) => {
    if (prev.online || !s.online) return;
    const focus = useSettingsStore.getState().activeFocus;
    void useSyncStore
      .getState()
      .syncNow()
      .finally(() => {
        void useTodayStore.getState().load(focus);
        void useTasksStore.getState().load(focus);
        void useBrainStore.getState().load(focus);
      });
  });

  // A-1: offline, the timer asks before it sends. The probe's answer moves
  // `session.online` (the transport reports it), so the replay goes on the
  // same tick rather than thirty seconds later. Nothing queued, nothing asked.
  const retry = async () => {
    if (useSyncStore.getState().queued === 0) return;
    if (!useSessionStore.getState().online) await useSyncStore.getState().probe();
    await useSyncStore.getState().syncNow(); // still offline: a no-op
  };
  const timer = setInterval(() => void retry(), RETRY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();

  void useSyncStore.getState().refresh();
  // A-5: the captures the server refused before the app closed come back with it
  void useSyncStore.getState().loadConflicts();
  // WPI-2: once, at boot — whether this phone can keep anything encrypted. One that can changes nothing; one that cannot
  // hands the reason to the session store for Settings › Sync, and the dot hears it at this refresh
  void probeSecureStore().then((found) => {
    if (found.status === "ok") return;
    useSessionStore.setState({ secureStoreStatus: found });
    void useSyncStore.getState().refresh();
  });

  return () => {
    unsubscribeLock();
    unsubscribeOnline();
    unsubscribeReconnect();
    clearInterval(timer);
    w.removeEventListener?.("online", onOnline);
    w.removeEventListener?.("offline", onOffline);
    w.removeEventListener?.("focus", onFocus);
  };
}
