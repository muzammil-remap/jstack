/**
 * The smallest YAML that `openapi.yaml` needs (W-1) — a writer and a reader
 * for exactly the subset this repository emits, and nothing else.
 *
 * Rule 4 of the build is no new dependencies, and a YAML library is a large
 * one to take on for a document we generate ourselves. Because we control
 * both ends, the subset can be narrow and boring: two-space indentation,
 * block style only, every scalar written as a double-quoted string or a bare
 * number/boolean/null. No anchors, no tags, no folded scalars, no flow maps
 * except the empty `{}` and `[]`.
 *
 * `tests/unit/openapi.test.ts` round-trips `parse(dump(x))` against `x` over
 * the real document, so the pair cannot drift apart quietly — a writer whose
 * reader disagrees with it is the failure mode worth guarding here.
 */

const INDENT = "  ";

function dumpScalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(String(value));
}

const isScalar = (v) => v === null || typeof v === "boolean" || typeof v === "number" || typeof v === "string";
const isEmpty = (v) => (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);

function dumpValue(value, depth, lines) {
  const pad = INDENT.repeat(depth);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isScalar(item) || isEmpty(item)) {
        lines.push(`${pad}- ${isScalar(item) ? dumpScalar(item) : Array.isArray(item) ? "[]" : "{}"}`);
      } else {
        lines.push(`${pad}-`);
        dumpValue(item, depth + 1, lines);
      }
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const k = `${pad}${JSON.stringify(key)}:`;
    if (isScalar(item)) lines.push(`${k} ${dumpScalar(item)}`);
    else if (isEmpty(item)) lines.push(`${k} ${Array.isArray(item) ? "[]" : "{}"}`);
    else {
      lines.push(k);
      dumpValue(item, depth + 1, lines);
    }
  }
}

export function dump(doc) {
  const lines = [];
  dumpValue(doc, 0, lines);
  return lines.join("\n") + "\n";
}

// ─── reader ─────────────────────────────────────────────────────────────

function parseScalar(text) {
  if (text === "null") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "{}") return {};
  if (text === "[]") return [];
  if (text.startsWith('"')) return JSON.parse(text);
  if (text !== "" && !Number.isNaN(Number(text))) return Number(text);
  throw new Error(`yaml: cannot read scalar ${JSON.stringify(text)}`);
}

/** Split `"key": rest` into the two halves, respecting the quoted key. */
function splitKey(text) {
  if (!text.startsWith('"')) return null;
  let i = 1;
  while (i < text.length && text[i] !== '"') {
    if (text[i] === "\\") i++;
    i++;
  }
  if (text[i] !== '"' || text[i + 1] !== ":") return null;
  return { key: JSON.parse(text.slice(0, i + 1)), rest: text.slice(i + 2).trim() };
}

export function parse(text) {
  const rows = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    rows.push({ indent: raw.length - raw.trimStart().length, text: raw.trim() });
  }
  let at = 0;

  function block(indent) {
    if (at >= rows.length || rows[at].indent < indent) return {};
    return rows[at].text.startsWith("- ") || rows[at].text === "-" ? sequence(indent) : mapping(indent);
  }

  function sequence(indent) {
    const out = [];
    while (at < rows.length && rows[at].indent === indent && (rows[at].text === "-" || rows[at].text.startsWith("- "))) {
      const row = rows[at];
      if (row.text === "-") {
        at++;
        out.push(block(indent + 2));
      } else {
        const inner = row.text.slice(2).trim();
        at++;
        out.push(parseScalar(inner));
      }
    }
    return out;
  }

  function mapping(indent) {
    const out = {};
    while (at < rows.length && rows[at].indent === indent) {
      const split = splitKey(rows[at].text);
      if (split == null) throw new Error(`yaml: line ${at + 1} is not a mapping entry: ${rows[at].text}`);
      at++;
      out[split.key] = split.rest === "" ? block(indent + 2) : parseScalar(split.rest);
    }
    return out;
  }

  const doc = block(0);
  if (at !== rows.length) throw new Error(`yaml: stopped at line ${at + 1}: ${rows[at].text}`);
  return doc;
}
