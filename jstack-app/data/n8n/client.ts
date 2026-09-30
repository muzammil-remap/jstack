/**
 * `callWebhook(key, body)` — the one way the app reaches n8n (ADR-76): a JSON POST to the proxy at
 * `<N8N_BASE_URL>/<key>`, answered `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
 *
 * What it does, and why each is here rather than in a caller:
 *
 *  - **No secret, no n8n path.** The browser names a short allow-listed key; the proxy maps it to
 *    the webhook and adds the header auth (`remap/dev-proxy.mjs`, nginx in production). Nothing in
 *    this file, or anything it is given, can name a webhook path.
 *  - **The app's own transport rules.** The page must be on HTTPS or loopback, and the proxy's
 *    address passes the same cleartext and pinning guard as the real backend's
 *    (`data/transport/http.ts`, `data/pins.ts`) — one policy, not a second copy of it.
 *  - **A timeout** (`API_TIMEOUT_MS`), surfaced as the network failure `outbox.ts` and
 *    `reachability.ts` already recognise, so a hung proxy reads as "offline" rather than hanging.
 *  - **One retry** on a network failure or a 5xx, never on a 4xx: a refusal will not change its
 *    mind, and a bad minute usually passes. A write is retried only when it carries an `offlineId`
 *    the workflow dedupes on — repeating any other write could apply it twice.
 *  - **One request per page load.** A read with the same key and body within 30 seconds shares the
 *    first one's answer, so `/today` and `/calendar` asking for the same window run the workflow
 *    once. A failure is forgotten at once, so the next ask tries again, and so is every shared read
 *    of a key a write goes to — the reload after answering a card must see it answered.
 */
import { API_TIMEOUT_MS, N8N_BASE_URL } from "@/data/config";
import { guardTransport } from "@/data/pins";
import { assertSecureOrigin } from "@/data/transport/http";
import type { WebhookKey } from "./registry";

/** A webhook, or the proxy in front of it, said no. `status` is already the contract's: the DASH
 * `VALIDATION_ERROR` is a `422`, a late undo a `409` (`remap/WEBHOOKS.md` §C). */
export class N8nError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** The DASH workflows' error codes, and the proxy's own, as the contract's statuses. */
const STATUS_FOR: Record<string, number> = {
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNDO_EXPIRED: 409,
  SETUP_ERROR: 500,
  UPSTREAM_ERROR: 502,
  UPSTREAM_UNREACHABLE: 502,
  // remap/dev-proxy.mjs
  NOT_ALLOWED: 404,
  METHOD: 405,
  TOO_LARGE: 413,
  TIMEOUT: 504,
};

const SHARE_MS = 30_000;
const shared = new Map<string, { at: number; answer: Promise<unknown> }>();

function forget(key: WebhookKey): void {
  for (const id of shared.keys()) if (id.startsWith(`${key} `)) shared.delete(id);
}

/** The same body always prints the same way, whatever order its keys were written in. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value != null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** `/n8n` on the page's own origin in production, an absolute URL in local dev. */
function endpointFor(key: WebhookKey): string {
  if (/^https?:\/\//i.test(N8N_BASE_URL)) return `${N8N_BASE_URL}/${key}`;
  const page = (globalThis as { location?: { href: string } }).location;
  if (page == null) throw new Error("n8n: EXPO_PUBLIC_N8N_BASE_URL must be an absolute URL where there is no page origin");
  return new URL(`${N8N_BASE_URL}/${key}`, page.href).toString();
}

function requestId(): string {
  return `dash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type Envelope = { ok?: unknown; data?: unknown; error?: { code?: unknown; message?: unknown } };

function unwrap(key: WebhookKey, status: number, text: string): unknown {
  let body: Envelope | null = null;
  try {
    body = text.length > 0 ? (JSON.parse(text) as Envelope) : null;
  } catch {
    body = null;
  }
  if (status >= 200 && status < 300 && body?.ok === true) return body.data;
  const code = typeof body?.error?.code === "string" ? body.error.code : "";
  const message = typeof body?.error?.message === "string" && body.error.message !== "" ? body.error.message : `${key} answered ${status}`;
  const mapped = STATUS_FOR[code] ?? (status >= 400 ? status : 502);
  // a 2xx that is not the envelope is a workflow answering the wrong shape — the section's error, not data
  throw new N8nError(mapped, code === "" ? (status >= 400 ? "HTTP" : "BAD_REPLY") : code, message);
}

async function postOnce(key: WebhookKey, url: string, body: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, request_id: requestId() }),
    });
    return unwrap(key, res.status, await res.text());
  } catch (error) {
    // the class outbox.ts and reachability.ts read as a lost connection
    if (controller.signal.aborted) throw new Error(`network timeout: ${key} did not answer`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** A network failure or a 5xx. Not a 2xx in the wrong shape: that workflow ran, and running it
 * again would only repeat what it did. */
const retryable = (error: unknown) => !(error instanceof N8nError) || (error.status >= 500 && error.code !== "BAD_REPLY");

async function send(key: WebhookKey, body: Record<string, unknown>, retry: boolean): Promise<unknown> {
  assertSecureOrigin();
  const url = endpointFor(key);
  await guardTransport(url);
  try {
    return await postOnce(key, url, body);
  } catch (error) {
    if (!retry || !retryable(error)) throw error;
    return postOnce(key, url, body);
  }
}

/**
 * POST `body` to the proxy's `key` and return the workflow's `data`. Throws an `N8nError` when the
 * workflow or the proxy refused, and the network's own error when nothing answered.
 *
 * `write: true` never shares an answer — two taps are two writes — and is retried only when the
 * body carries an `offlineId`.
 */
export function callWebhook(key: WebhookKey, body: Record<string, unknown>, opts: { write?: boolean } = {}): Promise<unknown> {
  if (opts.write === true) {
    // a write changes what its key's reads would say: the reload after it asks again, and a read
    // that was in flight beside it is dropped once it settles, whichever way it went
    forget(key);
    const sent = send(key, body, typeof body.offlineId === "string" && body.offlineId !== "");
    sent.then(() => forget(key), () => forget(key));
    return sent;
  }

  const at = Date.now();
  for (const [k, entry] of shared) if (at - entry.at >= SHARE_MS) shared.delete(k);
  const id = `${key} ${stable(body)}`;
  const existing = shared.get(id);
  if (existing != null) return existing.answer;

  const answer = send(key, body, true);
  shared.set(id, { at, answer });
  // a failure is not an answer worth sharing: the next ask tries again
  answer.catch(() => {
    if (shared.get(id)?.answer === answer) shared.delete(id);
  });
  return answer;
}
