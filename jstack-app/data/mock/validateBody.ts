/**
 * The mock validates request bodies against `openapi.yaml` (H-1e, SH-10).
 *
 * CONTRACT_v21.md §8 Q10 says the app ASSUMES every body is validated
 * server-side with `422 { field, reason }`. An assumption nothing exercises is
 * a hope, and the app's own error handling for 422 had never been driven by a
 * real 422 — so the mock does what the real server is assumed to do, and the
 * conformance runner sends one deliberately invalid body to prove it.
 *
 * The schema comes from the generated contract, so this cannot drift from
 * what the document promises: they are the same file.
 *
 * Deliberately shallow. It reports the FIRST problem, because a person fixing
 * a request fixes one thing at a time, and `field` is what the app shows.
 */
import contract from "@/data/requestSchemas.json";
import { validate } from "@/data/mock/schemaValidate";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

type Contract = { requests: Record<string, Record<string, unknown>>; schemas: Record<string, unknown> };

const doc = contract as unknown as Contract;

/** `/tasks/t1` → the `/tasks/{id}` the document declares. */
function pathItem(path: string) {
  if (doc.requests[path] != null) return doc.requests[path];
  const wanted = path.split("/");
  for (const [template, item] of Object.entries(doc.requests)) {
    const parts = template.split("/");
    if (parts.length !== wanted.length) continue;
    if (parts.every((p, i) => (p.startsWith("{") && p.endsWith("}") ? wanted[i] !== "" : p === wanted[i]))) return item;
  }
  return null;
}

function stripOfflineId(raw: unknown): Record<string, unknown> {
  const body = { ...((raw ?? {}) as Record<string, unknown>) };
  delete body.offlineId;
  return body;
}

export function validateRequestBody(req: TransportRequest): TransportResponse | null {
  const schema = pathItem(req.path)?.[req.method.toLowerCase()];
  if (schema == null) return null;

  // `offlineId` is added by the outbox on the way out and is not part of any
  // declared body — it is transport, not content (O-1). Stripping it is an
  // OBJECT operation: spreading an array into an object literal turns
  // `[a, b]` into `{ 0: a, 1: b }`, so the first route to declare an array
  // body (`PUT /slicers`, F-1) was refused with "expected array, got object"
  // by the validator that was supposed to be checking it (B-28). An array
  // never carries an `offlineId` — there is nowhere to put one.
  const body = Array.isArray(req.body) ? req.body : stripOfflineId(req.body);

  const errors = validate(body, schema, doc.schemas);
  if (errors.length === 0) return null;

  const first = errors[0];
  // `$.title` → `title`, `$.blocks[0].type` → `blocks[0].type`. The WHOLE
  // path, not its first segment (CB-A, qa A-6): §4.10's own validator already
  // answers with `blocks[0].bind`, both refusals reach a person through the
  // same 422 renderer, and one of them naming the list instead of the thing
  // in it made the two halves of CB-02 disagree about what a field is.
  const field = first.path.replace(/^\$\.?/, "");
  return { status: 422, json: { field: field === "" ? undefined : field, reason: first.reason } };
}
