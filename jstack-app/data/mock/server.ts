/**
 * The in-process mock server (ADR-02, CONTRACT_v2.md §7) — the executable
 * half of the contract. S-1: the router is BUILT from `data/routes.ts`'s
 * one table (name, method, path, marker, handler, group) rather than
 * hand-duplicating a second `[method, pattern, handler]` list here; every
 * handler takes `(req, ...pathParams)` uniformly so `entry.handler`
 * ("module.function") resolves generically against `MODULES` below.
 * Matches real request paths the way httpTransport builds them (no
 * leading `/api/v1`; that base is httpTransport's job).
 */
import * as agents from "@/data/mock/handlers/agents";
import * as brain from "@/data/mock/handlers/brain";
import * as search from "@/data/mock/handlers/search";
import * as calendar from "@/data/mock/handlers/calendar";
import * as decisions from "@/data/mock/handlers/decisions";
import * as files from "@/data/mock/handlers/files";
import * as life from "@/data/mock/handlers/life";
import * as mirror from "@/data/mock/handlers/mirror";
import * as parameters from "@/data/mock/handlers/parameters";
import * as sections from "@/data/mock/handlers/sections";
import * as session from "@/data/mock/handlers/session";
import * as settings from "@/data/mock/handlers/settings";
import * as tasks from "@/data/mock/handlers/tasks";
import * as test from "@/data/mock/handlers/test";
import * as today from "@/data/mock/handlers/today";
import * as usage from "@/data/mock/handlers/usage";
import { pathToPattern, ROUTES as ROUTE_TABLE } from "@/data/routes";
import { validateRequestBody } from "@/data/mock/validateBody";
import { err, remember, replayed } from "@/data/mock/util";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

type Handler = (req: TransportRequest, ...params: string[]) => TransportResponse | Promise<TransportResponse>;

/** `entry.handler` ("agents.getAgentSummary") resolves against this — the
 * one place that knows what "agents" or "settings" means as a module.
 *
 * Exported for `tests/unit/routes.test.ts`, which used to keep its own copy
 * of this list and therefore stopped covering the first module added after it
 * was written (L-1's `parameters`): the test passed while asserting nothing
 * about three new routes. A second copy is a copy that drifts (rule 16). */
export const HANDLER_MODULES: Record<string, Record<string, Handler>> = {
  agents: agents as unknown as Record<string, Handler>,
  brain: brain as unknown as Record<string, Handler>,
  search: search as unknown as Record<string, Handler>,
  calendar: calendar as unknown as Record<string, Handler>,
  decisions: decisions as unknown as Record<string, Handler>,
  files: files as unknown as Record<string, Handler>,
  life: life as unknown as Record<string, Handler>,
  parameters: parameters as unknown as Record<string, Handler>,
  sections: sections as unknown as Record<string, Handler>,
  session: session as unknown as Record<string, Handler>,
  settings: settings as unknown as Record<string, Handler>,
  tasks: tasks as unknown as Record<string, Handler>,
  today: today as unknown as Record<string, Handler>,
  usage: usage as unknown as Record<string, Handler>,
};

/** Routes that work even while the session is locked (§4.1): the rows
 * `data/routes.ts` marks `whileLocked` — the nonce, registration, refresh,
 * the passkey ceremony, recovery and the emergency lock itself — the flag
 * `lib/lockGate.ts` reads too, so the server's half of this rule and the
 * client's cannot drift apart again (WPF-3). `/session`
 * is deliberately NOT here (LK-04: "`GET /session` returns 401 until
 * recovery" after `POST /lock` revokes) — the locked screen gets its
 * emergency/normal state from the client's own `session.ts`, which
 * already knows (it triggered the lock), not from re-fetching it. */
const UNLOCKED_ROUTES = ROUTE_TABLE.filter((r) => r.whileLocked === true).map((r) => pathToPattern(r.path));

type Route = readonly [method: TransportRequest["method"], pattern: RegExp, handler: Handler, offline: boolean];

const ROUTES: Route[] = ROUTE_TABLE.map((entry) => {
  const [moduleName, fnName] = entry.handler.split(".");
  const fn = HANDLER_MODULES[moduleName]?.[fnName];
  if (fn == null) throw new Error(`data/routes.ts: handler "${entry.handler}" not found for route "${entry.name}"`);
  return [entry.method, pathToPattern(entry.path), fn, entry.offline === true] as const;
});

/**
 * Test-rig routes: mock-only, deliberately NOT in `data/routes.ts` so they can
 * never reach `openapi.yaml` (hard rule 5). They are matched before the table
 * and before the lock gate — a rig that could not reseed a locked session
 * would be unable to set up half the tests that matter.
 */
const TEST_ROUTES: Record<string, Handler> = {
  "POST /__test__/user": test.setTestUser,
  "POST /__test__/refresh-reuse": test.setTestRefreshReuse,
  "POST /__test__/revoke": test.setTestRevoke,
  // T-5/WK-03: flip an agent's working state on the SERVER and watch three
  // surfaces follow, through the `tasks` event rather than a reload.
  "POST /__test__/work": test.setTestWork,
  // UP-06: a file landing in the Dropbox inbox from the iOS Shortcut.
  "POST /__test__/inbox": test.setTestInbox,
  // TM-01: not a test route — a demo of a real second channel. Still
  // mock-only, still never in the published contract.
  "POST /__mirror__/telegram": mirror.postTelegramMirror,
};

/**
 * X-1: rig routes that take a PATH PARAMETER, which the exact-match map above
 * cannot express. One entry so far — the blob an upload stored — and it is
 * here rather than in `data/routes.ts` for the same reason as every other rig
 * route: it must never reach `openapi.yaml`, because no real backend serves
 * bytes from this path (hard rule 5).
 */
const TEST_PATTERNS: readonly (readonly [method: TransportRequest["method"], pattern: RegExp, handler: Handler])[] = [
  ["GET", pathToPattern("/__test__/files/{id}"), files.getFileBlob],
];

export async function handle(req: TransportRequest): Promise<TransportResponse> {
  const rig = TEST_ROUTES[`${req.method} ${req.path}`];
  if (rig != null) return rig(req);
  for (const [method, pattern, handler] of TEST_PATTERNS) {
    if (method !== req.method) continue;
    const m = pattern.exec(req.path);
    if (m) return handler(req, ...m.slice(1));
  }

  if (session.isLocked() && !UNLOCKED_ROUTES.some((pattern) => pattern.test(req.path))) {
    return err(401, "locked");
  }
  for (const [method, pattern, handler, offline] of ROUTES) {
    if (method !== req.method) continue;
    const m = pattern.exec(req.path);
    if (!m) continue;

    // H-1(e), SH-10: the body is validated against the generated contract
    // before any handler sees it. CONTRACT §8 Q10 says the app ASSUMES a real
    // backend does this and answers `422 { field, reason }`; an assumption
    // nothing exercises is a hope, and the app's own 422 handling had never
    // been driven by a real 422.
    const invalid = validateRequestBody(req);
    if (invalid != null) return invalid;

    // O-1: the `offlineId` gate, HERE rather than in each capture handler.
    // The mock had exactly one hand-rolled dedupe (brain dump's) and it was
    // missing the `duplicate` flag §4.12 promises — which is what happens to
    // a rule six handlers each have to remember. The router knows which
    // routes are captures, because `data/routes.ts` says so.
    if (offline) {
      // A4R7-14: an upload carries its offlineId in its multipart FIELDS, not a
      // body, and a replayed upload was filed twice
      const key = req.multipart != null ? { offlineId: req.multipart.fields?.offlineId } : req.body;
      const replay = replayed(key);
      if (replay != null) return replay;
      const res = await handler(req, ...m.slice(1));
      if (res.status >= 200 && res.status < 300) remember(key, res.json);
      return res;
    }
    return handler(req, ...m.slice(1));
  }
  return err(404, `no mock route for ${req.method} ${req.path}`);
}
