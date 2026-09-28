/**
 * D-1 — hosts the REAL in-process mock (`data/mock/server.ts`) behind
 * `node:http`, the way `tests/unit/conformance.test.ts`'s `startServer`
 * does. `tools/serve-mock.mjs` is `pnpm serve:mock`'s whole implementation:
 * it runs exactly this file with `JSTACK_SERVE_MOCK_RIG=1` set and
 * `--testPathPattern` narrowed to it.
 *
 * It has to be a real `*.test.ts` file under `tests/unit/` — `jest.config.js`
 * is a multi-project config, and `--runTestsByPath` still asks each project's
 * `testMatch` which file belongs to it, so a file outside that shape is
 * simply never found (tried first, as `tests/rig/serveMockRig.ts` — "No
 * tests found"). The env-var gate is what keeps `pnpm test`'s own full run
 * harmless: unset, this test skips itself instantly instead of hanging the
 * whole board.
 *
 * The mock's module graph pulls in `react-native` (several handlers,
 * transitively) whose Flow-flavoured source only Jest's babel transform (via
 * `jest-expo`) can parse — a plain `node`/`tsx` run of `data/mock/server.ts`
 * fails on that before it reaches app code, which is why this runs as a Jest
 * test rather than as a standalone script importing the same modules.
 *
 * `process.stdout.write` (not `console.log`) is deliberate: Jest's console
 * patching only wraps the `console` object, and a worker buffers a test
 * file's console output until that file's run reports back — never, for a
 * test that intentionally does not resolve. `tools/serve-mock.mjs` also
 * passes `--runInBand`, so there is no worker to buffer behind regardless.
 */
import { createServer } from "node:http";
import { reset } from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import type { TransportRequest } from "@/data/transport/Transport";

const RUN = process.env.JSTACK_SERVE_MOCK_RIG === "1";

(RUN ? test : test.skip)(
  "serves the mock over http until killed",
  async () => {
    reset();

    const PORT = Number(process.env.JSTACK_MOCK_PORT ?? 4181);
    const PREFIX = "/api/v1";
    const includeTestRoutes = process.env.JSTACK_MOCK_TEST_ROUTES === "1";

    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        void (async () => {
          const url = new URL(req.url ?? "/", "http://127.0.0.1");
          if (!url.pathname.startsWith(PREFIX)) {
            res.writeHead(404, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: `no route under ${PREFIX}: ${url.pathname}` }));
            return;
          }
          const path = url.pathname.slice(PREFIX.length) || "/";
          // D-1: the rig routes (`/__test__/*`, `/__mirror__/*`) only exist
          // for `pnpm connect:check`'s own tests and the swap lane — a real
          // backend never serves them, so the default run refuses them too
          // rather than letting a conformance check pass against a route no
          // server has.
          if (!includeTestRoutes && (path.startsWith("/__test__/") || path.startsWith("/__mirror__/"))) {
            res.writeHead(404, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "test-only route; serve-mock needs --test to enable it" }));
            return;
          }
          const query: Record<string, string> = {};
          url.searchParams.forEach((v, k) => (query[k] = v));
          const rawBody = Buffer.concat(chunks).toString("utf8");
          const body = rawBody.length > 0 ? (JSON.parse(rawBody) as unknown) : undefined;
          const result = await handle({ method: (req.method ?? "GET") as TransportRequest["method"], path, query, body });
          res.writeHead(result.status, { "content-type": "application/json" });
          res.end(result.json != null ? JSON.stringify(result.json) : "");
        })().catch((error: unknown) => {
          // WM-04's own lesson, repeated here: a handler that throws must
          // still answer, or the socket stays open and whoever is waiting
          // times out with no clue which route did it.
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: String(error) }));
        });
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(PORT, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address != null ? address.port : PORT;
        process.stdout.write(`JSTACK_MOCK_BASE=http://127.0.0.1:${port}${PREFIX}\n`);
        resolve();
      });
    });

    // Held open deliberately — `tools/serve-mock.mjs` (or whoever spawned
    // it) kills the process to stop it; there is no other way to end a
    // serve command.
    await new Promise(() => {});
  },
  2_147_483_647,
);
