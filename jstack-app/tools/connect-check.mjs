/**
 * `node tools/connect-check.mjs <BASE_URL> [--writes]` — step 1 of "prove it works"
 * (HANDOVER.md §1.7, D-2): the same sweep `tools/conformance.mjs` runs, and its
 * writes only with `--writes` (WPF-9), with an evidence path of its own
 * (`evidence/connect/<date>/`, so a rerun the same day is a fresh file,
 * not a silently overwritten one — REMAP running this after every deploy is
 * the whole point of the command) and ONE line at the end saying whether
 * the base URL is good, on top of the full per-route transcript
 * `conformance.mjs` itself already prints:
 *
 *   node tools/connect-check.mjs http://localhost:8788
 *   pnpm connect:check https://api.example.com/api/v1
 *
 * Exit 0, `CONNECT OK`, if every check passed or was skipped for a stated
 * reason. Exit 1, `CONNECT FAILED`, naming the first failing route and
 * field. Exit 2, a usage line or `CONNECT FAILED — could not reach …`, if
 * there was no base URL to check or the host never answered.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { conformance } from "./conformance.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const base = process.argv[2];
if (!base) {
  console.error("usage: node tools/connect-check.mjs <BASE_URL> [--writes]");
  process.exit(2);
}

const writeDir = join(root, "evidence", "connect", new Date().toISOString().slice(0, 10));

let counts;
let results;
try {
  ({ counts, results } = await conformance(base, { writeDir, writes: process.argv.includes("--writes") }));
} catch (error) {
  const cause = error?.cause?.code ?? error?.code ?? error?.message ?? String(error);
  console.log(`CONNECT FAILED — could not reach ${base} (${cause})`);
  process.exit(2);
}

console.log("");
if (counts.fail === 0) {
  console.log(`CONNECT OK — ${counts.pass} passed, ${counts.skip} skipped, against ${base}`);
  process.exitCode = 0;
} else {
  const first = results.find((r) => r.status === "fail");
  console.log(`CONNECT FAILED — ${first.name}: ${first.detail}`);
  process.exitCode = 1;
}
