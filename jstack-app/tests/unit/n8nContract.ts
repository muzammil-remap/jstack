/**
 * Test helpers for the n8n build (ADR-76): the contract's response schemas, read from `openapi.yaml`
 * by the real YAML reader, and the redacted webhook samples in `tests/fixtures/n8n/`.
 *
 * The schema is parsed in a child process, the way `openapi.test.ts` does, because the tools are ESM
 * that Jest's transform will not take. It is checked with the mock's own validator
 * (`data/mock/schemaValidate.ts`) — a schema derived from a different file than the one that wrote
 * the answer (CODEMAP §6, B-16).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validate } from "@/data/mock/schemaValidate";

const root = join(__dirname, "..", "..");

type Doc = { paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema?: unknown }> }> }>>; components: { schemas: Record<string, unknown> } };

/**
 * `{ $ref, nullable: true }` → `{ nullable: true, oneOf: [{ $ref }] }`, which means the same thing.
 * Both copies of the validator resolve a `$ref` before they look at its `nullable` sibling, so they
 * refuse the `null` the contract allows (`BrainSearchResult.answer`). The defect is the validator's
 * (`KNOWN_GAPS.md` Review 17); this rewrite lets a check test the answer instead of the defect.
 */
function nullableRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(nullableRefs);
  if (node == null || typeof node !== "object") return node;
  const o = node as Record<string, unknown>;
  if (typeof o.$ref === "string" && o.nullable === true) {
    const { $ref, nullable, ...rest } = o;
    return { ...rest, nullable, oneOf: [{ $ref }] };
  }
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, nullableRefs(v)]));
}

let cached: Doc | null = null;
export function openapi(): Doc {
  if (cached != null) return cached;
  const yamlUrl = pathToFileURL(join(root, "tools", "yaml.mjs")).href;
  const target = join(root, "openapi.yaml");
  const script = [`const Y = await import(${JSON.stringify(yamlUrl)});`, `const fs = await import("node:fs");`, `console.log(JSON.stringify(Y.parse(fs.readFileSync(${JSON.stringify(target)}, "utf8"))));`].join("");
  cached = nullableRefs(JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }))) as Doc;
  return cached;
}

export function responseSchema(path: string, method: string): unknown {
  const responses = openapi().paths[path]?.[method.toLowerCase()]?.responses ?? {};
  return Object.values(responses)[0]?.content?.["application/json"]?.schema;
}

/** The errors, empty when `value` is the route's success shape. */
export function contractErrors(value: unknown, path: string, method = "GET"): { path: string; reason: string }[] {
  const schema = responseSchema(path, method);
  if (schema == null) return [{ path: "$", reason: `openapi.yaml has no response schema for ${method} ${path}` }];
  return validate(value, schema, openapi().components.schemas);
}

/** A redacted webhook reply, whole (`{ ok, data, … }`). */
export function sample(name: string): { ok: boolean; data: unknown } {
  return JSON.parse(readFileSync(join(root, "tests", "fixtures", "n8n", `${name}.json`), "utf8")) as { ok: boolean; data: unknown };
}

/** The records store's real answer to a request no record exists for yet: an empty list for `list`,
 * version 0 for anything else (`tests/fixtures/n8n/records.*`) — what Josh's store says today. */
export function emptyRecordsReply(requestBody: string | undefined): string {
  const op = (JSON.parse(requestBody ?? "{}") as { op?: string }).op;
  return JSON.stringify(sample(op === "list" ? "records.list-empty" : "records.get-absent"));
}
