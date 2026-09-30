/**
 * The n8n transport (ADR-76): the third implementation of the one boundary, beside `httpTransport`
 * and `mockTransport`, answering every route from Josh's n8n webhooks or honestly without them.
 *
 * It is a dispatcher, not a server. Each request is matched against `data/routes.ts` in table order
 * (the same precedence the mock's router keeps — `/tasks/waiting` before `/tasks/{id}`), then:
 *
 *  - a GET follows its row in `data/n8n/registry.ts` — a webhook through its adapter, a composite
 *    assembled from other webhooks, a configuration default, or the contract's empty value;
 *  - a write with a key goes to its webhook; every other write answers `501 { reason: "not
 *    connected yet" }` and never leaves the device.
 *
 * While the device is locked, every call but the unlocking ones waits for the unlock (ADR-83).
 *
 * A webhook's refusal comes back as the contract's status, so `ApiAdapter` throws the same
 * `ContractError` it would for the real backend. A request nothing answered is the network's error,
 * thrown as it is, so the outbox queues it.
 *
 * Reachability (ADR-78) is told only by what really went out. Most answers here are made on the
 * device — a default, an empty value, a 501 — and `withReachability` would read each of them as the
 * server answering: with the proxy down, `sync.probe`'s `GET /capabilities` would put the session
 * back online. So this transport reports the connection itself, around `callWebhook` alone: any
 * answer from the proxy (a refusal included) is `true`, a network failure is `false`, and a local
 * answer says nothing. Nothing above `data/` knows this transport exists: `data/provider.ts`
 * chooses it from `DATA_SOURCE`, and the adapter is oblivious.
 */
import { pathToPattern, ROUTES } from "@/data/routes";
import { callWebhook, N8nError, repliesSoFar } from "@/data/n8n/client";
import { isNetworkFailure } from "./outbox";
import { emptyFor, NOT_CONNECTED } from "@/data/n8n/empty";
import { READS, WRITES, type Asked, type WebhookAdapter, type WebhookKey } from "@/data/n8n/registry";
import type { Socket } from "@/lib/voice";
import type { Transport, TransportResponse } from "./Transport";

type Route = (typeof ROUTES)[number];

type Report = (online: boolean) => void;

const TABLE = ROUTES.map((route) => ({ route, pattern: pathToPattern(route.path) }));

/** Runs an answer that may go out to n8n, reporting the connection around it: any answer from the
 * proxy (a refusal included) says online, a network failure says offline — and an answer made on
 * the device alone (a refusal before any call) says nothing. */
async function reached(run: () => Promise<TransportResponse>, report: Report): Promise<TransportResponse> {
  const before = repliesSoFar();
  let res: TransportResponse;
  try {
    res = await run();
  } catch (error) {
    if (error instanceof N8nError) {
      report(true); // the proxy had to be reached to refuse
      return { status: error.status, json: { reason: error.message } };
    }
    if (isNetworkFailure(error)) report(false);
    throw error;
  }
  if (repliesSoFar() > before) report(true);
  return res;
}

function viaWebhook(key: WebhookKey, adapter: WebhookAdapter, asked: Asked, write: boolean, report: Report): Promise<TransportResponse> {
  if ("answer" in adapter) return reached(() => adapter.answer(asked), report);
  return reached(async () => adapter.toContract(await callWebhook(key, adapter.body(asked), { write }), asked), report);
}

async function read(route: Route, asked: Asked, report: Report): Promise<TransportResponse> {
  const row = READS[route.name];
  if (row == null) return NOT_CONNECTED;
  switch (row.kind) {
    case "default":
      return row.answer(asked);
    case "wired":
      // a row whose adapter has not been written yet is a stub: its empty value, never a call
      return row.adapter == null ? emptyFor(route.response, asked) : viaWebhook(row.key, row.adapter, asked, false, report);
    case "derived":
      // assembled from the webhooks it uses; until its answer is written, the empty value
      return row.answer == null ? emptyFor(route.response, asked) : reached(() => row.answer!(asked), report);
    case "empty":
      return emptyFor(route.response, asked);
    case "unavailable":
      return NOT_CONNECTED;
  }
}

async function write(route: Route, asked: Asked, report: Report): Promise<TransportResponse> {
  const wired = WRITES[route.name];
  if (wired == null || asked.req.multipart != null) return NOT_CONNECTED;
  return viaWebhook(wired.key, wired.adapter, asked, true, report);
}

/** The device gate: whether it is shut, and a promise for the moment it opens. */
export type Gate = { locked: () => boolean; opened: () => Promise<void> };

const ALWAYS_OPEN: Gate = { locked: () => false, opened: async () => {} };

/**
 * The transport, reporting the connection to `report` and holding every call while `gate` is shut —
 * `data/provider.ts` passes the session's for both.
 *
 * ADR-83: a locked app gets nothing, as Josh's server gives nothing to a device that has not passed
 * this open's passkey ceremony (`CONTRACT.md` §4, "`401` no session or locked"). The call WAITS
 * rather than answering 401: the shell loads its settings, parameters and the mounted tab once, under
 * the gate, and nothing loads them again on unlock, so a refusal would leave them failed. Waiting,
 * nothing reaches the proxy until the gate opens, and then every held call goes out as it was asked.
 * What unlocks — the nonce, the ceremony, recovery — and the emergency lock go through
 * (`whileLocked`, the rows `lib/lockGate.ts` lets past too).
 */
export function createN8nTransport(report: Report = () => {}, gate: Gate = ALWAYS_OPEN): Transport {
  return async (req) => {
    for (const { route, pattern } of TABLE) {
      if (route.method !== req.method) continue;
      const m = pattern.exec(req.path);
      if (m == null) continue;
      // re-checked after each wait: a gate that shut again before this call's turn holds it again
      while (route.whileLocked !== true && gate.locked()) await gate.opened();
      const asked: Asked = { req, params: m.slice(1).map((p) => decodeURIComponent(p)) };
      return route.method === "GET" ? read(route, asked, report) : write(route, asked, report);
    }
    return { status: 404, json: { reason: `no route for ${req.method} ${req.path}` } };
  };
}

/** The same, reporting to nobody: what the tests sweep. */
export const n8nTransport: Transport = createN8nTransport();

/**
 * n8n has no voice socket (`WS /voice` waits on a provider, `remap/WORKFLOWS-NEEDED.md` §3), and
 * `capabilities.liveVoice` is off, so Talk says so before anything connects. If a session starts
 * anyway it meets a socket that closes at once — never the mock's scripted conversation.
 */
export function n8nVoiceSocket(): Socket {
  return {
    send: () => {},
    close: () => {},
    onOpen: () => {},
    onMessage: () => {},
    onClose: (cb) => {
      setTimeout(cb, 0);
    },
  };
}
