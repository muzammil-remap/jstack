#!/usr/bin/env node
/**
 * redact-samples.mjs — turns raw n8n webhook replies into fixtures that can be committed.
 *
 * Every field and every value's type is kept; what identifies a person or says what Josh is doing is
 * replaced: titles, names, free text, bodies, locations, links, and ids (mapped, so a relation
 * between two records survives). Timestamps, enums, counts and flags are kept as they came, because
 * they are what the adapters are tested on.
 *
 *   node remap/redact-samples.mjs <calendar|tasks> <raw.json> <out.json> [<raw.json> <out.json> …]
 *
 * One mapping per run, so ids stay consistent across the files of one run. Before writing anything
 * it checks every replaced original (4 characters or more) is absent from every output, and refuses
 * otherwise. Raw replies belong outside the repository; only the outputs are committed.
 * No dependencies.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [kind, ...pairs] = process.argv.slice(2);
if (!["calendar", "tasks"].includes(kind) || pairs.length === 0 || pairs.length % 2 !== 0) {
  console.error("usage: node remap/redact-samples.mjs <calendar|tasks> <raw.json> <out.json> [...]");
  process.exit(2);
}

const replaced = new Set();
const remember = (v) => {
  if (typeof v === "string" && v.length >= 4) replaced.add(v);
};

/** A, B, … Z, AA, AB, … — the same label for the same original. */
function labeller(prefix) {
  const seen = new Map();
  return (original) => {
    if (!seen.has(original)) {
      let n = seen.size;
      let s = "";
      do {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
      } while (n >= 0);
      seen.set(original, `${prefix} ${s}`);
    }
    remember(original);
    return seen.get(original);
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuids = new Map();
function uuid(original) {
  if (original == null) return original;
  if (!uuids.has(original)) uuids.set(original, `00000000-0000-4000-8000-${String(uuids.size + 1).padStart(12, "0")}`);
  remember(original);
  return uuids.get(original);
}

// ── calendar (JSTACK-DASH-calendar-read) ────────────────────────────────────
const eventIds = new Map();
function eventId(original) {
  if (original == null) return original;
  // a recurring instance is "<base>_<date or instant>": keep that suffix, map the base. Other ids
  // may hold underscores of their own (Gmail-made events), so only a trailing date counts.
  const m = /^(.+)_(\d{8}(?:T\d{6}Z)?)$/.exec(original);
  const base = m != null ? m[1] : original;
  if (!eventIds.has(base)) eventIds.set(base, `event${String(eventIds.size + 1).padStart(3, "0")}`);
  remember(original);
  remember(base);
  return m != null ? `${eventIds.get(base)}_${m[2]}` : eventIds.get(base);
}
const eventTitle = labeller("Event");
const place = labeller("Place");
let links = 0;

function redactEvent(e) {
  return {
    ...e,
    id: eventId(e.id),
    title: eventTitle(e.title),
    location: e.location == null ? null : place(e.location),
    meet_link: e.meet_link == null ? null : (remember(e.meet_link), "https://meet.google.com/aaa-bbbb-ccc"),
    htmlLink: e.htmlLink == null ? null : (remember(e.htmlLink), `https://www.google.com/calendar/event?eid=REDACTED${String(++links).padStart(3, "0")}`),
    recurringEventId: eventId(e.recurringEventId),
  };
}

// ── tasks (JSTACK-DASH-tasks-read: Twenty's REST records, passed through) ────
const taskTitle = labeller("Task");
const person = labeller("Person");
/** actors that are software, not people — their names are part of the record's meaning */
const SYSTEM_SOURCES = new Set(["AGENT", "API", "WORKFLOW", "APPLICATION", "IMPORT", "SYSTEM", "WEBHOOK"]);

function actor(a) {
  if (a == null) return a;
  return {
    ...a,
    workspaceMemberId: a.workspaceMemberId == null ? a.workspaceMemberId : uuid(a.workspaceMemberId),
    name: SYSTEM_SOURCES.has(a.source) ? a.name : person(a.name),
  };
}

/** markdown: keep each line's syntax (`## `, `- `, `1. `, `**`), replace its words */
function markdown(text) {
  if (text === "") return text;
  remember(text);
  return text
    .split("\n")
    .map((line) => {
      remember(line.trim());
      if (line.trim() === "") return line;
      const lead = (line.match(/^\s*(#+ |[-*] |\d+\. |> )?/) ?? [""])[0];
      const bold = line.slice(lead.length).startsWith("**") ? "**" : "";
      return `${lead}${bold}text${bold}`;
    })
    .join("\n");
}

/** blocknote: the JSON structure kept, every text run replaced */
function blocknote(json) {
  if (json == null) return json;
  remember(json);
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node == null || typeof node !== "object") return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "text" && typeof v === "string") {
        remember(v);
        out[k] = v === "" ? v : "text";
      } else out[k] = walk(v);
    }
    return out;
  };
  return JSON.stringify(walk(JSON.parse(json)));
}

function redactTask(t) {
  const out = { ...t };
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "string" && UUID.test(v)) out[k] = uuid(v);
  }
  out.title = taskTitle(t.title);
  out.bodyV2 = t.bodyV2 == null ? t.bodyV2 : { ...t.bodyV2, markdown: markdown(t.bodyV2.markdown ?? ""), blocknote: blocknote(t.bodyV2.blocknote) };
  out.createdBy = actor(t.createdBy);
  out.updatedBy = actor(t.updatedBy);
  if (typeof t.searchVector === "string") {
    remember(t.searchVector);
    out.searchVector = "'redacted':1";
  }
  if (typeof t.waitingOn === "string" && t.waitingOn !== "") out.waitingOn = person(t.waitingOn);
  return out;
}

function cursor(c) {
  if (c == null) return c;
  remember(c);
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(c, "base64").toString("utf8"));
  } catch {
    return "redacted-cursor";
  }
  const mapped = Object.fromEntries(Object.entries(decoded).map(([k, v]) => [k, typeof v === "string" && UUID.test(v) ? uuid(v) : v]));
  return Buffer.from(JSON.stringify(mapped), "utf8").toString("base64");
}

// ── the run ─────────────────────────────────────────────────────────────────
const outputs = [];
for (let i = 0; i < pairs.length; i += 2) {
  const raw = JSON.parse(readFileSync(pairs[i], "utf8"));
  const data = raw.data ?? {};
  let redacted;
  if (kind === "calendar") {
    redacted = { ...raw, data: { ...data, events: (data.events ?? []).map(redactEvent) } };
  } else {
    const pageInfo = data.pageInfo == null ? data.pageInfo : { ...data.pageInfo, startCursor: cursor(data.pageInfo.startCursor), endCursor: cursor(data.pageInfo.endCursor) };
    redacted = { ...raw, data: { ...data, pageInfo, tasks: (data.tasks ?? []).map(redactTask) } };
  }
  outputs.push([pairs[i + 1], `${JSON.stringify(redacted, null, 2)}\n`]);
}

const leaks = [];
for (const [file, text] of outputs) {
  for (const original of replaced) if (text.includes(JSON.stringify(original).slice(1, -1)) || text.includes(original)) leaks.push(`${file}: ${original.length} chars survived`);
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(text)) leaks.push(`${file}: an email address survived`);
}
if (leaks.length > 0) {
  console.error(`redact-samples: refusing to write — ${leaks.length} leak(s):\n  ${leaks.slice(0, 20).join("\n  ")}`);
  process.exit(1);
}
for (const [file, text] of outputs) writeFileSync(file, text);
console.log(`redact-samples: wrote ${outputs.length} file(s); ${replaced.size} original value(s) replaced, none survived`);
