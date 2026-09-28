/**
 * D-3 (ADR-67) — the passkey ceremony's mock responses validate against the
 * typed contract, through the SAME validator `tools/conformance.mjs` uses
 * (`tools/schema-validate.mjs` against `openapi.yaml`), not a hand-rolled
 * second check that could disagree with the one a real server is judged by.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { reset } from "@/data/mock/db";
import { webauthnCeremony } from "@/data/mock/handlers/session";
import type { TransportRequest } from "@/data/transport/Transport";

const root = join(__dirname, "..", "..");

/** Runs the real validator in a child process — `tools/*.mjs` are ESM and
 * Jest's CommonJS transform will not take them (the same reason
 * `tests/unit/openapi.test.ts` does this for the document itself). */
function validateAgainstSchema(value: unknown, schemaName: string): { path: string; reason: string }[] {
  const yamlUrl = pathToFileURL(join(root, "tools", "yaml.mjs")).href;
  const validateUrl = pathToFileURL(join(root, "tools", "schema-validate.mjs")).href;
  const docPath = join(root, "openapi.yaml");
  const script = [
    `const Y = await import(${JSON.stringify(yamlUrl)});`,
    `const V = await import(${JSON.stringify(validateUrl)});`,
    `const fs = await import("node:fs");`,
    `const doc = Y.parse(fs.readFileSync(${JSON.stringify(docPath)}, "utf8"));`,
    `const schema = doc.components.schemas[${JSON.stringify(schemaName)}];`,
    `const value = ${JSON.stringify(value)};`,
    `console.log(JSON.stringify(V.validate(value, schema, doc.components.schemas)));`,
  ].join("");
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: root, encoding: "utf8" });
  return JSON.parse(out) as { path: string; reason: string }[];
}

const req = (path: string): TransportRequest => ({ method: "POST", path, query: {}, body: undefined });

beforeEach(() => reset());

describe("D-3 · the passkey ceremony's mock responses match the typed contract", () => {
  it("the options step answers real WebAuthn creation options, not an untyped stub", () => {
    const res = webauthnCeremony(req("/auth/webauthn/options"), "options");
    expect(res.status).toBe(200);
    expect(validateAgainstSchema(res.json, "WebauthnResult")).toEqual([]);
    // proof this is not merely AN object that happens to validate, but the
    // shape navigator.credentials.create() actually needs
    expect(res.json).toMatchObject({
      challenge: expect.any(String),
      rp: expect.objectContaining({ name: expect.any(String) }),
      pubKeyCredParams: expect.any(Array),
    });
  });

  it("the verify step answers a typed result too", () => {
    const res = webauthnCeremony(req("/auth/webauthn/verify"), "verify");
    expect(res.status).toBe(200);
    expect(validateAgainstSchema(res.json, "WebauthnResult")).toEqual([]);
    expect(res.json).toEqual({ verified: true });
  });
});
