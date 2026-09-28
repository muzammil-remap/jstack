/**
 * `withReachability(inner, report)` — whether the server can be reached, told
 * by the requests themselves (A-1, WP-A).
 *
 * The app learned the connection from the browser alone: `window`'s `online`
 * and `offline` events and `navigator.onLine` (`lib/syncInstall.ts`). React
 * Native has none of them, so on a phone in flight mode `session.online`
 * stayed true, the sync dot said "ok", and every capture tried the dead
 * connection before it queued. No dependency may be added for it, and none is
 * needed, because every request is already a probe:
 *
 *  - a request that fails at the NETWORK layer — the class `outbox.ts` already
 *    recognises, so the app counts itself offline exactly when a capture would
 *    queue — says the connection has gone;
 *  - ANY answer says it is back: a 2xx, and a 409 or a 503 just as much,
 *    because the server had to be reached to refuse;
 *  - an error that is neither says nothing either way. A bug in the client is
 *    not a lost connection, and reading one as the other is B-178's defect in
 *    a new place.
 *
 * It wraps the live transport UNDER the outbox, never over it: the outbox's
 * `202 { queued }` is an answer the app gave itself, and reading that as the
 * server's would put a phone in a tunnel back online. Nothing answers for the
 * server on the way either — `public/sw.js` never caches the API. While offline
 * with something queued, the retry timer sends one cheap read so there is an
 * answer to hear (`stores/sync.ts` `probe`).
 */
import { isNetworkFailure } from "./outbox";
import type { Transport, TransportResponse } from "./Transport";

export function withReachability(inner: Transport, report: (online: boolean) => void): Transport {
  return async (req) => {
    let res: TransportResponse;
    try {
      res = await inner(req);
    } catch (error) {
      if (isNetworkFailure(error)) report(false);
      throw error;
    }
    report(true);
    return res;
  };
}
