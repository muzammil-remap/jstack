/**
 * Token custody (spec §14.9 — SEC-05, contract §9): the refresh token lives
 * in the Keychain (expo-secure-store, this-device-only); the access token
 * lives in MEMORY with a 15-minute TTL and is never written to
 * AsyncStorage/localStorage. Web sessions are cookie-based per §9 — nothing
 * token-like is stored web-side.
 * // TODO(BACKEND: §4.1) POST /auth/refresh rotation wiring at go-live
 */
import { Platform } from "react-native";
import { ContractError } from "@/data/ApiAdapter";
import { getAdapter } from "@/data/provider";
import { useSessionStore } from "@/stores/session";

const REFRESH_KEY = "jstack.auth.refresh";

let accessToken: string | null = null;
let accessExpiresAt = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export async function setTokens(t: { accessToken: string; refreshToken?: string; accessTtlSeconds: number }): Promise<void> {
  accessToken = t.accessToken;
  accessExpiresAt = Date.now() + t.accessTtlSeconds * 1000;
  if (refreshTimer) clearTimeout(refreshTimer);
  // schedule the refresh a minute before expiry (SEC-05 "TTL refresh scheduled")
  refreshTimer = setTimeout(() => {
    accessToken = null; // the go-live wiring calls POST /auth/refresh here
  }, Math.max(1000, (t.accessTtlSeconds - 60) * 1000));
  // A 900-second TTL schedules this fourteen minutes out. In a browser or on
  // a device that is free; under Node it is a live handle that keeps the
  // process alive, and a Jest run that had finished every test sat there
  // until it fired — a ten-minute HANG in the board with nothing failing
  // (B-17). `unref` exists on a Node timer and not on the number a browser
  // returns, so the optional call is a no-op everywhere it does not apply.
  (refreshTimer as unknown as { unref?: () => void }).unref?.();
  if (t.refreshToken != null && Platform.OS !== "web") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
    await SecureStore.setItemAsync(REFRESH_KEY, t.refreshToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

/**
 * Ask for a new access token, and treat a reuse answer as a compromise
 * (ID-04, SEC-05).
 *
 * A rotated refresh token presented twice means a copy exists. The server
 * cannot tell whether the app replayed one or somebody stole it, and the safe
 * reading of "cannot tell" is the bad one — so the device locks into the
 * emergency state rather than quietly retrying. Any other failure is left to
 * the caller: a flat network is not a break-in.
 */
export async function refreshAccessToken(): Promise<void> {
  try {
    const { token } = await getAdapter().refreshAuth();
    await setTokens({ accessToken: token, accessTtlSeconds: 900 });
  } catch (error) {
    if (error instanceof ContractError && error.status === 401 && error.reason === "reuse") {
      await clearTokens();
      // A4R10-03: through `relock()`, the lock that releases the microphone
      // (MC-07) — setting `locked` directly left a live mic behind the gate
      useSessionStore.setState({ emergency: true });
      useSessionStore.getState().relock();
    }
    throw error;
  }
}

export function getAccessToken(): string | null {
  if (accessToken != null && Date.now() >= accessExpiresAt) accessToken = null;
  return accessToken;
}

export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === "web") return null; // §9: web uses the HttpOnly session cookie
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
  return SecureStore.getItemAsync(REFRESH_KEY);
}

/** WPF-4: the access token only, out of memory. A lock that could not reach the
 * server drops it at once, and leaves the keychain to the wipe that follows the
 * server's confirmation. */
export function forgetAccessToken(): void {
  accessToken = null;
  if (refreshTimer) clearTimeout(refreshTimer);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  if (refreshTimer) clearTimeout(refreshTimer);
  if (Platform.OS !== "web") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  }
}
