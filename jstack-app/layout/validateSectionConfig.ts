/**
 * The section-config validator (B-1, §4.10) — one pure function, no
 * imports from React or any store, so the app, the mock server and the
 * Jest suite all run the same code (CB-02).
 *
 * It is a WHITELIST, not a sanity check. Every key must be one this file
 * names, every block type must be in the catalogue, every bind must be a
 * published name, every verb must be one of five, every string must be
 * under the limit, and every URL must be http(s). A record arriving from
 * an EA is untrusted input that happens to be well-spelled; the rule is
 * the same one the rest of the app uses for anything a model writes.
 *
 * It returns ONE field and ONE reason rather than a list, because the
 * 422 body is a sentence the configure dialog puts under a control
 * ("blocks[2].bind · no such data source"), and a list of six would be a
 * wall the EA cannot act on either.
 */
import { BLOCK_TYPES, FEEDS, LIMITS, LITERAL_BLOCKS, VERBS } from "@/layout/catalogue";
import { BINDS, ENDPOINTS, SECTION_VERBS } from "@/layout/sources";
import type { Block } from "@/data/types";
import { TABS } from "@/layout/tabRoutes";

type Validation = { ok: true } | { ok: false; field: string; reason: string };

const OK: Validation = { ok: true };
const bad = (field: string, reason: string): Validation => ({ ok: false, field, reason });

// the five tabs, from the one table (F-40, P-6)
const TAB_IDS: readonly string[] = TABS.map((t) => t.id);
const STATES = ["proposed", "active", "retired"];
const MANAGED = ["josh", "ea"];
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Every key a config may carry. Anything else is rejected by name —
 * which is how `pinned` is refused (CB-02): pinning is the registry's
 * word for "this section is not the EA's to move", so a config that
 * claims it has claimed a privilege, not set a field. */
const CONFIG_KEYS = [
  "id", "tab", "title", "hint", "column", "feed", "badge", "configure", "verb",
  "source", "blocks", "version", "state", "managedBy", "reason", "changedAt",
];

const BLOCK_KEYS: Record<Block["type"], string[]> = {
  rows: ["type", "idPrefix", "bind", "rows"],
  stats: ["type", "idPrefix", "bind", "items"],
  bars: ["type", "idPrefix", "bind", "items"],
  chips: ["type", "idPrefix", "bind", "items"],
  grid: ["type", "idPrefix", "bind", "tiles"],
  text: ["type", "idPrefix", "bind", "text"],
  ghost: ["type", "idPrefix", "text"],
  links: ["type", "idPrefix", "items"],
};

/** the inline-content key each block writes its content under. */
const CONTENT_KEY: Record<Block["type"], string> = {
  rows: "rows", stats: "items", bars: "items", chips: "items", grid: "tiles", text: "text", ghost: "text", links: "items",
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** every string anywhere under `value`, checked against the length cap. */
function longString(value: unknown, path: string): string | null {
  if (typeof value === "string") return value.length > LIMITS.string ? path : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = longString(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      const hit = longString(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

function unknownKey(obj: Record<string, unknown>, allowed: string[]): string | null {
  return Object.keys(obj).find((k) => !allowed.includes(k)) ?? null;
}

function validateUrl(url: unknown, field: string): Validation {
  if (typeof url !== "string") return bad(field, "must be a string");
  if (!/^https?:\/\/\S+$/.test(url)) return bad(field, "must be an http or https URL");
  return OK;
}

/**
 * The section-level verb (T-4). Same rule as a bind: the ACTION is a published
 * name, so the worst a config can ask for is a control that already exists.
 * The LABEL is the config's own words and only has to be words — a control
 * labelled with spaces is a control nobody can read.
 */
function validateSectionVerb(verb: unknown): Validation {
  if (verb == null) return OK;
  if (!isObj(verb)) return bad("verb", "must be an object with a label and an action");
  const extra = unknownKey(verb, ["label", "action"]);
  if (extra) return bad(`verb.${extra}`, "not a field a section verb may carry");
  if (typeof verb.label !== "string" || verb.label.trim() === "") return bad("verb.label", "must be a non-empty string");
  if (typeof verb.action !== "string" || !(verb.action in SECTION_VERBS)) {
    return bad("verb.action", `must be one of ${Object.keys(SECTION_VERBS).join(", ")}`);
  }
  return OK;
}

function validateBlock(b: unknown, i: number): Validation {
  const at = `blocks[${i}]`;
  if (!isObj(b)) return bad(at, "must be an object");
  const type = b.type;
  if (typeof type !== "string" || !BLOCK_TYPES.includes(type as Block["type"])) {
    return bad(`${at}.type`, `must be one of ${BLOCK_TYPES.join(", ")}`);
  }
  const t = type as Block["type"];
  const extra = unknownKey(b, BLOCK_KEYS[t]);
  if (extra) return bad(`${at}.${extra}`, `not a key a ${t} block may carry`);

  if (b.idPrefix != null && (typeof b.idPrefix !== "string" || !SLUG.test(b.idPrefix))) {
    return bad(`${at}.idPrefix`, "must be a lowercase slug (it becomes a testID)");
  }

  const contentKey = CONTENT_KEY[t];
  const content = b[contentKey];
  const hasContent = content != null;

  if (b.bind != null) {
    if (typeof b.bind !== "string") return bad(`${at}.bind`, "must be a string");
    if (b.idPrefix == null) return bad(`${at}.idPrefix`, "a bound block needs an idPrefix for its rows' testIDs");
    const def = BINDS[b.bind];
    if (!def) return bad(`${at}.bind`, "no such data source");
    if (def.block !== t) return bad(`${at}.bind`, `feeds a ${def.block} block, not a ${t}`);
    if (hasContent) return bad(`${at}.${contentKey}`, "a bound block cannot also carry inline content");
    return OK;
  }

  if (!hasContent) return bad(`${at}.${contentKey}`, `needs either a bind or inline ${contentKey}`);
  if (!LITERAL_BLOCKS.includes(t)) return bad(`${at}.${contentKey}`, `a ${t} block must bind to a data source, not carry its rows`);

  if (t === "text" || t === "ghost") {
    if (typeof content !== "string" || content.trim() === "") return bad(`${at}.text`, "must be a non-empty string");
    return OK;
  }
  if (!Array.isArray(content)) return bad(`${at}.${contentKey}`, "must be an array");
  if (content.length > LIMITS.items) return bad(`${at}.${contentKey}`, `at most ${LIMITS.items} items`);
  for (let j = 0; j < content.length; j++) {
    const item: unknown = content[j];
    const itemAt = `${at}.${contentKey}[${j}]`;
    if (!isObj(item)) return bad(itemAt, "must be an object");
    if (typeof item.id !== "string" || !SLUG.test(item.id)) return bad(`${itemAt}.id`, "must be a lowercase slug");
    if (t === "links") {
      const u = validateUrl(item.url, `${itemAt}.url`);
      if (!u.ok) return u;
    }
    const verb = item.verb;
    if (verb != null && (!isObj(verb) || typeof verb.action !== "string" || !VERBS.includes(verb.action as never))) {
      return bad(`${itemAt}.verb.action`, `must be one of ${VERBS.join(", ")}`);
    }
  }
  return OK;
}

export function validateSectionConfig(input: unknown): Validation {
  if (!isObj(input)) return bad("config", "must be an object");

  const extra = unknownKey(input, CONFIG_KEYS);
  if (extra) return bad(extra, "not a field a section config may carry");

  if (typeof input.id !== "string" || !SLUG.test(input.id)) return bad("id", "must be a lowercase slug");
  if (typeof input.tab !== "string" || !TAB_IDS.includes(input.tab)) return bad("tab", `must be one of ${TAB_IDS.join(", ")}`);
  if (typeof input.title !== "string" || input.title.trim() === "") return bad("title", "must be a non-empty string");
  if (input.column !== 1 && input.column !== 2 && input.column !== 3) return bad("column", "must be 1, 2 or 3");
  if (input.hint != null && typeof input.hint !== "string") return bad("hint", "must be a string");
  if (input.badge != null && input.badge !== "count") return bad("badge", "the only badge is the bound row count");
  if (input.configure != null && typeof input.configure !== "boolean") return bad("configure", "must be true or false");
  const verbCheck = validateSectionVerb(input.verb);
  if (!verbCheck.ok) return verbCheck;
  if (input.feed != null && (typeof input.feed !== "string" || !FEEDS.includes(input.feed))) return bad("feed", "no such capability flag");
  if (typeof input.state !== "string" || !STATES.includes(input.state)) return bad("state", `must be one of ${STATES.join(", ")}`);
  if (typeof input.managedBy !== "string" || !MANAGED.includes(input.managedBy)) return bad("managedBy", `must be one of ${MANAGED.join(", ")}`);
  if (typeof input.version !== "number" || !Number.isInteger(input.version) || input.version < 1) return bad("version", "must be a whole number from 1");
  if (typeof input.changedAt !== "string" || Number.isNaN(Date.parse(input.changedAt))) return bad("changedAt", "must be an ISO timestamp");
  if (input.reason != null && typeof input.reason !== "string") return bad("reason", "must be a string");

  if (!isObj(input.source)) return bad("source", "must be an object with one endpoint");
  const srcExtra = unknownKey(input.source, ["endpoint"]);
  if (srcExtra) return bad(`source.${srcExtra}`, "not a field source may carry");
  if (typeof input.source.endpoint !== "string" || !(ENDPOINTS as readonly string[]).includes(input.source.endpoint)) {
    return bad("source.endpoint", "not an endpoint a section may read");
  }

  if (!Array.isArray(input.blocks)) return bad("blocks", "must be an array");
  if (input.blocks.length === 0) return bad("blocks", "a section needs at least one block");
  if (input.blocks.length > LIMITS.blocks) return bad("blocks", `at most ${LIMITS.blocks} blocks`);
  for (let i = 0; i < input.blocks.length; i++) {
    const v = validateBlock(input.blocks[i], i);
    if (!v.ok) return v;
  }

  // last, so a too-long string reports the field it sits in rather than
  // shadowing a more specific error above.
  const long = longString(input, "config");
  if (long) return bad(long.replace(/^config\./, ""), `must be ${LIMITS.string} characters or fewer`);

  return OK;
}
