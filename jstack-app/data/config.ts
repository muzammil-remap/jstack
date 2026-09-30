/**
 * Backend config — THE one file that changes at go-live.
 * The dev fills these from BACKEND_HANDSHAKE.md; nothing else in the app
 * changes (BUILD_PLAN standing fact #2).
 */
// TODO(BACKEND: §4.1) point at the VPS: e.g. "https://jstack.example.com/api/v1"
// (the EXPO_PUBLIC_ override exists for the BS-05 swap proof — the acceptance
// suite runs against the reference server without editing this file)
export const API_BASE_URL: string | null = process.env.EXPO_PUBLIC_API_BASE_URL ?? null;

// TODO(BACKEND: §4.1) short-lived scoped JWT per device; refresh rotation.
// The dev's auth issuance flow goes here (device-bound keys).
export const AUTH = {
  getToken: async (): Promise<string | null> => null,
};

/**
 * ADR-76 (REMAP): which server the app talks to. `mock` is the in-process mock
 * every test runs on, `http` the real backend `API_BASE_URL` names, and `n8n`
 * the webhook dispatcher (`data/transport/n8n.ts`) that reaches Josh's n8n
 * through a proxy. Unset or unknown keeps the rule this file always had: a base
 * URL or the swap flag means `http`, anything else the mock.
 */
const rawDataSource = process.env.EXPO_PUBLIC_DATA_SOURCE;
export const DATA_SOURCE: "mock" | "http" | "n8n" =
  rawDataSource === "mock" || rawDataSource === "http" || rawDataSource === "n8n"
    ? rawDataSource
    : process.env.EXPO_PUBLIC_USE_API_ADAPTER === "1" || API_BASE_URL != null
      ? "http"
      : "mock";

/** Flip to swap the app onto the real backend (see data/provider.ts). True for
 * `n8n` too: every branch that reads it asks "is this the mock?", and on n8n
 * the answer is no — no mock sign-in, no demo watermark, no fixtures. */
export const USE_API_ADAPTER = DATA_SOURCE !== "mock";

/**
 * ADR-76: where the n8n proxy answers. The browser POSTs to `<this>/<key>`
 * with a short allow-listed key (`calendar`, `tasks`), never an n8n path, and
 * never a secret: the proxy maps the key to the webhook and adds the header
 * (`remap/dev-proxy.mjs` locally, nginx in production). The default is the
 * production same-origin prefix; local dev sets `http://127.0.0.1:8787/n8n`.
 */
export const N8N_BASE_URL: string = (process.env.EXPO_PUBLIC_N8N_BASE_URL ?? "/n8n").replace(/\/+$/, "");

/** ADR-76: Twenty's own web address, for "open in Twenty" links and the
 * Agents portal. Empty means no link is drawn, rather than a guessed one. */
export const TWENTY_APP_URL: string = (process.env.EXPO_PUBLIC_TWENTY_APP_URL ?? "").replace(/\/+$/, "");

/**
 * D-4: how long `httpTransport` waits before giving up on a request — the
 * gap `CONTRACT.md` Q20 used to name as the client's own (`the client sets
 * no request timeout of its own`). 15s for an ordinary request, matching
 * the "keep every request under five seconds" latency assumption with
 * three times the margin rather than none; a timeout surfaces as the same
 * network-failure class `data/transport/outbox.ts` already recognises, so
 * a queueable write times out into the queue instead of hanging the caller
 * forever, and a read shows the existing error path.
 */
// D-13: `Number(undefined ?? 15_000)` is fine, but `Number("fifteen")` is
// NaN and — the sharper trap — `Number("")` is `0`, not NaN: JS coerces an
// empty or blank string to zero, so a var set and then cleared would not
// even fail loud. Either way `setTimeout(fn, …)` fires at once, and every
// request aborting instantly is a worse failure than the env var typo that
// caused it, and a silent one: nothing here would have said why. A raw
// value that is unset, blank, or does not parse to a real number all fall
// back to the default instead of becoming one.
// D-13b (QA): `Number.isFinite` alone still let "0" and "-1" through — both
// are genuine finite numbers, and `setTimeout(fn, 0)`/`setTimeout(fn, -1)`
// (a negative delay clamps to 0) abort every request exactly as instantly
// as NaN does. A timeout has to be a real, positive duration.
const rawApiTimeoutMs = process.env.EXPO_PUBLIC_API_TIMEOUT_MS;
const parsedApiTimeoutMs = rawApiTimeoutMs != null && rawApiTimeoutMs.trim() !== "" ? Number(rawApiTimeoutMs) : NaN;
export const API_TIMEOUT_MS = Number.isFinite(parsedApiTimeoutMs) && parsedApiTimeoutMs > 0 ? parsedApiTimeoutMs : 15_000;

/** An upload (`POST /files`) is a multipart body, not a JSON round trip —
 * 15s is not enough margin for a phone on a slow connection sending real
 * bytes, so it gets its own, longer allowance. Not overridable by env: the
 * 15s figure above is the one REMAP might reasonably want to tune per
 * deployment; this one is a property of "sending a file over the network",
 * not of any particular backend. */
export const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * D-5: the transport used to set no `credentials` at all, which `fetch`
 * treats as `"same-origin"` implicitly — a request sent the httpOnly
 * refresh cookie (`CONTRACT.md` §8 Q9) only when the API shared the app's
 * own origin, and there was no lever to say otherwise for a cross-origin
 * deployment. Explicit now, and configurable: `"include"` only when asked
 * for, because a browser sending credentials cross-origin by default would
 * be the wrong failure direction (leaking a cookie somewhere it was not
 * asked to go, rather than merely failing to send one somewhere it was).
 */
export const API_CREDENTIALS: RequestCredentials = process.env.EXPO_PUBLIC_API_CREDENTIALS === "include" ? "include" : "same-origin";
