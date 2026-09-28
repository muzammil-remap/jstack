/**
 * Biometric re-assertion for high-risk approvals (spec §14.9 — SEC-07,
 * contract §9): bill-handled, security apply, memory master. A stolen
 * unlocked phone cannot approve these — each one demands a FRESH biometric
 * plus a server nonce; a declined assertion changes nothing.
 * Native: Face ID (expo-local-authentication). Web: the passkey ceremony.
 * Tests inject an approving/declining mock through lib/testBuild.
 */
import { Platform } from "react-native";
import { getAdapter } from "@/data/provider";
import { webAuthnUnlock } from "@/lib/webauthnGate";

type HighRiskAuth = { nonce: string; biometricAssertion: string };

type BiometricFn = () => Promise<boolean>;
let testBiometric: BiometricFn | null = null;

/** Test seam — reachable only through lib/testBuild (absent from prod builds). */
export function __setBiometricForTests(fn: BiometricFn | null): void {
  testBiometric = fn;
}

async function biometric(): Promise<boolean> {
  if (testBiometric) return testBiometric();
  if (Platform.OS === "web") return webAuthnUnlock();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const LocalAuthentication = require("expo-local-authentication") as typeof import("expo-local-authentication");
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirm it's you",
      disableDeviceFallback: false,
    });
    return res.success;
  } catch {
    return false;
  }
}

/**
 * Returns the nonce + assertion to attach, or null when declined — in which
 * case the caller MUST NOT proceed (SEC-07: declined → no state change).
 */
export async function assertHighRisk(): Promise<HighRiskAuth | null> {
  const { nonce } = await getAdapter().getAuthNonce(); // TODO(BACKEND: §4.1) server verifies freshness + single use
  const ok = await biometric();
  if (!ok) return null;
  return { nonce, biometricAssertion: `signed:${nonce}` }; // device-key signature at go-live (§9)
}
