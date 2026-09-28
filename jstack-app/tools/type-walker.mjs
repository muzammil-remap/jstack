/**
 * A very small TypeScript type-expression walker (W-1, WM-03).
 *
 * `tools/gen-openapi.mjs` needs the JSON Schema for the shapes named in
 * `data/routes.ts`'s `body`/`response` columns. Those shapes live in
 * `data/types.ts` as ordinary `export type X = …` declarations, and the rule
 * for this build is that a tool takes no dependency — so rather than pull in
 * the TypeScript compiler to read four kinds of declaration, this reads them.
 *
 * It is NOT a type checker and must never be mistaken for one. It knows
 * exactly what CONTRACT §3 uses:
 *
 *   primitives            string, number, boolean, unknown, null, never
 *   literals              "open" | "done", 1 | 2 | 3, true
 *   objects               { a: string; b?: number }
 *   arrays                T[]
 *   tuples                [A, A, A]
 *   unions                A | B          (enum when every arm is a literal)
 *   intersections         A & { … }      (allOf, so the named half stays named)
 *   references            another exported type, by name
 *   indexed access        Task["owner"]
 *   three utilities       Partial<X>, Omit<X, "a" | "b">, Record<K, V>
 *
 * Anything else — a generic declaration, a conditional type, `keyof`,
 * a mapped type — THROWS, naming the shape and the text it could not read.
 * Silently emitting `{}` for a type it did not understand would put a lie in
 * the contract a backend developer is meant to build against, and the whole
 * point of the generated half of the map is that it cannot lie.
 */

/** Comments carry `;` and braces of their own; strip them before scanning. */
function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
    } else if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
    } else if (src[i] === '"' || src[i] === "'") {
      const quote = src[i];
      out += src[i++];
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") out += src[i++];
        out += src[i++];
      }
      out += src[i++] ?? "";
    } else {
      out += src[i++];
    }
  }
  return out;
}

/**
 * Every `type Name = <rhs>` declaration in a source file, as raw text —
 * exported or not. `Labels.setBy` is a `LabelSetBy`, and `LabelSetBy` is a
 * module-private alias in `data/labels.ts`: whether a type is exported is a
 * module concern, and the wire does not care. A walker that read only the
 * exported half would have to call a real field's type unknown.
 *
 * The right-hand side is read by tracking bracket depth rather than by
 * looking for the next `;` — an object body is full of them.
 */
export function readDeclarations(src) {
  const clean = stripComments(src);
  const found = new Map();
  // declaration starts only at a line start, so `keyof Shapes` inside some
  // other type is never mistaken for one
  const starts = [];
  for (let i = 0; i < clean.length; i++) {
    if (i !== 0 && clean[i - 1] !== "\n") continue;
    if (clean.startsWith("export type ", i)) starts.push(i + "export type ".length);
    else if (clean.startsWith("type ", i)) starts.push(i + "type ".length);
  }
  for (const start of starts) {
    let i = start;
    let name = "";
    while (i < clean.length && /[A-Za-z0-9_$]/.test(clean[i])) name += clean[i++];
    while (i < clean.length && clean[i] === " ") i++;
    // A generic declaration (`Sensitive<T>`) is not a shape a route can name.
    const generic = clean[i] === "<";
    if (generic) {
      let depth = 0;
      do {
        if (clean[i] === "<") depth++;
        else if (clean[i] === ">") depth--;
        i++;
      } while (i < clean.length && depth > 0);
      while (i < clean.length && clean[i] === " ") i++;
    }
    if (clean[i] === "=") {
      i++;
      const rhs = i;
      let depth = 0;
      while (i < clean.length) {
        const c = clean[i];
        if ("{[(<".includes(c)) depth++;
        else if ("}])>".includes(c)) depth--;
        else if (c === ";" && depth === 0) break;
        i++;
      }
      if (!generic) found.set(name, clean.slice(rhs, i).trim());
    }
  }
  return found;
}

// ─── tokeniser ──────────────────────────────────────────────────────────

const PUNCT = ["{", "}", "[", "]", "(", ")", "<", ">", "|", "&", ";", ",", ":", "?"];

function tokenise(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === " " || c === "\n" || c === "\r" || c === "\t") {
      i++;
    } else if (c === '"' || c === "'") {
      let value = "";
      i++;
      while (i < text.length && text[i] !== c) value += text[i++];
      i++;
      tokens.push({ kind: "string", value });
    } else if (/[A-Za-z_$]/.test(c)) {
      let value = "";
      while (i < text.length && /[A-Za-z0-9_$.]/.test(text[i])) value += text[i++];
      tokens.push({ kind: "ident", value });
    } else if (/[0-9-]/.test(c)) {
      let value = "";
      while (i < text.length && /[0-9.\-]/.test(text[i])) value += text[i++];
      tokens.push({ kind: "number", value });
    } else if (PUNCT.includes(c)) {
      tokens.push({ kind: c, value: c });
      i++;
    } else {
      throw new Error(`type-walker: unexpected character ${JSON.stringify(c)} in ${JSON.stringify(text.slice(0, 60))}`);
    }
  }
  return tokens;
}

// ─── parser ─────────────────────────────────────────────────────────────
//
// Precedence, loosest first: union → intersection → postfix (`[]`, `["k"]`)
// → primary. A node is a plain object with a `kind`, so the schema pass below
// is a straight switch and neither half has to know the other's internals.

class Parser {
  constructor(tokens, context) {
    this.tokens = tokens;
    this.i = 0;
    this.context = context;
  }

  peek(offset = 0) {
    return this.tokens[this.i + offset];
  }

  eat(kind) {
    const token = this.tokens[this.i];
    if (token == null || token.kind !== kind) {
      const saw = token == null ? "end of type" : `${token.kind} ${JSON.stringify(token.value)}`;
      throw new Error(`type-walker: ${this.context}: expected ${kind}, saw ${saw}`);
    }
    this.i++;
    return token;
  }

  parse() {
    const node = this.union();
    if (this.i !== this.tokens.length) {
      throw new Error(`type-walker: ${this.context}: trailing input at token ${this.i}`);
    }
    return node;
  }

  union() {
    // a leading `|` is legal and common in a multi-line union
    if (this.peek()?.kind === "|") this.i++;
    const arms = [this.intersection()];
    while (this.peek()?.kind === "|") {
      this.i++;
      arms.push(this.intersection());
    }
    return arms.length === 1 ? arms[0] : { kind: "union", arms };
  }

  intersection() {
    const parts = [this.postfix()];
    while (this.peek()?.kind === "&") {
      this.i++;
      parts.push(this.postfix());
    }
    return parts.length === 1 ? parts[0] : { kind: "intersection", parts };
  }

  postfix() {
    let node = this.primary();
    for (;;) {
      if (this.peek()?.kind === "[" && this.peek(1)?.kind === "]") {
        this.i += 2;
        node = { kind: "array", of: node };
      } else if (this.peek()?.kind === "[" && this.peek(1)?.kind === "string") {
        this.i++;
        const key = this.eat("string").value;
        this.eat("]");
        node = { kind: "indexed", of: node, key };
      } else {
        return node;
      }
    }
  }

  primary() {
    // `readonly string[]` (L-1's `ParameterDef.usedBy`) is the same JSON as
    // `string[]`: immutability is a TypeScript promise to the caller, and the
    // wire has no opinion about it. Skipped rather than modelled — the walker
    // that did not know the word read `readonly` as a type NAME and then
    // failed on the next property, which is a confusing error for a
    // one-word fix.
    while (this.peek()?.kind === "ident" && this.peek()?.value === "readonly") this.i++;
    const token = this.peek();
    if (token == null) throw new Error(`type-walker: ${this.context}: type ended early`);

    if (token.kind === "{") return this.object();
    if (token.kind === "(") {
      this.i++;
      const inner = this.union();
      this.eat(")");
      return inner;
    }
    if (token.kind === "[") return this.tuple();
    if (token.kind === "string") {
      this.i++;
      return { kind: "literal", value: token.value, of: "string" };
    }
    if (token.kind === "number") {
      this.i++;
      return { kind: "literal", value: Number(token.value), of: "number" };
    }
    if (token.kind === "ident") {
      this.i++;
      let args = null;
      if (this.peek()?.kind === "<") {
        this.i++;
        args = [this.union()];
        while (this.peek()?.kind === ",") {
          this.i++;
          args.push(this.union());
        }
        this.eat(">");
      }
      return { kind: "name", name: token.value, args };
    }
    throw new Error(`type-walker: ${this.context}: cannot read a type starting at ${token.kind} ${JSON.stringify(token.value)}`);
  }

  tuple() {
    this.eat("[");
    const items = [];
    while (this.peek()?.kind !== "]") {
      items.push(this.union());
      if (this.peek()?.kind === ",") this.i++;
    }
    this.eat("]");
    return { kind: "tuple", items };
  }

  object() {
    this.eat("{");
    const members = [];
    while (this.peek()?.kind !== "}") {
      const keyToken = this.peek();
      if (keyToken == null) throw new Error(`type-walker: ${this.context}: object ended early`);
      // an index signature — `[k: string]: T` — is the one member form that
      // is not a named property; Record<> is how §3 spells it, but read it
      // here too rather than fail on a shape somebody writes the other way
      if (keyToken.kind === "[") {
        this.i++;
        this.eat("ident");
        this.eat(":");
        this.union();
        this.eat("]");
        this.eat(":");
        const value = this.union();
        members.push({ name: null, optional: false, index: true, type: value });
      } else {
        if (keyToken.kind !== "ident" && keyToken.kind !== "string") {
          throw new Error(`type-walker: ${this.context}: expected a property name, saw ${keyToken.kind}`);
        }
        this.i++;
        let optional = false;
        if (this.peek()?.kind === "?") {
          this.i++;
          optional = true;
        }
        this.eat(":");
        const type = this.union();
        members.push({ name: keyToken.value, optional, index: false, type });
      }
      if (this.peek()?.kind === ";" || this.peek()?.kind === ",") this.i++;
    }
    this.eat("}");
    return { kind: "object", members };
  }
}

function parseType(text, context = "type") {
  return new Parser(tokenise(text), context).parse();
}

// ─── node → JSON Schema ─────────────────────────────────────────────────

const PRIMITIVES = {
  string: { type: "string" },
  number: { type: "number" },
  boolean: { type: "boolean" },
  // OpenAPI has no "anything"; an empty schema is exactly that, and it is
  // honest about a shape CONTRACT §8 leaves to the backend
  unknown: {},
  any: {},
  object: { type: "object" },
  never: { not: {} },
  null: { type: "null" },
  Date: { type: "string", format: "date-time" },
};

/** A type registry: name → parsed node, plus which names get a `$ref`. */
export class Registry {
  /**
  * Parsed ON DEMAND, not up front. `data/types.ts` also declares the registry
  * that types the route table's own columns (`ShapeName = keyof Shapes`), and
  * `keyof` is not a wire shape this walker reads or should read. Parsing
  * eagerly made one meta-declaration fail every shape in the file; parsing
  * lazily means a declaration only has to be readable if a route names it,
  * and when one is not, the error names it alone.
  */
  constructor(declarations) {
    this.texts = new Map(declarations);
    this.nodes = new Map();
  }

  has(name) {
    return this.texts.has(name);
  }

  node(name) {
    if (this.nodes.has(name)) return this.nodes.get(name);
    const text = this.texts.get(name);
    if (text == null) throw new Error(`type-walker: no exported type named ${name}`);
    const node = parseType(text, `type ${name}`);
    this.nodes.set(name, node);
    return node;
  }

  /** Every declaration this walker can read, for a tool that wants to know. */
  readable() {
    const out = [];
    for (const name of this.texts.keys()) {
      try {
        this.node(name);
        out.push(name);
      } catch {
        // a declaration this walker does not read is not an error until a
        // route names it; `schemaFor` is where that becomes loud
      }
    }
    return out;
  }

  /** The schema for a named type, with references to OTHER named types left
   * as `$ref` so the emitted document keeps §3's vocabulary. */
  schemaFor(name) {
    return this.toSchema(this.node(name), name);
  }

  ref(name) {
    return { $ref: `#/components/schemas/${name}` };
  }

  /** Resolve far enough to see an object — used by Partial/Omit/indexed. */
  resolveObject(node, context) {
    if (node.kind === "name" && node.args == null && this.has(node.name)) {
      return this.resolveObject(this.node(node.name), context);
    }
    if (node.kind === "intersection") {
      const members = [];
      for (const part of node.parts) members.push(...this.resolveObject(part, context).members);
      return { kind: "object", members };
    }
    if (node.kind !== "object") {
      throw new Error(`type-walker: ${context}: expected an object shape, got ${node.kind}`);
    }
    return node;
  }

  toSchema(node, context, self = null) {
    switch (node.kind) {
      case "literal":
        return { type: node.of === "string" ? "string" : "number", enum: [node.value] };

      case "array":
        return { type: "array", items: this.toSchema(node.of, context, self) };

      case "tuple":
        // OpenAPI 3.0 has no tuple; a fixed-length array of the first arm is
        // the closest true statement, and the length is the part that matters
        // (`options?: [ActionOption, ActionOption, ActionOption]` is "three")
        return {
          type: "array",
          items: node.items.length ? this.toSchema(node.items[0], context, self) : {},
          minItems: node.items.length,
          maxItems: node.items.length,
        };

      case "object": {
        const properties = {};
        const required = [];
        let additional;
        for (const member of node.members) {
          if (member.index) {
            additional = this.toSchema(member.type, context, self);
            continue;
          }
          properties[member.name] = this.toSchema(member.type, context, self);
          if (!member.optional) required.push(member.name);
        }
        const schema = { type: "object", properties };
        if (required.length) schema.required = required;
        if (additional !== undefined) schema.additionalProperties = additional;
        return schema;
      }

      case "intersection":
        return { allOf: node.parts.map((p) => this.toSchema(p, context, self)) };

      case "union":
        return this.unionSchema(node, context, self);

      case "indexed": {
        const target = this.resolveObject(node.of, context);
        const member = target.members.find((m) => m.name === node.key);
        if (member == null) throw new Error(`type-walker: ${context}: no property ${JSON.stringify(node.key)} to index`);
        return this.toSchema(member.type, context, self);
      }

      case "name":
        return this.nameSchema(node, context, self);

      default:
        throw new Error(`type-walker: ${context}: unhandled node ${node.kind}`);
    }
  }

  unionSchema(node, context, self) {
    // `"a" | "b"` is an enum, not a oneOf — far more readable, and it is what
    // a reader of the contract expects to see for a closed set
    const literals = node.arms.filter((a) => a.kind === "literal");
    const others = node.arms.filter((a) => a.kind !== "literal");
    const nulls = others.filter((a) => a.kind === "name" && a.name === "null");
    const rest = others.filter((a) => !(a.kind === "name" && a.name === "null"));

    if (literals.length === node.arms.length) {
      const kinds = new Set(literals.map((l) => l.of));
      return { type: kinds.size === 1 ? [...kinds][0] : "string", enum: literals.map((l) => l.value) };
    }
    if (literals.length === 0 && rest.length === 1 && nulls.length > 0) {
      return { ...this.toSchema(rest[0], context, self), nullable: true };
    }
    const arms = [...literals, ...rest].map((a) => this.toSchema(a, context, self));
    const schema = { oneOf: arms };
    if (nulls.length) schema.nullable = true;
    return schema;
  }

  nameSchema(node, context, self) {
    const { name, args } = node;
    if (args == null) {
      if (PRIMITIVES[name] !== undefined) return { ...PRIMITIVES[name] };
      if (name === "true" || name === "false") return { type: "boolean", enum: [name === "true"] };
      if (this.has(name)) return name === self ? this.toSchema(this.node(name), context, null) : this.ref(name);
      throw new Error(`type-walker: ${context}: unknown type ${name}`);
    }

    if (name === "Record") {
      const value = args[1] ?? { kind: "name", name: "unknown", args: null };
      const valueSchema = this.toSchema(value, context, self);
      // `Record<string, never>` is "no properties at all" — a 204's body
      if (args[1]?.kind === "name" && args[1].name === "never") return { type: "object", additionalProperties: false };
      return { type: "object", additionalProperties: valueSchema };
    }

    if (name === "Partial") {
      const target = this.resolveObject(args[0], context);
      const relaxed = { kind: "object", members: target.members.map((m) => ({ ...m, optional: true })) };
      return this.toSchema(relaxed, context, self);
    }

    if (name === "Omit") {
      const target = this.resolveObject(args[0], context);
      const dropped = new Set(
        (args[1].kind === "union" ? args[1].arms : [args[1]]).map((a) => {
          if (a.kind !== "literal") throw new Error(`type-walker: ${context}: Omit's second argument must be string literals`);
          return a.value;
        }),
      );
      return this.toSchema({ kind: "object", members: target.members.filter((m) => !dropped.has(m.name)) }, context, self);
    }

    if (name === "Array" || name === "ReadonlyArray") return { type: "array", items: this.toSchema(args[0], context, self) };

    throw new Error(`type-walker: ${context}: ${name}<…> is not one of the three utilities this walker reads (Partial, Omit, Record)`);
  }
}
