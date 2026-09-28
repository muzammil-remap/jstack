/**
 * `node tools/serve-mock.mjs [--port <n>] [--test]` — the real in-process
 * mock (`data/mock/server.ts`), served at `http://127.0.0.1:<port>/api/v1`
 * (default 4181; never 4173, the web export's port, or 4180) so
 * `tools/conformance.mjs` and `tools/connect-check.mjs` have a known-good
 * server to run against without a real backend (D-1, D-2) — it runs inside
 * a Jest worker (`jest-expo`'s own startup, not a bug), so give it around
 * half a minute: `Running one project: unit` is Jest's own banner, printed
 * first; the base URL line after it is the one that means the server is
 * actually listening.
 *
 * It cannot import the mock directly: `data/mock/server.ts` pulls in several
 * handlers that transitively import `react-native`, whose source only Jest's
 * babel transform (via `jest-expo`) parses — a plain `node`/`tsx` load of
 * that graph fails before any app code runs. `tests/unit/serveMockRig.test.ts`
 * hosts the same `handle()` `tests/unit/conformance.test.ts` already proves
 * correct, and normally skips itself so `pnpm test`'s own full run stays
 * harmless — `JSTACK_SERVE_MOCK_RIG=1` (set only here) is what turns it into
 * a real, never-resolving test. `--testPathPattern` runs only that one file,
 * and `--runInBand` keeps it in the main process rather than a worker, so
 * its stdout is not buffered behind a test that is designed to never finish.
 * `--reporters=default` overrides `jest.config.js`'s own reporters list for
 * this one child — `tools/serve-mock.mjs` running as a test's OWN subprocess
 * (`tests/unit/serveMock.test.ts`, under a plain `pnpm test`) must not also
 * run `tools/jest-summary-reporter.cjs`, which writes `evidence/jest-summary
 * .json`: two Jest processes racing to write that file is how the board's
 * own counts came out corrupted the first time this ran inside `pnpm test`.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  let port = 4181;
  let test = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--test") test = true;
    else if (argv[i] === "--port") port = Number(argv[++i]);
  }
  // 0 is a real value here (ask the OS for an ephemeral port) — only
  // negative or non-integer input is refused.
  if (!Number.isInteger(port) || port < 0) throw new Error(`--port must be a non-negative integer, got: ${port}`);
  if (port === 4173 || port === 4180) throw new Error(`port ${port} is reserved (4173 is the web export, 4180 the swap lane) — pick another`);
  return { port, test };
}

const { port, test } = parseArgs(process.argv.slice(2));

const jestBin = join(root, "node_modules", "jest", "bin", "jest.js");
const child = spawn(
  process.execPath,
  [
    jestBin,
    "--config",
    "jest.config.js",
    "--selectProjects",
    "unit",
    "--testPathPattern",
    "tests/unit/serveMockRig\\.test\\.ts",
    "--runInBand",
    "--reporters=default",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      // Defensive: if this is itself spawned from inside a Jest worker (a
      // dev running `pnpm test` while `serveMock.test.ts` starts this up),
      // an inherited JEST_WORKER_ID would tell the child Jest it is already
      // inside a worker it is not.
      JEST_WORKER_ID: undefined,
      JSTACK_SERVE_MOCK_RIG: "1",
      JSTACK_MOCK_PORT: String(port),
      JSTACK_MOCK_TEST_ROUTES: test ? "1" : "0",
    },
  },
);

// A dev's Ctrl+C (or a test tearing this down) should stop the mock, not
// orphan the Jest process still holding the port.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
  });
}

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
