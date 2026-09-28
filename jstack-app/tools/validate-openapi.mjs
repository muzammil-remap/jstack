/**
 * Checks `openapi.yaml` structurally, and against the route table (W-1,
 * WM-03). Dependency-free by rule 4 — the reader is `tools/yaml.mjs` and the
 * schema checker is `tools/schema-validate.mjs`, both ours.
 *
 * This is not a general OpenAPI linter and does not try to be. It asserts the
 * handful of things that would actually mislead the developer reading the
 * document as their build brief:
 *
 *   1. every route in `data/routes.ts` is present, with its own operationId
 *   2. nothing is present that is NOT in the route table — a mock-only route
 *      leaking into the published contract is the failure rule 5 exists for
 *   3. every `$ref` resolves to a declared schema
 *   4. every path template's `{param}` is declared as a path parameter
 *   5. every operation answers something, and every non-204 answer carries a
 *      schema AND an example, and the example satisfies the schema
 *
 * Exit 0 and one summary line when clean; exit 1 listing every problem.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readRoutes } from "./read-routes.mjs";
import { validate } from "./schema-validate.mjs";
import { parse } from "./yaml.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Mock-only surfaces that must never appear in the published contract
 * (rule 5, SEC-01's sibling): the test rig and the Telegram mirror. */
const NEVER_PUBLISHED = ["/__test__", "/__mirror__"];

function check(doc, routes) {
  const problems = [];
  const say = (m) => problems.push(m);

  if (doc.openapi !== "3.0.3") say(`openapi version is ${JSON.stringify(doc.openapi)}, expected "3.0.3"`);
  if (!doc.info?.title) say("info.title is missing");
  if (!doc.paths || Object.keys(doc.paths).length === 0) say("paths is empty");
  const schemas = doc.components?.schemas ?? {};
  if (Object.keys(schemas).length === 0) say("components.schemas is empty");

  const declared = new Set();
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of Object.keys(item)) declared.add(`${method.toUpperCase()} ${path}`);
    for (const prefix of NEVER_PUBLISHED) {
      if (path.startsWith(prefix)) say(`${path} is mock-only and must not be in the published contract`);
    }
  }

  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    const operation = doc.paths?.[route.path]?.[route.method.toLowerCase()];
    if (operation == null) {
      say(`${key} is in data/routes.ts and missing from openapi.yaml`);
      continue;
    }
    declared.delete(key);
    if (operation.operationId !== route.name) {
      say(`${key} has operationId ${JSON.stringify(operation.operationId)}, expected ${JSON.stringify(route.name)}`);
    }

    const wanted = [...route.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const got = new Set((operation.parameters ?? []).filter((p) => p.in === "path").map((p) => p.name));
    for (const name of wanted) if (!got.has(name)) say(`${key} does not declare path parameter ${JSON.stringify(name)}`);

    if (route.body && operation.requestBody == null) say(`${key} names body ${route.body} and has no requestBody`);
    // WPF-5: an upload's body is multipart, declared by the flag rather than by a shape name
    if (route.multipart && operation.requestBody?.content?.["multipart/form-data"] == null) say(`${key} is multipart and has no multipart/form-data requestBody`);
    if (!route.body && !route.multipart && operation.requestBody != null) say(`${key} has a requestBody the route table does not declare`);

    const responses = operation.responses ?? {};
    if (Object.keys(responses).length === 0) {
      say(`${key} declares no response`);
      continue;
    }
    if (route.response === "NoContent") {
      if (responses["204"] == null) say(`${key} answers NoContent and has no 204`);
      continue;
    }
    for (const [code, response] of Object.entries(responses)) {
      const media = response.content?.["application/json"];
      if (media == null) {
        say(`${key} ${code} has no application/json content`);
        continue;
      }
      if (media.schema == null) say(`${key} ${code} has no schema`);
      if (media.example === undefined) say(`${key} ${code} has no example`);
      if (media.schema && media.example !== undefined) {
        for (const error of validate(media.example, media.schema, schemas)) {
          say(`${key} ${code} example: ${error.path} ${error.reason}`);
        }
      }
    }
  }

  for (const leftover of declared) say(`${leftover} is in openapi.yaml and not in data/routes.ts`);

  for (const match of JSON.stringify(doc).matchAll(/"#\/components\/schemas\/([A-Za-z0-9_]+)"/g)) {
    if (schemas[match[1]] === undefined) say(`$ref to ${match[1]}, which is not declared`);
  }

  return problems;
}

function run(mapPath = join(root, "openapi.yaml")) {
  const doc = parse(readFileSync(mapPath, "utf8"));
  const routes = readRoutes(readFileSync(join(root, "data", "routes.ts"), "utf8"));
  return { problems: check(doc, routes), routes: routes.length, schemas: Object.keys(doc.components?.schemas ?? {}).length };
}

if (process.argv[1] && process.argv[1].endsWith("validate-openapi.mjs")) {
  const target = process.argv[2] ? process.argv[2] : join(root, "openapi.yaml");
  const { problems, routes, schemas } = run(target);
  if (problems.length === 0) {
    console.log(`openapi.yaml valid: ${routes} routes, ${schemas} schemas, every example checked against its schema`);
    process.exit(0);
  }
  console.error(`openapi.yaml has ${problems.length} problem(s):`);
  for (const problem of problems) console.error("  " + problem);
  process.exit(1);
}
