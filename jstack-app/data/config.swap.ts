/**
 * Swap-proof flavour of data/config.ts (BS-05). tools/build-web.mjs --swap
 * makes metro resolve `data/config` here, pointing the SAME app at the
 * reference server through the ApiAdapter. Never bundled otherwise — the
 * go-live wiring edits config.ts itself (HANDOVER §4).
 */
export const API_BASE_URL: string | null =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8787/api/v1";

export const AUTH = {
  getToken: async (): Promise<string | null> => null, // §9 auth lands at go-live
};

export const USE_API_ADAPTER = true;

// D-4, D-5, D-13, D-13b: kept equal to data/config.ts's defaults — this file
// swaps the base URL and nothing about how a request behaves once it is
// sent, the unset/blank/non-numeric/zero/negative-falls-back-to-default
// parse included.
const rawApiTimeoutMs = process.env.EXPO_PUBLIC_API_TIMEOUT_MS;
const parsedApiTimeoutMs = rawApiTimeoutMs != null && rawApiTimeoutMs.trim() !== "" ? Number(rawApiTimeoutMs) : NaN;
export const API_TIMEOUT_MS = Number.isFinite(parsedApiTimeoutMs) && parsedApiTimeoutMs > 0 ? parsedApiTimeoutMs : 15_000;
export const UPLOAD_TIMEOUT_MS = 60_000;
export const API_CREDENTIALS: RequestCredentials = process.env.EXPO_PUBLIC_API_CREDENTIALS === "include" ? "include" : "same-origin";
