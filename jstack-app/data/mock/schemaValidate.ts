/**
 * The JSON-Schema subset check, in TypeScript, for the mock server (H-1e).
 *
 * There is a second implementation of these rules in
 * `tools/schema-validate.mjs`, and that is a real cost worth naming: the
 * tools are dependency-free ES modules that Jest and Metro cannot import, and
 * the app is TypeScript that a `.mjs` tool cannot import. Neither side can
 * use the other's.
 *
 * So the duplication is made HONEST rather than hidden:
 * `tests/unit/hardening.test.ts` runs both over the same corpus of values and
 * schemas and asserts they agree. Two implementations that are checked against
 * each other are a redundancy; two that are not are a bug waiting for the day
 * they diverge.
 *
 * Same subset as the tool: type, enum, required, properties, items,
 * minItems/maxItems, additionalProperties, nullable, allOf, oneOf, $ref, and
 * the empty schema. Anything else throws rather than passing silently.
 */

type SchemaError = { path: string; reason: string };

type Schema = Record<string, unknown>;

const typeOf = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
};

const KNOWN = new Set([
  "type", "enum", "required", "properties", "items", "minItems", "maxItems",
  "additionalProperties", "nullable", "allOf", "oneOf", "$ref", "description",
  "format", "example", "not",
]);

export function validate(value: unknown, schema: unknown, schemas: Record<string, unknown> = {}, path = "$"): SchemaError[] {
  const s = (schema ?? {}) as Schema;
  const errors: SchemaError[] = [];

  for (const key of Object.keys(s)) {
    if (!KNOWN.has(key)) throw new Error(`schemaValidate: ${path}: unsupported keyword ${JSON.stringify(key)}`);
  }

  if (typeof s.$ref === "string") {
    const name = s.$ref.split("/").pop() as string;
    const target = schemas[name];
    if (target === undefined) return [{ path, reason: `unknown $ref ${s.$ref}` }];
    return validate(value, target, schemas, path);
  }

  if (Object.keys(s).length === 0) return errors; // the empty schema accepts anything
  if (value === null && s.nullable === true) return errors;

  if (Array.isArray(s.allOf)) {
    for (const part of s.allOf) errors.push(...validate(value, part, schemas, path));
    return errors;
  }

  if (Array.isArray(s.oneOf)) {
    const matched = s.oneOf.filter((part) => validate(value, part, schemas, path).length === 0);
    if (matched.length === 0) errors.push({ path, reason: `matches none of the ${s.oneOf.length} alternatives` });
    return errors;
  }

  if (s.type !== undefined) {
    const actual = typeOf(value);
    const wanted = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
    const ok = wanted.some((t) => t === actual || (t === "number" && actual === "integer"));
    if (!ok) {
      errors.push({ path, reason: `expected ${wanted.join(" or ")}, got ${actual}` });
      return errors;
    }
  }

  if (Array.isArray(s.enum) && !s.enum.some((allowed) => allowed === value)) {
    errors.push({ path, reason: `${JSON.stringify(value)} is not one of ${JSON.stringify(s.enum)}` });
  }

  if (s.type === "array" || Array.isArray(value)) {
    if (!Array.isArray(value)) return errors;
    if (typeof s.minItems === "number" && value.length < s.minItems) {
      errors.push({ path, reason: `expected at least ${s.minItems} items, got ${value.length}` });
    }
    if (typeof s.maxItems === "number" && value.length > s.maxItems) {
      errors.push({ path, reason: `expected at most ${s.maxItems} items, got ${value.length}` });
    }
    if (s.items !== undefined) value.forEach((item, i) => errors.push(...validate(item, s.items, schemas, `${path}[${i}]`)));
    return errors;
  }

  if (s.type === "object" || s.properties !== undefined) {
    if (typeOf(value) !== "object") return errors;
    const object = value as Record<string, unknown>;
    for (const name of (s.required as string[] | undefined) ?? []) {
      if (!(name in object)) errors.push({ path: `${path}.${name}`, reason: "required property is missing" });
    }
    const properties = (s.properties as Record<string, unknown> | undefined) ?? {};
    for (const [name, propSchema] of Object.entries(properties)) {
      if (name in object && object[name] !== undefined) errors.push(...validate(object[name], propSchema, schemas, `${path}.${name}`));
    }
    if (s.additionalProperties === false) {
      const declared = new Set(Object.keys(properties));
      for (const name of Object.keys(object)) {
        if (!declared.has(name)) errors.push({ path: `${path}.${name}`, reason: "additional property is not allowed" });
      }
    } else if (typeof s.additionalProperties === "object" && s.additionalProperties !== null) {
      const declared = new Set(Object.keys(properties));
      for (const [name, item] of Object.entries(object)) {
        if (!declared.has(name)) errors.push(...validate(item, s.additionalProperties, schemas, `${path}.${name}`));
      }
    }
  }

  return errors;
}
