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
 * A webhook's refusal comes back as the contract's status, so `ApiAdapter` throws the same
 * `ContractError` it would for the real backend. A request nothing answered is the network's error,
 * thrown as it is, so the outbox queues it and the reachability layer takes the session offline.
 * Nothing above `data/` knows this transport exists: `data/provider.ts` chooses it from
 * `DATA_SOURCE`, and the adapter is oblivious.
 */
import { pathToPattern, ROUTES } from "@/data/routes";
import { callWebhook, N8nError } from "@/data/n8n/client";
import { emptyFor, NOT_CONNECTED } from "@/data/n8n/empty";
import { READS, WRITES, type Asked, type WebhookAdapter, type WebhookKey } from "@/data/n8n/registry";
import type { Socket } from "@/lib/voice";
import type { Transport, TransportResponse } from "./Transport";

type Route = (typeof ROUTES)[number];

const TABLE = ROUTES.map((route) => ({ route, pattern: pathToPattern(route.path) }));

async function viaWebhook(key: WebhookKey, adapter: WebhookAdapter, asked: Asked, write: boolean): Promise<TransportResponse> {
  try {
    return adapter.toContract(await callWebhook(key, adapter.body(asked), { write }), asked);
  } catch (error) {
    if (error instanceof N8nError) return { status: error.status, json: { reason: error.message } };
    throw error;
  }
}

async function read(route: Route, asked: Asked): Promise<TransportResponse> {
  const row = READS[route.name];
  if (row == null) return NOT_CONNECTED;
  switch (row.kind) {
    case "default":
      return row.answer(asked);
    case "wired":
      // a row whose adapter has not been written yet is a stub: its empty value, never a call
      return row.adapter == null ? emptyFor(route.response, asked) : viaWebhook(row.key, row.adapter, asked, false);
    case "derived":
    case "empty":
      return emptyFor(route.response, asked);
  }
}

async function write(route: Route, asked: Asked): Promise<TransportResponse> {
  const wired = WRITES[route.name];
  if (wired == null || asked.req.multipart != null) return NOT_CONNECTED;
  return viaWebhook(wired.key, wired.adapter, asked, true);
}

export const n8nTransport: Transport = async (req) => {
  for (const { route, pattern } of TABLE) {
    if (route.method !== req.method) continue;
    const m = pattern.exec(req.path);
    if (m == null) continue;
    const asked: Asked = { req, params: m.slice(1).map((p) => decodeURIComponent(p)) };
    return route.method === "GET" ? read(route, asked) : write(route, asked);
  }
  return { status: 404, json: { reason: `no route for ${req.method} ${req.path}` } };
};

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
