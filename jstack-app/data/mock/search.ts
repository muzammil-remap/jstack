/**
 * search.ts (K-1, §4.19, §7) — the mock's search index over the twelve kinds.
 *
 * A SERVER concern, like `labelRules.ts` and `triage.ts`, and for the reason
 * that matters most here: the scoping. A record outside the session user's
 * silos and a record above the session's clearance must never be RETURNED,
 * not merely never rendered. A client-side filter over a full result set is a
 * privacy control you can read out of the network tab, and MU-02 exists
 * because that distinction is the whole of the labelling scheme.
 *
 * The index is built at query time rather than at reset. Building it at reset
 * would be faster and would be wrong: every write handler mutates `db.get()`
 * in place, so an index built once is stale the moment a task is renamed or a
 * capture arrives, and a search that cannot find what you typed thirty seconds
 * ago is worse than no search. The corpus here is a few hundred rows.
 *
 * MATCHING is deliberately dumb and deliberately stated: lower-case, strip
 * punctuation, split on whitespace, and a query token matches a record token
 * that STARTS WITH it, for tokens of three characters or more. No stemming, no
 * fuzzy distance, no ranking model. What this has to demonstrate is the shape
 * a real backend returns and the scoping it must apply; a clever matcher in
 * the mock would only teach the app to depend on behaviour the backend will
 * not have.
 */
import * as db from "@/data/mock/db";
import { FILE_KIND_LABELS } from "@/data/files";
import { goalMetaLine } from "@/lib/goalMeta";
import type { SearchGroup, SearchKind, SearchMatch, SearchResponse, SearchResult, Sensitivity } from "@/data/types";
import type { Silo } from "@/data/labels";

/** §7: the order groups come back in, and it is the order they are shown in.
 * The app does not sort — a second ordering is a second answer to "what is
 * most relevant", and only one end can own that. */
const KIND_ORDER: SearchKind[] = ["task", "brain", "reply", "file", "decision", "issue", "learning", "goal", "habit", "person", "rule", "subtask"];

/** Which surface each kind opens. One place, so a row added here cannot open
 * somewhere different from the same record opened anywhere else. */
const REF: Record<SearchKind, { tab: string; dialog: string }> = {
  task: { tab: "tasks", dialog: "task" },
  subtask: { tab: "tasks", dialog: "task" },
  brain: { tab: "brain", dialog: "brain-item" },
  reply: { tab: "brain", dialog: "reply" },
  file: { tab: "tasks", dialog: "file" },
  decision: { tab: "today", dialog: "decision" },
  issue: { tab: "agents", dialog: "issue" },
  learning: { tab: "life", dialog: "learning" },
  goal: { tab: "life", dialog: "goal" },
  habit: { tab: "life", dialog: "trends" },
  person: { tab: "life", dialog: "people" },
  // ST-1 moved the standing rules to Settings and renamed their editor. Both
  // halves of that sentence are this row: the DIALOG was corrected at B-70 and
  // the TAB was left on `brain`, the tab ST-1 removed rules from — so following
  // a rule from Find landed on Brain with the Settings editor over it, and
  // Close left you on a tab you never chose, which is the outcome
  // `layout/openRef.ts` says this column exists to prevent (A4R4-07, B-199).
  // `today` is the app home and the one landing that surprises nobody; the
  // editor itself is a Settings panel and opens over whatever tab you are on.
  rule: { tab: "today", dialog: "rules-edit" },
};

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t !== "");
}

/**
 * The ranges are computed over the TEXT THAT IS RETURNED — the title and the
 * snippet as the response carries them, not the record's own fields — because
 * the app highlights what it is given. A range against text the caller never
 * sees is a highlight in the wrong place.
 *
 * BOTH fields, which is what `SearchMatch.field` is for. The first version of
 * this only ranged over the snippet, and the device pass is what showed it:
 * every frame of a search for "steve" had six rows whose TITLES said Steve and
 * not one highlight on the screen, because the title is where a match usually
 * is and nothing was looking there.
 */
function matchRanges(field: string, text: string, queryTokens: string[]): SearchMatch[] {
  const lower = text.toLowerCase();
  const out: SearchMatch[] = [];
  for (const q of queryTokens) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(q, from);
      if (at === -1) break;
      // a word START only — "and" must not light up the middle of "Sandra"
      if (at === 0 || !/[a-z0-9]/.test(lower[at - 1])) out.push({ field, start: at, end: at + q.length });
      from = at + q.length;
    }
  }
  return out;
}

/** Title ranges then snippet ranges, each sorted within its own field — the
 * renderer walks one field at a time and a merged sort would interleave two
 * coordinate systems. */
function allMatches(title: string, snippet: string, queryTokens: string[]): SearchMatch[] {
  const by = (a: SearchMatch, b: SearchMatch) => a.start - b.start;
  return [...matchRanges("title", title, queryTokens).sort(by), ...matchRanges("snippet", snippet, queryTokens).sort(by)];
}

function hits(haystack: string, queryTokens: string[]): boolean {
  if (queryTokens.length === 0) return false;
  const words = tokens(haystack);
  return queryTokens.every((q) => words.some((w) => w.startsWith(q)));
}

type Row = { kind: SearchKind; id: string; title: string; snippet: string; silo?: Silo; sensitivity?: Sensitivity; focus?: string; at?: string };

/**
 * Every searchable record, flattened. Written out rather than derived from a
 * table of field names: each kind has a different idea of what its title and
 * its one line of context are, and a generic "join every string field"
 * produces snippets nobody would write.
 */
function corpus(): Row[] {
  const s = db.get();
  const rows: Row[] = [];

  for (const t of s.tasks) {
    rows.push({ kind: "task", id: t.id, title: t.title, snippet: [t.project, t.dueLabel, t.status].filter(Boolean).join(" · "), silo: t.labels.silo, focus: t.focus, at: t.due });
    for (const st of t.subtasks ?? []) rows.push({ kind: "subtask", id: t.id, title: st.title, snippet: `subtask of ${t.title}`, silo: t.labels.silo, focus: t.focus });
  }
  // W-1 (UP-08): the snippet carries the EXTRACTED text when there is one, so
  // Find answers a topic that appears only INSIDE a shared page — the whole
  // point of saving the content rather than the link. It is indexed as data
  // like every other field; nothing here reads it as instruction.
  for (const b of s.brainItems)
    rows.push({
      kind: "brain",
      id: b.id,
      title: b.text,
      snippet: [b.meta, b.routing?.kind ?? "filing", b.extractedText].filter(Boolean).join(" · "),
      silo: b.labels.silo,
      sensitivity: b.routing?.sensitivity,
      focus: b.focus,
      at: b.at,
    });
  for (const r of s.replies) rows.push({ kind: "reply", id: r.id, title: r.text, snippet: "from your EA", silo: r.labels.silo, focus: r.focus, at: r.at });
  for (const a of s.actions) rows.push({ kind: "decision", id: a.id, title: a.title, snippet: a.why ?? a.type, silo: a.labels.silo, focus: a.focus });
  for (const i of s.agentIssues) rows.push({ kind: "issue", id: i.id, title: i.title, snippet: i.why, focus: "all" });
  for (const l of s.learning) rows.push({ kind: "learning", id: l.id, title: l.title, snippet: l.meta, focus: l.focus });
  // LG-1: the archive is searchable too — a goal you dropped is exactly the
  // kind of thing you go looking for — and the snippet is the composed line,
  // not the raw enum.
  for (const g of s.goals) rows.push({ kind: "goal", id: g.id, title: g.text, snippet: `${g.area} · ${goalMetaLine(g)}`, focus: g.focus });
  for (const h of s.habits) rows.push({ kind: "habit", id: h.id, title: h.name, snippet: "habit", focus: "all" });
  for (const p of s.people) rows.push({ kind: "person", id: p.id, title: p.name, snippet: `${p.item} · ${p.meta}`, focus: p.focus });
  // ST-1: the EA's standing instructions, which are `autonomyRules` now —
  // V2.1's parallel `Rule` list was retired with its four routes.
  for (const r of s.autonomyRules) rows.push({ kind: "rule", id: r.id, title: r.text, snippet: `${r.scope} · ${r.mode}`, focus: "work" });
  // X-1 (FL-04): files are their own table now, so they are indexed once, here
  // — not walked out of whichever task happened to carry them. `previewText`
  // is in the snippet on purpose: the extracted first words are what make a
  // file findable by what is INSIDE it, and a search that only matched names
  // would answer "reconciliation" with nothing while the notes file sat there
  // saying "duplicates merged". A file carries its own silo (STATE.md, K-1).
  for (const f of s.files) rows.push({ kind: "file", id: f.id, title: f.name, snippet: [FILE_KIND_LABELS[f.kind], f.previewText].filter(Boolean).join(" · "), silo: f.labels.silo, focus: f.focus, at: f.at });

  return rows;
}

/**
 * A row's SENSITIVITY when it has not stated one. A capture carries the
 * Librarian's decision; everything else is judged by the same restricted
 * types the triage uses, so "sensitive" means one thing in this app rather
 * than one thing per surface.
 */
const RESTRICTED = ["identity", "legal", "kids", "health", "confidential", "relationship", "journal", "money"];

function sensitivityOf(row: Row): Sensitivity {
  if (row.sensitivity != null) return row.sensitivity;
  if (row.silo == null) return "normal";
  const types = typesOf(row.silo, row.id, row.kind);
  return types.some((t) => RESTRICTED.includes(t)) ? "sensitive" : "normal";
}

/** The record's own label types, looked up where the record lives. Kept
 * beside `sensitivityOf` because it exists only for it. */
function typesOf(_silo: Silo, id: string, kind: SearchKind): string[] {
  const s = db.get();
  if (kind === "task" || kind === "subtask") return s.tasks.find((t) => t.id === id)?.labels.types ?? [];
  // X-1: a file's sensitivity is its OWN, read off its own record. It used to
  // be inherited from the task whose report listed it, which meant a passport
  // scan attached to an ordinary task was `normal` — the label that decides
  // whether a row is blurred under privacy blur (GS-07).
  if (kind === "file") return s.files.find((f) => f.id === id)?.labels.types ?? [];
  if (kind === "brain") return s.brainItems.find((b) => b.id === id)?.labels.types ?? [];
  if (kind === "reply") return s.replies.find((r) => r.id === id)?.labels.types ?? [];
  if (kind === "decision") return s.actions.find((a) => a.id === id)?.labels.types ?? [];
  return [];
}

type SearchQuery = { q: string; focus?: string; sensitivity?: string; limit?: number };

export function search(query: SearchQuery): SearchResponse {
  const q = (query.q ?? "").trim();
  const qt = tokens(q).filter((t) => t.length >= 3);
  if (qt.length === 0) return { q, groups: [], truncated: false };

  const allowed = db.currentSilos();
  const wanted = query.focus == null || query.focus === "" || query.focus === "all" ? null : db.get().focuses.find((f) => f.id === query.focus)?.filter.silos;

  const matched = corpus()
    // THE SILO GATE, first and unconditionally — the same rule `inFocus`
    // applies to every list read, applied here because search is the one
    // surface that reads every table at once and would otherwise be the hole
    // in it. A row with no labels at all (a habit, an issue) is not silo'd.
    .filter((r) => r.silo == null || allowed.includes(r.silo))
    .filter((r) => wanted == null || (r.silo == null ? r.focus === query.focus : (wanted as string[]).includes(r.silo)))
    .filter((r) => hits(`${r.title} ${r.snippet}`, qt));

  const sens = query.sensitivity ?? "all";
  const scoped = matched.filter((r) => {
    const level = sensitivityOf(r);
    if (sens === "normal") return level !== "sensitive";
    if (sens === "sens") return level === "sensitive";
    return true;
  });

  // The CAP is the total across every group, not a per-group slice: "showing
  // 50" has to mean fifty rows on screen, and each group still reports its
  // own full `count` so the app can say how much it is not showing.
  // The mock reads its OWN parameter table, never the client store: a server
  // that asked the app what its limit was would be taking the cap from the
  // side that is allowed to ask for more than it should get (§4.14, L-1).
  const declared = db.get().parameters.find((p) => p.key === "search.maxResults")?.value;
  const limit = query.limit ?? (typeof declared === "number" ? declared : 50);
  let left = limit;
  const groups: SearchGroup[] = [];
  for (const kind of KIND_ORDER) {
    const rows = scoped.filter((r) => r.kind === kind);
    if (rows.length === 0) continue;
    const take = rows.slice(0, Math.max(0, left));
    left -= take.length;
    groups.push({
      kind,
      count: rows.length,
      items: take.map<SearchResult>((r) => ({
        kind: r.kind,
        id: r.id,
        title: r.title,
        snippet: r.snippet,
        silo: r.silo ?? "",
        sensitivity: sensitivityOf(r),
        matches: allMatches(r.title, r.snippet, qt),
        ref: { ...REF[r.kind], id: r.id },
        ...(r.at != null ? { at: r.at } : {}),
      })),
    });
  }

  return { q, groups, truncated: scoped.length > limit };
}
