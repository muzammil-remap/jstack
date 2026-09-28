/**
 * `tools/conformance.mjs <BASE_URL> [--write <dir>]` — does a real server
 * actually behave like `openapi.yaml` says it does? (W-2, WM-04, WM-05.)
 *
 * The generated contract (W-1) is derived from the app's own source, so it is
 * necessarily true of the MOCK. It says nothing about the server REMAP's
 * developer builds. This runner is the bridge: point it at a base URL and it
 * calls every GET in `data/routes.ts`, validates each response against that
 * route's schema, then performs the writes that are safe to perform against a
 * live system, and prints one line per endpoint.
 *
 *   node tools/conformance.mjs http://localhost:8788
 *   node tools/conformance.mjs https://api.example.com --write evidence
 *
 * Exit 0 if every check passed or was skipped for a stated reason; exit 1
 * naming the first field that disagreed.
 *
 * SAFE writes only, and the list is deliberate (SEC-15: no send/pay/book/
 * revoke anywhere on this path). A capture that dedupes on `offlineId`, a
 * habit log, and a layout change that is reverted in the same run — and only
 * with `--writes` (WPF-9), because they are not invisible: the capture and the
 * habit log stay on the server, registering a device leaves a device, and a
 * revert may restore the server's idea of the previous order rather than the
 * one found (the layout check compares the two). Nothing that leaves the
 * system, nothing that costs money; point `--writes` at a server you can reset. The undo-window check needs to move the server's clock, and there is
 * no clock endpoint in the contract — so it reports itself skipped rather
 * than sleeping eleven seconds in a board run.
 *
 * The request shaping here MIRRORS `data/transport/http.ts`: same URL
 * building, same JSON content type, same bearer header. It cannot import it
 * (that file is TypeScript and this is a dependency-free `.mjs`), so
 * `tests/unit/conformance.test.ts` drives BOTH against one server and
 * compares what the server actually received — a behavioural check, not a
 * hopeful comment.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readRoutesFrom } from "./read-routes.mjs";
import { validate } from "./schema-validate.mjs";
import { parse } from "./yaml.mjs";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Path parameters we can fill without inventing an identifier. */
const LITERAL_PARAMS = { tab: "today", step: "options", noun: "tasks" };

/** How many harvested identifiers to try on a `{id}` route before giving up.
 * A conformance runner must not invent identifiers, so the only honest source
 * is a record the SERVER named in an earlier response — and the first one from
 * the right section is usually, but not always, addressable by the route in
 * hand (`/life/sections/{id}/config` takes a section, not a goal). */
const ID_ATTEMPTS = 6;

/** Query a GET needs before it can answer anything meaningful. `/brain/search`
 * with no `q` is a degenerate call the app never makes. */
const QUERY_FOR = { getBrainSearch: { q: "the" } };

const describeError = (error) =>
  error.name === "TimeoutError" || error.cause?.name === "TimeoutError"
    ? `no response within ${REQUEST_TIMEOUT_MS / 1000}s`
    : `request failed: ${error.message}`;

// The route path is relative to the base, so a base's own path (`/api/v1`) is
// kept — the rule `data/transport/http.ts` follows too (WPF-1), and
// `tests/unit/conformance.test.ts` holds the two to one URL.
function buildUrl(base, path, query) {
  const url = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : base + "/");
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value != null) url.searchParams.set(key, value);
  }
  return url.toString();
}

/** A server that never answers is a conformance failure, not a reason for
 * the run to hang. Without this the tool waits forever on a handler that
 * threw before writing a response — which is exactly what a half-built
 * server does, and exactly what this tool is pointed at. */
const REQUEST_TIMEOUT_MS = 15000;

function makeTransport(base) {
  let token = null;
  const call = async ({ method, path, query, body }) => {
    const res = await fetch(buildUrl(base, path, query), {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text.length > 0 ? JSON.parse(text) : null };
  };
  return { call, setToken: (t) => (token = t) };
}

/** Every `id`-looking string in a response, shallow-first, so a later route
 * with `{id}` has something real to ask for. */
function harvestIds(value, into, depth = 0) {
  if (value == null || depth > 4) return into;
  if (Array.isArray(value)) {
    for (const item of value) harvestIds(item, into, depth + 1);
    return into;
  }
  if (typeof value !== "object") return into;
  if (typeof value.id === "string") into.push(value.id);
  for (const nested of Object.values(value)) harvestIds(nested, into, depth + 1);
  return into;
}

// ─── the run ────────────────────────────────────────────────────────────

const PASS = "pass";
const FAIL = "fail";
const SKIP = "skip";

class Run {
  constructor() {
    this.results = [];
  }

  record(name, status, detail = "") {
    this.results.push({ name, status, detail });
    const mark = status === PASS ? "ok  " : status === FAIL ? "FAIL" : "skip";
    console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
  }

  get failed() {
    return this.results.filter((r) => r.status === FAIL);
  }
}

/** Register a device only if the server actually asks us to. */
async function authenticate(transport, run, writes) {
  const probe = await transport.call({ method: "GET", path: "/session" });
  if (probe.status !== 401) {
    run.record("auth", SKIP, `server answered ${probe.status} unauthenticated; no registration needed`);
    return;
  }
  // WPF-9: registering a device leaves one behind on the server — a write
  if (!writes) {
    run.record("auth", SKIP, "the server asks for a session, and registering a device is a write — pass --writes");
    return;
  }
  const nonce = await transport.call({ method: "GET", path: "/auth/nonce" });
  if (nonce.status !== 200) {
    run.record("auth", FAIL, `GET /auth/nonce answered ${nonce.status}`);
    return;
  }
  const registered = await transport.call({
    method: "POST",
    path: "/auth/register-device",
    body: { name: "conformance", publicKey: "conformance-public-key" },
  });
  if (registered.status !== 200 || typeof registered.json?.token !== "string") {
    run.record("auth", FAIL, `POST /auth/register-device answered ${registered.status}`);
    return;
  }
  transport.setToken(registered.json.token);
  run.record("auth", PASS, "registered a device");
}

function schemaOf(doc, route) {
  const operation = doc.paths?.[route.path]?.[route.method.toLowerCase()];
  const media = Object.values(operation?.responses ?? {})[0]?.content?.["application/json"];
  return media?.schema ?? null;
}

async function sweepGets(transport, doc, routes, run) {
  const schemas = doc.components?.schemas ?? {};
  const idsByGroup = new Map();
  const allIds = [];
  const gets = routes.filter((r) => r.method === "GET");
  const parameterless = gets.filter((r) => !r.path.includes("{"));
  const parameterised = gets.filter((r) => r.path.includes("{"));

  const remember = (group, json) => {
    const found = harvestIds(json, []);
    if (!idsByGroup.has(group)) idsByGroup.set(group, []);
    for (const id of found) {
      if (!idsByGroup.get(group).includes(id)) idsByGroup.get(group).push(id);
      if (!allIds.includes(id)) allIds.push(id);
    }
  };

  /** Identifiers to try for this route: its own section first, then anything
   * else the server has named. Never a made-up one. */
  const candidatesFor = (route) => {
    const mine = idsByGroup.get(route.group) ?? [];
    return [...mine, ...allIds.filter((id) => !mine.includes(id))].slice(0, ID_ATTEMPTS);
  };

  const fill = (path, value) => path.replace(/\{[^}]+\}/g, () => encodeURIComponent(value));

  const checkResponse = (route, name, response) => {
    const schema = schemaOf(doc, route);
    if (schema == null) {
      run.record(name, FAIL, "openapi.yaml has no response schema for this route");
      return false;
    }
    const errors = validate(response.json, schema, schemas);
    if (errors.length) {
      run.record(name, FAIL, `${errors[0].path} ${errors[0].reason}`);
      return false;
    }
    remember(route.group, response.json);
    run.record(name, PASS, `${route.response} validated`);
    return true;
  };

  for (const route of parameterless) {
    const name = `GET ${route.path}`;
    let response;
    try {
      response = await transport.call({ method: "GET", path: route.path, query: QUERY_FOR[route.name] });
    } catch (error) {
      run.record(name, FAIL, describeError(error));
      continue;
    }
    if (response.status !== 200) {
      run.record(name, FAIL, `answered ${response.status}`);
      continue;
    }
    checkResponse(route, name, response);
  }

  for (const route of parameterised) {
    const name = `GET ${route.path}`;
    const literal = [...route.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).find((p) => LITERAL_PARAMS[p] == null);
    if (literal == null) {
      // every parameter is one we can name without asking the server
      const path = route.path.replace(/\{([^}]+)\}/g, (_, p) => encodeURIComponent(LITERAL_PARAMS[p]));
      let response;
      try {
        response = await transport.call({ method: "GET", path, query: QUERY_FOR[route.name] });
      } catch (error) {
        run.record(name, FAIL, describeError(error));
        continue;
      }
      if (response.status !== 200) run.record(name, FAIL, `answered ${response.status}`);
      else checkResponse(route, name, response);
      continue;
    }

    const candidates = candidatesFor(route);
    if (candidates.length === 0) {
      run.record(name, SKIP, `the server has named no identifier this route could use for {${literal}}`);
      continue;
    }
    let answered = null;
    for (const candidate of candidates) {
      let response;
      try {
        response = await transport.call({ method: "GET", path: fill(route.path, candidate), query: QUERY_FOR[route.name] });
      } catch (error) {
        run.record(name, FAIL, describeError(error));
        answered = "error";
        break;
      }
      if (response.status === 404) continue;
      answered = response;
      break;
    }
    if (answered === "error") continue;
    if (answered == null) {
      // Not a server failure: we never found a record this route addresses.
      // `tests/unit/conformance.test.ts` asserts a floor on the number of
      // PASSES, so a run that skipped its way to green cannot go unnoticed.
      run.record(name, SKIP, `none of the ${candidates.length} identifiers the server named addressed this route`);
      continue;
    }
    if (answered.status !== 200) {
      run.record(name, FAIL, `answered ${answered.status}`);
      continue;
    }
    checkResponse(route, name, answered);
  }
}

async function safeWrites(transport, doc, routes, run) {
  const byName = Object.fromEntries(routes.map((r) => [r.name, r]));
  const schemas = doc.components?.schemas ?? {};
  const firstError = (errors) => `${errors[0].path} ${errors[0].reason}`;

  // 1. a capture is idempotent on offlineId, and says so (§4.12)
  const offlineId = `conformance-${Date.now()}`;
  const dump = () =>
    transport.call({ method: "POST", path: "/brain/dump", body: { text: "conformance probe", source: "typed", offlineId } });
  const first = await dump();
  const second = await dump();
  const dumpName = "POST /brain/dump (same offlineId twice)";
  if (first.status !== 200 || second.status !== 200) {
    run.record(dumpName, FAIL, `answered ${first.status} then ${second.status}`);
  } else if (second.json?.duplicate !== true) {
    run.record(dumpName, FAIL, "the second write did not come back with duplicate: true");
  } else if (first.json?.item?.id !== second.json?.item?.id) {
    run.record(dumpName, FAIL, "the same offlineId produced two different records");
  } else {
    const errors = validate(second.json, schemaOf(doc, byName.postBrainDump), schemas);
    run.record(dumpName, errors.length ? FAIL : PASS, errors.length ? firstError(errors) : "deduped");
  }

  // 2. a habit log, against a habit the server itself named
  const habits = await transport.call({ method: "GET", path: "/habits" });
  const habitId = Array.isArray(habits.json) ? habits.json[0]?.id : null;
  if (habitId == null) {
    run.record("POST /habits/{id}/log", SKIP, "the server listed no habits to log against");
  } else {
    const logged = await transport.call({
      method: "POST",
      path: `/habits/${encodeURIComponent(habitId)}/log`,
      body: { date: new Date().toISOString().slice(0, 10), done: true },
    });
    if (logged.status !== 200) {
      run.record("POST /habits/{id}/log", FAIL, `answered ${logged.status}`);
    } else {
      const errors = validate(logged.json, schemaOf(doc, byName.postHabitLog), schemas);
      run.record("POST /habits/{id}/log", errors.length ? FAIL : PASS, errors.length ? firstError(errors) : "logged");
    }
  }

  // 3. a layout change, put back the way it was found in the same run
  const before = await transport.call({ method: "GET", path: "/layout/today" });
  if (before.status !== 200) {
    run.record("PUT /layout/{tab} then revert", SKIP, `GET /layout/today answered ${before.status}`);
  } else {
    const order = Array.isArray(before.json?.order) ? [...before.json.order] : [];
    const put = await transport.call({ method: "PUT", path: "/layout/today", body: { order: [...order].reverse() } });
    const reverted = await transport.call({ method: "POST", path: "/layout/today/revert" });
    if (put.status !== 200 || reverted.status !== 200) {
      run.record("PUT /layout/{tab} then revert", FAIL, `answered ${put.status} then ${reverted.status}`);
    } else {
      const errors = validate(reverted.json, schemaOf(doc, byName.revertLayout), schemas);
      // WPF-9: "put back" is a claim about the ORDER, so it is checked against the order found
      const back = Array.isArray(reverted.json?.order) ? reverted.json.order : [];
      if (errors.length) run.record("PUT /layout/{tab} then revert", FAIL, firstError(errors));
      else if (JSON.stringify(back) !== JSON.stringify(order)) run.record("PUT /layout/{tab} then revert", FAIL, `reverted to ${JSON.stringify(back)}, not the order it found`);
      else run.record("PUT /layout/{tab} then revert", PASS, "changed and put back");
    }
  }

  // 4. one deliberately INVALID body. CONTRACT §8 Q10 says a real backend
  //    validates every body and answers `422 { field, reason }`; this is the
  //    check that the assumption is true of whatever we are pointed at, and
  //    it is safe by construction because a rejected write changes nothing.
  const bad = await transport.call({ method: "POST", path: "/brain/dump", body: { source: "not-a-source" } });
  if (bad.status !== 422) {
    run.record("POST /brain/dump (invalid body)", FAIL, `answered ${bad.status}, expected 422 — bodies are not being validated`);
  } else if (typeof bad.json?.field !== "string") {
    run.record("POST /brain/dump (invalid body)", FAIL, "422 without a `field` — the app shows that field to the person");
  } else {
    run.record("POST /brain/dump (invalid body)", PASS, `rejected, naming ${bad.json.field}`);
  }

  // 5. the undo window. Asserting it honestly means moving the server's clock
  // past the window; the contract has no clock endpoint, and sleeping eleven
  // seconds in a board run buys nothing, so this reports itself.
  run.record("POST /actions/{id}/undo after the window", SKIP, "no clock endpoint in the contract; cannot advance the server past the undo window");
}

/** Exported for `tools/connect-check.mjs` (D-2), which wraps this with an
 * evidence path of its own and a one-line verdict — the sweep and the safe
 * writes stay here, once, and the writes run only when `writes` is set (WPF-9). */
export async function conformance(base, { writeDir = null, writes = false } = {}) {
  const routes = readRoutesFrom(join(root, "data", "routes.ts"));
  const doc = parse(readFileSync(join(root, "openapi.yaml"), "utf8"));
  const transport = makeTransport(base);
  const run = new Run();

  await authenticate(transport, run, writes);
  await sweepGets(transport, doc, routes, run);
  // WPF-9: the writes leave records on the server, so they run only when asked for
  if (writes) await safeWrites(transport, doc, routes, run);
  else run.record("the safe writes", SKIP, "not run — pass --writes to exercise them, against a server you can reset");

  const counts = {
    pass: run.results.filter((r) => r.status === PASS).length,
    fail: run.failed.length,
    skip: run.results.filter((r) => r.status === SKIP).length,
  };
  console.log("");
  console.log(`${counts.pass} passed · ${counts.fail} failed · ${counts.skip} skipped — against ${base}`);

  if (writeDir != null) {
    // `--write evidence` is relative to the app; `--write /tmp/x` is not.
    // Joining an absolute path onto the app root produced a path that could
    // not be created, and the tool exited 1 on a run where nothing was wrong.
    const dir = isAbsolute(writeDir) ? writeDir : join(root, writeDir);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `conformance-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(file, JSON.stringify({ base, counts, results: run.results }, null, 2) + "\n");
    console.log(`evidence written: ${file}`);
  }

  return { counts, results: run.results };
}

if (process.argv[1] && process.argv[1].endsWith("conformance.mjs")) {
  const base = process.argv[2];
  if (!base) {
    console.error("usage: node tools/conformance.mjs <BASE_URL> [--writes] [--write <dir>]");
    process.exit(2);
  }
  const writeAt = process.argv.indexOf("--write");
  // A server that is not up yet is the FIRST thing this command meets — it is
  // the one command `README.md` leads with, and REMAP will point it at a host
  // before the host answers. It used to end as an uncaught `TypeError: fetch
  // failed` over a Node stack trace, which says nothing about what to do
  // (A-5 step 1, the fresh-clone run).
  let counts = null;
  try {
    ({ counts } = await conformance(base, { writeDir: writeAt === -1 ? null : process.argv[writeAt + 1], writes: process.argv.includes("--writes") }));
  } catch (error) {
    const cause = error?.cause?.code ?? error?.code ?? error?.message ?? String(error);
    console.error(`conformance: could not reach ${base} (${cause}).`);
    console.error("Check the host is up, that the URL ends in your API prefix (e.g. /api/v1), and that it is https or localhost.");
    process.exitCode = 2;
  }
  // `process.exitCode`, NOT `process.exit()` (B-27). When stdout is a pipe —
  // which it is under `execFile`, and under CI — a write past the pipe buffer
  // completes asynchronously, and `process.exit()` tears the process down
  // mid-flush. On Windows that surfaces as exit 3221226505
  // (STATUS_STACK_BUFFER_OVERRUN) with the report itself printed correctly,
  // so the runner looks like it crashed after doing its job — which is
  // exactly what happened. Setting the code lets Node drain and exit on its
  // own. Nothing here keeps the loop alive: every fetch has completed.
  if (counts != null) process.exitCode = counts.fail > 0 ? 1 : 0;
}
