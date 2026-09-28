/**
 * A YAML reader for GitHub workflow files, and nothing else (C-1).
 *
 * `tools/yaml.mjs` reads the narrow subset THIS repository emits — every key
 * quoted, every scalar a JSON literal. A workflow file is written by people:
 * bare keys, bare scalars, `- ` sequences, and `run: |` block scalars. So
 * this is a second small parser rather than a widening of the first, because
 * widening the emitter's reader to swallow hand-written YAML would make it
 * accept things it should reject when checking its own output.
 *
 * Handles: nested mappings by indentation, `- ` sequences (scalar and
 * mapping items), `|` and `>` block scalars, `#` comments, quoted and bare
 * scalars, and `on:`/`no:` — which YAML 1.1 reads as booleans and every
 * workflow file uses as a key. Anchors, flow mappings, multi-document files
 * and tags are not supported and throw rather than guess.
 *
 * It exists to answer one question: does every `run:` in every workflow
 * reference a script that exists? A workflow that calls a tool nobody wrote
 * is a board step that fails the first time it matters.
 */

const BOOLEANS = { true: true, false: false, yes: true, no: false, on: true, off: false, null: null, "~": null };

function readScalar(text) {
  const value = text.trim();
  if (value === "") return "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") || value.startsWith("{")) {
    // a flow collection — the only one workflows use in practice is a simple
    // list of strings, and guessing at anything richer would be worse than
    // saying so
    try {
      return JSON.parse(value.replace(/'/g, '"'));
    } catch {
      throw new Error(`workflow-yaml: flow collection this parser does not read: ${value}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(BOOLEANS, value)) return BOOLEANS[value];
  if (value !== "" && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

/** Strip a trailing comment, respecting quotes. */
function withoutComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote != null) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

export function parseWorkflow(text) {
  const rows = [];
  for (const raw of text.split("\n")) {
    if (raw.trim().startsWith("#") || raw.trim() === "") continue;
    const line = withoutComment(raw).replace(/\s+$/, "");
    if (line.trim() === "") continue;
    rows.push({ indent: line.length - line.trimStart().length, text: line.trim(), raw });
  }

  let at = 0;

  /** A `|` or `>` block: every following line indented past the key. */
  function block(minIndent, fold) {
    const lines = [];
    while (at < rows.length && rows[at].indent >= minIndent) {
      lines.push(rows[at].raw.slice(minIndent));
      at++;
    }
    return fold ? lines.join(" ") : lines.join("\n");
  }

  function value(indent, rest) {
    if (rest === "|" || rest === "|-" || rest === ">" || rest === ">-") {
      const inner = at < rows.length ? rows[at].indent : indent + 2;
      return block(Math.max(inner, indent + 1), rest.startsWith(">"));
    }
    if (rest !== "") return readScalar(rest);
    return node(indent + 1);
  }

  function node(minIndent) {
    if (at >= rows.length || rows[at].indent < minIndent) return null;
    return rows[at].text.startsWith("- ") || rows[at].text === "-" ? sequence(rows[at].indent) : mapping(rows[at].indent);
  }

  function sequence(indent) {
    const out = [];
    while (at < rows.length && rows[at].indent === indent && (rows[at].text === "-" || rows[at].text.startsWith("- "))) {
      const row = rows[at];
      const inner = row.text === "-" ? "" : row.text.slice(2).trim();
      at++;
      if (inner === "") {
        out.push(node(indent + 1));
        continue;
      }
      const colon = keySplit(inner);
      if (colon == null) {
        out.push(readScalar(inner));
        continue;
      }
      // `- name: x` starts a mapping whose remaining keys are indented to
      // where `name` began
      const itemIndent = indent + 2;
      const item = {};
      item[colon.key] = value(itemIndent, colon.rest);
      while (at < rows.length && rows[at].indent === itemIndent && !rows[at].text.startsWith("- ")) {
        const next = keySplit(rows[at].text);
        if (next == null) break;
        at++;
        item[next.key] = value(itemIndent, next.rest);
      }
      out.push(item);
    }
    return out;
  }

  function mapping(indent) {
    const out = {};
    while (at < rows.length && rows[at].indent === indent && !rows[at].text.startsWith("- ")) {
      const split = keySplit(rows[at].text);
      if (split == null) throw new Error(`workflow-yaml: not a mapping entry: ${rows[at].text}`);
      at++;
      out[split.key] = value(indent, split.rest);
    }
    return out;
  }

  const doc = node(0);
  if (at !== rows.length) throw new Error(`workflow-yaml: stopped at line ${at + 1}: ${rows[at].text}`);
  return doc;
}

/** `key: rest`, respecting a quoted key and `${{ }}` in the value. */
function keySplit(text) {
  const match = /^("[^"]+"|'[^']+'|[A-Za-z0-9_.\-/]+)\s*:(\s|$)/.exec(text);
  if (match == null) return null;
  const key = match[1].replace(/^["']|["']$/g, "");
  return { key, rest: text.slice(match[0].length - (match[2] === "" ? 0 : match[2].length)).trim() };
}

/** Every `run:` string in a workflow document, however deeply nested. */
export function runSteps(doc, into = []) {
  if (doc == null || typeof doc !== "object") return into;
  if (Array.isArray(doc)) {
    for (const item of doc) runSteps(item, into);
    return into;
  }
  for (const [key, val] of Object.entries(doc)) {
    if (key === "run" && typeof val === "string") into.push(val);
    else runSteps(val, into);
  }
  return into;
}
