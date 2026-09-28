/**
 * Push subscription (U-1, PU-01..05, SE-02).
 *
 * Web push, not FCM: there is no token. The browser mints a subscription
 * against the backend's VAPID public key, and what the server gets is an
 * endpoint URL plus two keys that let only THIS device decrypt what it sends.
 * If the backend has no push service (`capabilities.pushPublicKey` absent),
 * the switch says so rather than failing when it is tapped.
 *
 * The permission prompt is asked in exactly one place — Settings ›
 * Notifications, when the person turns the switch on. Never on load, never on
 * first capture. A permission prompt that arrives unprompted gets denied, and
 * a denied notification permission is close to permanent: the browser stops
 * asking, and the only route back is through settings the person will never
 * find. Asking once, at the moment they said they wanted it, is the whole
 * design.
 */
import { getAdapter } from "@/data/provider";

export type PushState = "unsupported" | "unavailable" | "denied" | "off" | "on";

/** VAPID keys are base64url; `applicationServerKey` wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Deliberately NOT `Platform.OS === "web"`. What this code needs is a service
 * worker and a Notification API, and asking for those directly is both more
 * honest — a web view without them is as unsupported as a phone — and testable
 * without mocking react-native, which turned out to break the native Jest
 * project entirely (the module's own internals go looking for DevMenu).
 */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (nav?.serviceWorker == null) return null;

  // `serviceWorker.ready` NEVER SETTLES when nothing is registered (B-30) —
  // it is not "is there one?", it is "wake me when one is active". Awaiting
  // it directly hangs forever in a test build (which registers no worker by
  // design), on a first load before install completes, and in any browser
  // where the user has disabled workers. `unsubscribePush()` is awaited
  // before a device revoke, so the hang surfaced as a revoke that never
  // happened and a toast that never appeared, with no error anywhere.
  //
  // `getRegistration()` answers the question that was actually being asked
  // and resolves to undefined when there is none; only once one exists is
  // `ready` awaited, for the activation guarantee `pushManager` wants.
  const existing = await nav.serviceWorker.getRegistration().catch(() => null);
  if (existing == null) return null;
  return nav.serviceWorker.ready.catch(() => null);
}

/** What the switch should show, without asking for anything. */
export async function pushState(pushPublicKey: string | undefined): Promise<PushState> {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  const Notif = (globalThis as { Notification?: { permission: string } }).Notification;
  if (nav?.serviceWorker == null || Notif == null) return "unsupported";
  if (pushPublicKey == null || pushPublicKey === "") return "unavailable";
  if (Notif.permission === "denied") return "denied";
  const reg = await registration();
  const existing = await reg?.pushManager.getSubscription().catch(() => null);
  return existing != null ? "on" : "off";
}

/**
 * Ask, subscribe, and tell the server which groups this device wants.
 * Returns the state to render — including the honest failure states, because
 * a switch that flips back with no explanation is worse than one that does
 * not move.
 */
export async function subscribePush(pushPublicKey: string | undefined, groups: string[], deviceId: string): Promise<PushState> {
  const state = await pushState(pushPublicKey);
  if (state !== "off") return state;

  const Notif = (globalThis as { Notification?: { requestPermission: () => Promise<string> } }).Notification;
  const permission = await Notif!.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const reg = await registration();
  if (reg == null) return "unsupported";

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(pushPublicKey!),
  });
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  await getAdapter().postPushSubscribe({
    // the device ID, not a display name: the server matches it on revoke and
    // on DELETE /push/subscribe/{device} (R-07)
    device: deviceId,
    endpoint: json.endpoint ?? sub.endpoint,
    keys: json.keys ?? { p256dh: "", auth: "" },
    groups,
  });
  return "on";
}

/**
 * PU-03's second clause: "toggling a group updates the subscription". The
 * groups a device wants travel WITH its subscription (§4.13), so a group
 * flipped while push is on re-posts the same endpoint and keys with the new
 * list. Nothing is asked of the browser — the subscription already exists —
 * and with no subscription there is nothing to update.
 */
export async function updatePushGroups(groups: string[], deviceId: string): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (sub == null) return;
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  await getAdapter().postPushSubscribe({
    device: deviceId,
    endpoint: json.endpoint ?? sub.endpoint,
    keys: json.keys ?? { p256dh: "", auth: "" },
    groups,
  });
}

/**
 * Drop THIS browser's subscription — the switch on this device going off.
 * With a `deviceId` the server forgets it too (`DELETE /push/subscribe/{device}`,
 * §4.13): the browser drop alone leaves a dead endpoint on file that the
 * push service will bounce until somebody cleans it up (R-07).
 *
 * NOT called on a device revoke: revoking the iPad from the phone must not
 * silence the phone. The server drops the revoked device's subscription
 * itself, and `stores/settings.ts` asks it to by id.
 */
export async function unsubscribePush(deviceId?: string): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  await sub?.unsubscribe().catch(() => false);
  if (deviceId != null) await getAdapter().deletePushSubscription(deviceId).catch(() => undefined);
  return "off";
}
