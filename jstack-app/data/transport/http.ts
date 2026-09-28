/**
 * The real transport (ADR-02): fetch, the auth header and the pinning
 * guard (SEC-08). The request log the test hook reads (`calls()`) lives in
 * ApiAdapter.ts, one level up — it logs every call regardless of which
 * transport carried it, so `__JSTACK__.calls()` reads the same shape in
 * mock mode and in the BS-05 swap.
 */
import { ContractError } from "@/data/ApiAdapter";
import { API_BASE_URL, API_CREDENTIALS, API_TIMEOUT_MS, AUTH, UPLOAD_TIMEOUT_MS } from "@/data/config";
import { guardTransport } from "@/data/pins";
import type { Transport, TransportRequest, TransportResponse } from "./Transport";

function buildUrl(req: TransportRequest): string {
  if (API_BASE_URL == null) throw new Error("httpTransport used with no API_BASE_URL set");
  // WPF-1: a route path is RELATIVE to the base. Resolved as written, with its
  // leading "/", it replaced the base's own path, so `https://<host>/api/v1`
  // (HANDOVER.md) lost its `/api/v1` on every call. `tools/conformance.mjs`
  // builds the same way, and `tests/unit/conformance.test.ts` holds the two to
  // one URL under a base with a path.
  const url = new URL(req.path.replace(/^\//, ""), API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`);
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (v != null) url.searchParams.set(k, v);
  }
  return url.toString();
}

/**
 * ID-03: the app's OWN origin, not the API's. `guardTransport` below refuses
 * to SEND to a cleartext host; this refuses to RUN on one. A build served
 * over http:// hands every token it holds to anyone on the network no matter
 * how carefully it talks to the backend, and the honest thing is to stop
 * rather than to work while being unsafe. Loopback is exempt because that is
 * where the app is developed.
 */
function assertSecureOrigin(): void {
  const loc = (globalThis as { location?: { protocol: string; hostname: string } }).location;
  if (loc == null) return; // native: there is no page origin to check
  const loopback = loc.hostname === "localhost" || loc.hostname === "127.0.0.1";
  if (loc.protocol !== "https:" && !loopback) {
    throw new ContractError(0, { reason: "insecure origin" });
  }
}

/**
 * The upload's body. On native `data` is a file URI, and React Native's
 * `FormData` accepts the `{ uri, name, type }` shape it recognises; on web it
 * is a `Blob` and `append` takes the filename as its third argument.
 */
function buildForm(multipart: NonNullable<TransportRequest["multipart"]>): FormData {
  const form = new FormData();
  const { file, fields } = multipart;
  if (typeof file.data === "string") form.append("file", { uri: file.data, name: file.filename, type: file.contentType } as unknown as Blob);
  else form.append("file", file.data, file.filename);
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (v != null) form.append(k, v);
  }
  return form;
}

/**
 * WPF-2: the status before the body. An error page that is not JSON — a proxy's
 * HTML 502, a gateway's plain-text 429 — threw a `SyntaxError` here, which lost
 * the status: the outbox read a server that had only put a capture off as a bug
 * in the client, and listed the capture. An error keeps its status and says so;
 * a success that is not JSON is the fault it always was.
 */
function bodyOf(text: string, status: number): unknown {
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    if (status >= 400) return { reason: `answered ${status}` };
    throw error;
  }
}

export const httpTransport: Transport = async (req): Promise<TransportResponse> => {
  assertSecureOrigin();
  const url = buildUrl(req);
  await guardTransport(url);
  const token = await AUTH.getToken();
  // X-1: an upload is `FormData`, and the content-type header is DELIBERATELY
  // absent for it — `fetch` sets `multipart/form-data` with the boundary it
  // generated, and a hand-written header would omit the boundary and make the
  // body unparseable at the other end.
  const form = req.multipart == null ? null : buildForm(req.multipart);
  // D-4: CONTRACT.md Q20 used to say "the client sets no request timeout of
  // its own", so a request that never answered was never abandoned — a
  // capture that could not queue itself because nothing ever failed. An
  // upload gets its own, longer allowance (data/config.ts).
  //
  // Our own AbortController, not `AbortSignal.timeout()`: what an aborted
  // `fetch` throws is not the same shape everywhere — Node's own fetch
  // throws a `DOMException` named `TimeoutError`, but React Native's fetch
  // polyfill (what the native build, and this file's own Jest lane, run
  // against) does not, so a check keyed on `error.name` silently never
  // matched there and let the original message through unwrapped. Checking
  // `controller.signal.aborted` instead needs nothing from the error at
  // all — it is true only because OUR timer fired, on every runtime alike.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), form == null ? API_TIMEOUT_MS : UPLOAD_TIMEOUT_MS);
  try {
    // D-13: the timer used to clear once `fetch` RESOLVED — headers in,
    // status known — which is not "the response arrived": a server that
    // answers promptly and then stalls the body (a slow proxy, a dropped
    // connection mid-stream) left `res.text()` with nothing left to abort
    // it, hanging the same caller the timeout exists to release. The
    // controller's signal aborts a body read on the same Response it aborts
    // the request with (the Fetch spec ties `response.body` to the fetch
    // that produced it), so keeping the timer armed across BOTH awaits is
    // the whole fix — no second timer, no second abort path.
    const res = await fetch(url, {
      method: req.method,
      signal: controller.signal,
      // D-5: explicit, not fetch's implicit "same-origin" default — a lever
      // REMAP can pull for a cross-origin deployment (data/config.ts).
      credentials: API_CREDENTIALS,
      headers: {
        ...(form == null ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: form ?? (req.body != null ? JSON.stringify(req.body) : undefined),
    });
    // WPF-2: read through `bodyOf`, which keeps an error's status when its
    // body is not JSON — still inside D-13's timer, so a stalled body on an
    // error response is abandoned exactly like a stalled body on a success.
    return { status: res.status, json: bodyOf(await res.text(), res.status) };
  } catch (error) {
    // Surfaced as the same network-failure class data/transport/outbox.ts
    // already recognises (its message regex matches "network", "fetch",
    // "load failed", "connection") — a queueable write times out into the
    // queue instead of hanging its caller forever, and a read shows the
    // existing error path, same as any other dropped connection.
    if (controller.signal.aborted) {
      throw new Error(`network timeout: ${req.method} ${url} did not answer`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
