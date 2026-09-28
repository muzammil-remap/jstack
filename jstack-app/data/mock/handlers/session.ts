/** §4.1 Session, devices, lock. */
import * as db from "@/data/mock/db";
import { emitServerEvent } from "@/data/mock/events";
import { err, ok, requireHighRisk } from "@/data/mock/util";
import type { PushSubscribeBody, Session, WebauthnResult, WebauthnStep } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

let locked = false;
let lockedReason: string | undefined;

export function getAuthNonce(_req: TransportRequest): TransportResponse {
  return ok({ nonce: `nonce-${Date.now()}`, expiresAt: new Date(db.now().getTime() + 60_000).toISOString() });
}

export function registerDevice(_req: TransportRequest): TransportResponse {
  return ok({ deviceId: "dev-new", token: "mock-token" });
}

/**
 * SEC-05: refresh tokens rotate, so a token presented twice means somebody
 * has a copy — either the app replayed one, or it was stolen. The server
 * cannot tell which, and the safe reading of "cannot tell" is the bad one:
 * `401 { reason: "reuse" }`, and the client locks the device (ID-04).
 *
 * Armed by the rig rather than by tracking real token values, because the
 * mock issues one constant token and the behaviour under test is the
 * CLIENT's response to the 401, not the server's bookkeeping.
 */
let refreshReuse = false;

export function armRefreshReuse(): void {
  refreshReuse = true;
}

export function refreshAuth(_req: TransportRequest): TransportResponse {
  if (refreshReuse) {
    refreshReuse = false;
    return err(401, "reuse");
  }
  return ok({ token: "mock-token" });
}

/** D-3 (ADR-67): the ceremony is checked on the DEVICE, not the server
 * (`lib/webauthnGate.ts`) — this mock has no real relying party behind it,
 * so it cannot honestly distinguish "registering" from "asserting" the way
 * a real one would. What it CAN do honestly is answer the shape the step
 * promises: real WebAuthn-standard options for "options", a plain
 * confirmation for "verify" — never the untyped `{ ok: true }` either step
 * used to get regardless of which it was. */
export function webauthnCeremony(_req: TransportRequest, step: WebauthnStep): TransportResponse {
  if (step === "options") {
    return ok<WebauthnResult>({
      challenge: "mock-challenge",
      rp: { name: "JSTACK" },
      user: { id: "mock-user", name: "josh", displayName: "Josh" },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }],
      authenticatorSelection: { userVerification: "required" },
    });
  }
  return ok<WebauthnResult>({ verified: true });
}

/** §4.1 + I-1: who is holding the session, what they may see, and how long
 * the access token lives. `silos` is the server's answer — the client stores
 * it to render with, never to decide with (`data/mock/util.ts` is where the
 * decision is actually enforced). */
export function getSession(_req: TransportRequest): TransportResponse {
  const { devices, currentUser } = db.get();
  return ok<Session>({
    user: currentUser,
    silos: db.currentSilos(),
    device: devices.find((d) => d.current) ?? devices[0],
    devices,
    tokenTtlSeconds: 900,
    lockedReason,
  });
}

/** SH-09: the server revoking THIS device — the rig's revoke route (`handlers/test.ts`) reaches
 * the session's own state through here (F-07, P-11). */
export function markRevoked(): void {
  locked = true;
  lockedReason = "This device was signed out.";
}
export function revokeDevice(req: TransportRequest, id: string): TransportResponse {
  const bad = requireHighRisk(req.body);
  if (bad) return bad;
  const state = db.get();
  state.devices = state.devices.filter((d) => d.id !== id);
  // R-07 / PU-05: a revoked device that keeps receiving notifications is a
  // revoked device in name only — its subscription goes with it, server-side
  state.pushSubscriptions = state.pushSubscriptions.filter((p) => p.device !== id);
  return ok(null);
}

export function postLock(req: TransportRequest): TransportResponse {
  const bad = requireHighRisk(req.body);
  if (bad) return bad;
  locked = true;
  lockedReason = "Emergency lock";
  return ok({ locked: true, at: db.now().toISOString() });
}

export function postRecover(req: TransportRequest): TransportResponse {
  const b = (req.body ?? {}) as { recoveryKey?: string; nonce?: string; biometricAssertion?: string };
  if (!b.recoveryKey || !b.nonce || !b.biometricAssertion) return err(403, "recovery requires the passkey + recovery key");
  locked = false;
  lockedReason = undefined;
  return ok({ restored: true, agentsResuming: ["EA", "Watchdog"] });
}

/** §4.13: one subscription per device — a re-subscribe (a group toggled)
 * replaces, never duplicates (R-07). */
export function postPushSubscribe(req: TransportRequest): TransportResponse {
  const body = req.body as PushSubscribeBody;
  const state = db.get();
  state.pushSubscriptions = [...state.pushSubscriptions.filter((p) => p.device !== body.device), body];
  return ok(null);
}

/** §4.13: idempotent — deleting a device with no subscription is fine. */
export function deletePushSubscription(_req: TransportRequest, device: string): TransportResponse {
  const state = db.get();
  state.pushSubscriptions = state.pushSubscriptions.filter((p) => p.device !== device);
  return ok(null);
}

export function isLocked(): boolean {
  return locked;
}
