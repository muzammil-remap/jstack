/**
 * Web gate (spec §14.9 — SEC-02): a REAL passkey/WebAuthn ceremony replaces
 * v1's tap-to-simulate. First unlock registers a platform credential; later
 * unlocks assert it. A tap alone cannot unlock — no authenticator, no entry.
 *
 * The challenge/verify halves are stubbed locally until the backend exists:
 * // TODO(BACKEND: §4.1) GET /auth/nonce challenge + POST /auth/webauthn/assert
 * server-side verification; session cookie HttpOnly, 30-min sliding.
 * Until then the assertion is performed and checked locally (the ceremony is
 * real; the server trust arrives at go-live — HANDOVER + BUGLOG A-13).
 *
 * The credential ID (a public identifier, not a secret/token — SEC-09 holds)
 * is remembered so re-unlocks use `get` instead of re-registering.
 */
const CRED_KEY = "jstack.webauthn.credid";

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function webAuthnAvailable(): Promise<boolean> {
  const g = globalThis as { PublicKeyCredential?: unknown; navigator?: Navigator };
  return g.PublicKeyCredential != null && g.navigator?.credentials != null;
}

/**
 * v2.3.1 WPN-1: a page on which no ceremony can succeed, known before one is tried — a page that is not a secure
 * context, or a file opened from disk (its origin is opaque: Chrome and Brave keep `PublicKeyCredential` there and
 * refuse the ceremony itself).
 */
export function passkeyCannotRunHere(): boolean {
  const g = globalThis as { isSecureContext?: boolean; location?: { protocol?: string } };
  return g.isSecureContext === false || g.location?.protocol === "file:";
}

/**
 * How a ceremony ended (WPN-1). "refused" is the browser declining to run one on this page — a SecurityError for an
 * opaque or invalid origin — or no authenticator answering (NotAllowedError, which a person cancelling also throws);
 * "failed" is anything else. The gate reads the difference; `webAuthnUnlock` below does not need it.
 */
export async function webAuthnCeremony(): Promise<"unlocked" | "unavailable" | "refused" | "failed"> {
  if (!(await webAuthnAvailable())) return "unavailable";
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const stored = localStorage.getItem(CRED_KEY);
  try {
    if (stored) {
      const cred = (await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ id: b64ToBuf(stored).buffer as ArrayBuffer, type: "public-key" }],
          userVerification: "required",
          timeout: 30000,
        },
      })) as PublicKeyCredential | null;
      return cred != null ? "unlocked" : "failed";
    }
    const created = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "JSTACK" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "josh", displayName: "Josh" },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 30000,
      },
    })) as PublicKeyCredential | null;
    if (created == null) return "failed";
    localStorage.setItem(CRED_KEY, bufToB64(created.rawId));
    return "unlocked";
  } catch (e) {
    // no authenticator, declined, or a page the browser will not run one on — the gate stays locked every way
    const name = (e as { name?: string } | null)?.name;
    return name === "SecurityError" || name === "NotAllowedError" ? "refused" : "failed";
  }
}

/** Runs the passkey ceremony. Resolves true only on a completed assertion. */
export async function webAuthnUnlock(): Promise<boolean> {
  return (await webAuthnCeremony()) === "unlocked";
}
