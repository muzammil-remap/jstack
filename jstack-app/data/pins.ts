/**
 * Certificate-pinning scaffold (spec §14.9 — SEC-08, contract §9): the SPKI
 * pins arrive with the completed BACKEND_HANDSHAKE (30-day rotation overlap).
 * JS cannot read the peer certificate, so ENFORCEMENT is native (the go-live
 * dev build wires expo-build-properties / network-security config from this
 * same list); the transport guard below still refuses cleartext everywhere,
 * refuses a pinned host with no verifier registered (D-6 — fail closed,
 * never silently unpinned; this is every web build, since the web has no
 * pinning at all), and refuses one whose native verifier reports a mismatch.
 * Tests inject a mock verifier to prove all three rejection paths.
 */
export const SPKI_PINS: { host: string; pins: string[] }[] = [
  // TODO(BACKEND: §4.1) e.g. { host: "jstack.example.com", pins: ["sha256/AAAA…", "sha256/BBBB…"] }
];

type PinVerifier = (host: string, pins: string[]) => Promise<boolean>;

let nativeVerifier: PinVerifier | null = null;

/** The native layer (go-live dev build) registers its verifier here. */
export function registerPinVerifier(v: PinVerifier | null): void {
  nativeVerifier = v;
}

/**
 * Transport guard: throws on cleartext (except loopback dev hosts) and on a
 * pin mismatch for pinned hosts. Called by ApiAdapter's transport — the only
 * fetch in the app (enforced by the contract test).
 */
export async function guardTransport(url: string): Promise<void> {
  const u = new URL(url);
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost";
  if (u.protocol !== "https:" && !loopback) {
    throw Object.assign(new Error(`cleartext blocked: ${u.protocol}//${u.hostname} (SEC-08)`), { code: 0 });
  }
  const pinned = SPKI_PINS.find((p) => p.host === u.hostname);
  if (pinned) {
    // D-6: `if (pinned && nativeVerifier)` used to skip straight past this
    // whole block when nativeVerifier was null — every web build, and a
    // native build before the go-live dev wiring registers one — so a
    // pinned host looked checked and was not. Fail closed instead: pinning
    // a host is a promise this connection is verified, and a promise this
    // build cannot keep is refused rather than silently not kept.
    if (!nativeVerifier) {
      throw Object.assign(new Error(`no pin verifier registered for ${u.hostname}, which is pinned (SEC-08) — refusing rather than connecting unverified`), { code: 0 });
    }
    const ok = await nativeVerifier(pinned.host, pinned.pins);
    if (!ok) {
      throw Object.assign(new Error(`certificate pin mismatch for ${u.hostname} (SEC-08)`), { code: 0 });
    }
  }
}
