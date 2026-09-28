/**
 * The in-process mock transport (ADR-02): routes straight into
 * data/mock/server.ts's router — no network, no serialisation round trip,
 * but the same request/response shape as httpTransport so ApiAdapter (and
 * every test built against it) is oblivious to which one is live.
 */
import { handle } from "@/data/mock/server";
import { onServerEvent as onMockServerEvent } from "@/data/mock/events";
import type { Transport, TransportResponse } from "./Transport";

export const mockTransport: Transport = async (req): Promise<TransportResponse> => {
  return handle(req) as Promise<TransportResponse>;
};

/**
 * The server pushing, rather than the client asking (D-1). A real transport
 * carries this over a socket; the mock calls subscribers in process. Same
 * signature either way, so `lib/serverEvents.ts` does not know or care which
 * one it is subscribed to.
 */
export const onServerEvent = onMockServerEvent;
