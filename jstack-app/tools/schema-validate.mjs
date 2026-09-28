/**
 * A JSON Schema validator for the subset `tools/gen-openapi.mjs` emits (W-1).
 *
 * Two callers, one reason each. The generator validates every example it is
 * about to write against the schema it is writing beside it — an example that
 * does not satisfy its own schema is worse than none, because it is the part
 * a developer copies. `tools/validate-openapi.mjs` uses it again on the
 * committed document, and `tools/conformance.mjs` (W-2) will use it on live
 * responses.
 *
 * Understood: type, enum, required, properties, items, minItems, maxItems,
 * additionalProperties, nullable, allOf, oneOf, $ref, and the empty schema
 * (which accepts anything, and is how CONTRACT §8's undecided shapes are
 * written). Anything else in a schema throws rather than passing silently.
 *
 * Returns a list of `{ path, reason }`; empty means valid.
 */

const typeOf = (value) => {
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

export function validate(value, schema, schemas = {}, path = "$") {
  const errors = [];

  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key)) throw new Error(`schema-validate: ${path}: unsupported keyword ${JSON.stringify(key)}`);
  }

  if (schema.$ref !== undefined) {
    const name = schema.$ref.split("/").pop();
    const target = schemas[name];
    if (target === undefined) return [{ path, reason: `unknown $ref ${schema.$ref}` }];
    return validate(value, target, schemas, path);
  }

  if (Object.keys(schema).length === 0) return errors; // the empty schema accepts anything

  if (value === null && schema.nullable === true) return errors;

  if (schema.allOf !== undefined) {
    for (const part of schema.allOf) errors.push(...validate(value, part, schemas, path));
    return errors;
  }

  if (schema.oneOf !== undefined) {
    const matched = schema.oneOf.filter((part) => validate(value, part, schemas, path).length === 0);
    if (matched.length === 0) errors.push({ path, reason: `matches none of the ${schema.oneOf.length} alternatives` });
    return errors;
  }

  if (schema.type !== undefined) {
    const actual = typeOf(value);
    const wanted = Array.isArray(schema.type) ? schema.type : [schema.type];
    // an integer is a number; nothing in §3 asks for the other direction
    const ok = wanted.some((t) => t === actual || (t === "number" && actual === "integer"));
    if (!ok) {
      errors.push({ path, reason: `expected ${wanted.join(" or ")}, got ${actual}` });
      return errors;
    }
  }

  if (schema.enum !== undefined && !schema.enum.some((allowed) => allowed === value)) {
    errors.push({ path, reason: `${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}` });
  }

  if (schema.type === "array" || Array.isArray(value)) {
    if (!Array.isArray(value)) return errors;
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, reason: `expected at least ${schema.minItems} items, got ${value.length}` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path, reason: `expected at most ${schema.maxItems} items, got ${value.length}` });
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => errors.push(...validate(item, schema.items, schemas, `${path}[${i}]`)));
    }
    return errors;
  }

  if (schema.type === "object" || schema.properties !== undefined) {
    if (typeOf(value) !== "object") return errors;
    for (const name of schema.required ?? []) {
      if (!(name in value)) errors.push({ path: `${path}.${name}`, reason: "required property is missing" });
    }
    for (const [name, propSchema] of Object.entries(schema.properties ?? {})) {
      if (name in value && value[name] !== undefined) {
        errors.push(...validate(value[name], propSchema, schemas, `${path}.${name}`));
      }
    }
    if (schema.additionalProperties === false) {
      const declared = new Set(Object.keys(schema.properties ?? {}));
      for (const name of Object.keys(value)) {
        if (!declared.has(name)) errors.push({ path: `${path}.${name}`, reason: "additional property is not allowed" });
      }
    } else if (typeof schema.additionalProperties === "object") {
      const declared = new Set(Object.keys(schema.properties ?? {}));
      for (const [name, item] of Object.entries(value)) {
        if (!declared.has(name)) errors.push(...validate(item, schema.additionalProperties, schemas, `${path}.${name}`));
      }
    }
  }

  return errors;
}
