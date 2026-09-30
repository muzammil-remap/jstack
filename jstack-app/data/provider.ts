/**
 * Provider swap point (ADR-02). One ApiAdapter, three transports:
 * `httpTransport` (the real backend, go-live), `mockTransport` (routes
 * into data/mock/server.ts) and, for REMAP's n8n build (ADR-76),
 * `n8nTransport` (Josh's n8n webhooks through a proxy). `DATA_SOURCE` in
 * data/config.ts chooses — no other file changes.
 */
import { ApiAdapter } from "./ApiAdapter";
import { API_BASE_URL, DATA_SOURCE, USE_API_ADAPTER } from "./config";
import { mockVoiceSocket } from "@/data/mock/voice";
import { webSocket, type Socket } from "@/lib/voice";
import type { DataProvider } from "./DataProvider";
import { httpTransport } from "./transport/http";
import { mockTransport } from "./transport/mock";
import { n8nTransport, n8nVoiceSocket } from "./transport/n8n";
import type { Transport } from "./transport/Transport";
import { withOutbox, type Outbox } from "./transport/outbox";
import { withReachability } from "./transport/reachability";
import { createQueueStore } from "@/lib/queueStore";
import { useSessionStore } from "@/stores/session";

let instance: DataProvider | null = null;
let outbox: Outbox | null = null;

/**
 * O-1: the outbox wraps whichever transport is live, so a capture survives a
 * dead connection on the real backend and in the demo alike. It is a LAYER on
 * the one boundary, not a second path — `ApiAdapter` never learns it exists,
 * and a route the table does not mark `offline: true` passes straight through.
 *
 * `isOnline` is read from the session store rather than captured, so flipping
 * it (a real listener, or the rig) takes effect on the next call rather than
 * on the next reload.
 *
 * A-1: over HTTP the requests are also how the session learns whether the
 * server can be reached (`transport/reachability.ts`) — the one signal a phone
 * has, because React Native fires no `online` event. It sits UNDER the outbox,
 * so a queued 202 is never mistaken for the server answering. The mock has no
 * network to lose and reports nothing: there the rig's `goOffline` stays the
 * only word on the connection, which is what the e2e board drives. The n8n
 * transport has a network, so it is wrapped exactly as HTTP is (ADR-76).
 */
function liveTransport(): Transport {
  // `=== "n8n"`, not a switch: a test that mocks data/config with only the older names leaves DATA_SOURCE undefined
  if (DATA_SOURCE === "n8n") return withReachability(n8nTransport, reportReachable);
  return USE_API_ADAPTER ? withReachability(httpTransport, reportReachable) : mockTransport;
}

function build(): { adapter: DataProvider; outbox: Outbox } {
  const inner = liveTransport();
  // WPA-15: the emergency lock is read the same way — while it is on, the outbox keeps nothing new
  const wrapped = withOutbox(inner, createQueueStore(), () => useSessionStore.getState().online, () => useSessionStore.getState().emergency);
  return { adapter: new ApiAdapter(wrapped.transport), outbox: wrapped };
}

/** Only a CHANGE is written: every request reports, and a store update per
 * request would wake every subscriber for nothing. */
function reportReachable(online: boolean): void {
  if (useSessionStore.getState().online !== online) useSessionStore.getState().setOnline(online);
}

export function getAdapter(): DataProvider {
  if (!instance) ({ adapter: instance, outbox } = build());
  return instance;
}

/** The queue behind the adapter — `stores/sync.ts` drives it, nothing else. */
export function getOutbox(): Outbox {
  if (!outbox) ({ adapter: instance, outbox } = build());
  return outbox;
}

/**
 * The voice socket, chosen the same way the transport is (V-2). It lives
 * here rather than in `stores/voice.ts` for the reason `CT-03` enforces: the
 * mock is the SERVER, and nothing above `data/` may know which server it is
 * talking to. A store that imported `data/mock/voice` directly would be the
 * one place in the app that could tell.
 */
export function getVoiceSocket(): Socket {
  // ADR-76: on n8n there is no voice server, and the mock's scripted conversation would be fixture content
  if (DATA_SOURCE === "n8n") return n8nVoiceSocket();
  if (USE_API_ADAPTER && API_BASE_URL != null) return webSocket(`${API_BASE_URL.replace(/^http/, "ws")}/voice`);
  return mockVoiceSocket();
}
