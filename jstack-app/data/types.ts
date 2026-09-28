/**
 * Wire shapes — 1:1 with CONTRACT_v2.md §3 (camelCase, ISO 8601 UTC, money
 * as strings with `sensitivity: sens`). Row 4 of the V2 build re-cuts this
 * file from v1.2's shape wholesale (ADR-02, ADR-13): the record shapes
 * themselves changed (decision cards, tasks, agents), not just their
 * transport. `Labels`/`Silo`/`LabelType` stay in data/labels.ts (ADR-18
 * survivor) and are imported here, not redeclared.
 */
import type { Labels, LabelType, Silo } from "./labels";

/** every labelled noun (CONTRACT_v2.md §3 preamble) */
export type LabelledMeta = { labels: Labels; setAt: string; focus: string };

/** every composite response (CONTRACT_v2.md §3 preamble) */
/**
 * What changed since the `?since=` the request carried (§4.12, OF-09).
 *
 * Ids, not records: the full body is returned either way, so the delta says
 * which of the records already in hand are new or moved, and which are gone.
 */
export type Delta = { added: string[]; changed: string[]; removed: string[] };

export type Composite = {
  seenAt: string;
  generatedAt: string;
  /** Present only when the request carried `?since=` — a cold open has
   * nothing to have missed, and says so by leaving this out. */
  delta?: Delta;
};

export type Sensitive<T> = { value: T; sensitivity: "sens" };

// ─── Decision card (ADR-13) ─────────────────────────────────────────────

/** W-1 adds `triage`; ST-1 (5c) adds `rule` when it builds the card that
 * needs it (resolution #18). A member with no producer and no renderer is a
 * claim with no gate behind it, so each arrives with its row. */
export type ActionKind = "opts" | "quote" | "bill" | "section" | "parameter" | "triage" | "rule";
export type ActionVerb = "approve" | "revise" | "later" | "never" | "teach";
export type ActionState = "open" | "answered" | "later" | "expired" | "undone";

export type ActionOption = { text: string; why: string };
export type ActionBillLine = { k: string; v: string; copy?: boolean };
/** `url` is what makes a source a LINK. Without one there is nowhere to go, so
 * the why-line renders it as plain provenance rather than in accent ink —
 * "Colour means you can act" (README Principles 3). It used to be accent ink
 * either way and a tap emitted the internal `ref` into a toast, which is a
 * toast standing in for a feature (AUDIT_v2.md A-11). */
export type ActionSource = { label: string; ref: string; ts?: string; url?: string };
export type ActionHistoryEntry = { verb: ActionVerb | "undone"; option?: 1 | 2 | 3; at: string; via: "app" | "telegram" | "expiry" };
export type ActionReceipt = { cost: number; model: string; sources: number; seconds: number };

export type ActionItem = LabelledMeta & {
  id: string;
  type: string; // "Clash" | "Email" | "Bill" | "Report" | ... (open, EA-authored)
  kind: ActionKind;
  title: string;
  state: ActionState;
  /** server-computed priority for the Needs you rank+cap (CONTRACT_v2.md
   * §7: "ranks open cards by rank"); lower ranks first. Not itself part of
   * §3's shape table, which describes rank as a server behaviour rather
   * than a stored field — carried here so the mock's handler and a real
   * backend agree on one place to read it from (BUGLOG_v2.md A-08). */
  rank: number;
  options?: [ActionOption, ActionOption, ActionOption];
  recommended?: 1 | 2 | 3;
  quote?: string;
  bill?: ActionBillLine[];
  /** §4.10: the config an EA-proposed section card carries, previewed
   * read-only in the card body (B-3). The card holds it rather than
   * pointing at a stored id because a proposal is not a section yet —
   * approving is what creates one. */
  section?: SectionConfig;
  /**
   * §4.23 (W-1, ADR-64): the EA's PROVISIONAL filing of something shared in.
   *
   * Only for a routing the agent is not sure of — a confident filing is just
   * filed, and a card for every share would be a card nobody reads. `why` is
   * the agent's reason in its own words; `extracted` is what it read out of
   * the page, so the card can say "content saved · 412 words" without the
   * renderer counting anything itself.
   */
  triage?: TriageProposal;
  /** ST-03: the standing rule the EA is proposing, when `kind` is `rule` */
  rule?: ActionRule;
  /** §4.14 (L-1, ADR-41): what an EA-proposed parameter change is asking for.
   * `current` is copied at proposal time so the card can say "10 → 20" without
   * a second request, and so a card left open for two days still shows what
   * the EA was actually looking at. */
  parameter?: ParameterProposal;
  why: string;
  sources: ActionSource[];
  expiresAt: string;
  thenWhat: string;
  silence: string;
  verb: string; // primary label, e.g. "Go with", "Approve", "Open NAB"
  toast: string; // "{n}" substitutes the chosen option
  history: ActionHistoryEntry[];
  receipt: ActionReceipt;
  sourceUrl?: string;
  laterUntil?: string;
};

export type PostActionBody =
  | { verb: "approve"; option?: 1 | 2 | 3 }
  | { verb: "revise"; revision: string }
  | { verb: "later"; until?: string }
  | { verb: "never"; rule?: string }
  | { verb: "teach"; rule: string };

export type PostActionResult = ActionItem | { status: "outbox_user_sends" };

export type Insight = LabelledMeta & {
  id: string;
  text: string;
  why: string;
  sources: ActionSource[];
  primary: { label: string; action: string };
  secondary: { label: string; action: string };
  state: "open" | "done";
  result?: string;
};

// ─── Tasks (the Gantt is a view of this set, ADR-46) ────────────────────

export type TaskStatus = "open" | "in_progress" | "waiting" | "done";
export type TaskOwner = "josh" | "joce" | "ea" | "dev";
export type TaskDelegationState = "acknowledged" | "questions" | "estimate" | "running" | "done";

/**
 * §4.17 (X-1) — a file, and the one record that describes one.
 *
 * `TaskReport.files` used to be a `{ name, ref }` pair invented for the EA's
 * report card, and `TaskDetail` composed a Dropbox link out of the project
 * name. Both were placeholders that rendered convincingly:
 * the chip said `export.csv` and the button said "Dropbox folder", and neither
 * pointed at anything. FL-06 removes the second and this type replaces the
 * first, so a file the app shows is a file the backend indexed.
 *
 * `storage` is where the bytes ARE, and Q16 closed it (7 Sep): Dropbox is the
 * record for every file, Josh's uploads and the EA's deliverables alike. The
 * other two members are not speculative — `store` is the working copy a
 * backend may hold, and `url` is a link somebody shared — but every V2.2
 * fixture is `"dropbox"` (contract §5) and `dropboxUrl` is what the sheet
 * offers.
 *
 * `url` is DELIBERATELY separate from `dropboxUrl` and deliberately
 * short-lived: it is a signed URL minted per `GET /files/{id}`, and FL-05
 * turns that into a caching rule the cache itself enforces — `lib/recentFiles.ts`
 * stores the metadata, the `previewText` and the `dropboxUrl`, and never `url`
 * or a body. A signed URL in a device cache is a credential in a device cache.
 */
export type Attachment = LabelledMeta & {
  id: string;
  name: string;
  kind: AttachmentKind;
  /** bytes; absent for a `link`, which has no size of its own */
  size?: number;
  storage: "store" | "dropbox" | "url";
  /** short-lived and signed, minted per request when the store holds a working
   * copy — never cached, never persisted (FL-05) */
  url?: string;
  urlExpiresAt?: string;
  dropboxUrl?: string;
  /** the Dropbox path this lives under, e.g. `/JSTACK/Deliverables/2026/t9` */
  folder: string;
  /** the extracted first words, when the backend's index has them — what the
   * text viewer shows and what `GET /files?q=` matches on besides the name */
  previewText?: string;
  taskId?: string;
  subtaskId?: string;
  brainId?: string;
  /** the capture this arrived with (ADR-64), when it did */
  captureId?: string;
  /** who put it there. Replaces `producedBy`: the EA is not the only producer
   * once Josh can attach a file himself, and "added" is the honest verb for
   * both (contract §3). */
  addedBy: "josh" | "joce" | "ea" | "dev";
  at: string;
};

export type AttachmentKind = "pdf" | "doc" | "sheet" | "image" | "text" | "link";

/** `GET /tasks/{id}/files` and `GET /files` (FL-01, FL-03) */
export type AttachmentList = { attachments: Attachment[] };

export type TaskReport = { summary: string; body: string; flagged: number; sources: number; state: "open" | "accepted" | "revise" };

export type Task = LabelledMeta & {
  id: string;
  title: string;
  /** The pieces of the meta line only the SERVER knows (D-1, ADR-47). The
   * line itself is composed by `lib/taskMeta.ts` — `meta` used to be a
   * sentence the server wrote, clock and all, and four surfaces printed it
   * verbatim in whatever zone the server happened to be in. */
  metaParts?: { source?: string; cost?: string; note?: string };
  owner: TaskOwner;
  due?: string;
  dueLabel?: string;
  priority: "low" | "medium" | "high";
  status: TaskStatus;
  project?: string;
  links: { label: string; url: string }[];
  repeat?: { rule: string; nextRun?: string; lastRunCost?: number };
  delegated?: { to: "ea"; progressPct?: number; cost?: number; state: TaskDelegationState };
  /** ADR-42 (T-1): the task's own window, as instants with an offset. It
   * replaces `gantt: { start, end }`, which was a day-only pair invented for
   * the read-only axis and could not carry the 9-to-5 a person actually
   * means. F-1 deleted the old `gantt: { start, end }` pair with the route it
   * was invented for. */
  startsAt?: string;
  endsAt?: string;
  /** when and by whom it was finished (TK-11, TK-12) — the card says
   * "Completed · EA · Thu 11 Sep, 2:14pm" from these two, not from prose */
  completedAt?: string;
  completedBy?: TaskOwner;
  /** when the whole task was handed over (TK-06). The delegated MARKER reads
   * from `delegated`; this is when it happened. */
  delegatedAt?: string;
  /** the Life goal this task serves, if any (ADR-42) */
  goalId?: string;
  /** B-1, ADR-45: Twenty's own kanban value — a `Column.id`. It is what a board
   * move actually changes; `status` follows only where the column has exactly
   * one. A task with none falls into the first column its status fits, which is
   * what every fixture task did before this field existed. */
  column?: string;
  /** what an agent is doing with it right now (ADR-42, WK-01). T-2 sets it
   * when a task is delegated; T-5 renders the marker it drives. */
  work?: Work;
  subtasks: Subtask[];
  report?: TaskReport;
  /** `usageId` (T-4) joins an entry to the `Usage` row it is about, so the
   * card can draw the run's tokens and cost under the line that describes it
   * instead of repeating the event as a second row. */
  activity: { at: string; actor: string; text: string; usageId?: string }[];
  waitingOn?: { who: string; what: string; days: number; note?: string };
  twentyUrl?: string;
};

/**
 * A named type at last (TK-01). It was an inline object literal on `Task`,
 * which is why nothing else could refer to a subtask without repeating its
 * shape — and why the two fields ADR-42 adds had nowhere to go.
 */
export type Subtask = {
  id: string;
  title: string;
  owner: TaskOwner;
  done: boolean;
  meta?: string;
  /** set when it was ticked, so the card can say when (TK-11) */
  completedAt?: string;
  /** who it was handed to, when that is not the task's own owner (TK-09) */
  delegatedTo?: TaskOwner;
};

/** WK-01: an agent run, as the app sees it. `since` is an instant. */
export type WorkState = "queued" | "running" | "blocked" | "done";
export type Work = { agentId: string; state: WorkState; since: string; step?: string };

/**
 * §4.15 (T-2, resolution #22) — who a task can be handed to.
 *
 * `getAgentSpend().caps[].agent` cannot answer this: a cap is a money limit
 * on an agent, not a statement that it takes work, and the dev is a person
 * with no cap at all. The roster is its own list because the question
 * "who can I delegate to" is its own question.
 */
export type AgentRosterEntry = {
  id: TaskOwner;
  name: string;
  /** the two letters a circle or a chip shows (JQ-4). A FACT ABOUT THE PERSON,
   * carried with them, because the alternative was a hand-written map that gave
   * Josh and Joce the same "J" — two people in one circle, told apart only by
   * the name beside it. Derived initials cannot express "Joce is JM". */
  short: string;
  canTakeTasks: boolean;
};
export type AgentRoster = AgentRosterEntry[];

/** the fields a subtask edit may carry (TK-08, TK-09) */
/** TK-10: ticking a task with open subtasks asks first, and the answer rides
 *  on the request rather than being inferred by the server. */
export type CompleteBody = { includeSubtasks: boolean; offlineId?: string };

export type SubtaskPatch = { done?: boolean; title?: string; owner?: TaskOwner; delegatedTo?: TaskOwner; offlineId?: string };

/**
 * B-1, ADR-45: the board's columns mirror the kanban field in Twenty. `statuses`
 * is what the column MEANS in this app's own vocabulary — a card lands in the
 * first column whose `statuses` contains its status — and `source` says whose
 * the names are: they change in Twenty, not here.
 *
 * Five columns over four statuses, deliberately (resolution #44). Now and Next
 * both map to `open`, which is why a board move sets `status` only where the
 * column has exactly ONE status: moving a card from Now to Next must not
 * invent a status change, and the thing that actually moved is `Task.column`.
 *
 * The fixture ids are PREFIXED (`col-waiting`, not `waiting`) because a bare
 * one is a landmine: `/tasks/waiting` is a literal route, so a column id that
 * looked like a task id made the conformance runner ask for a task and get a
 * list of waiting rows (B-1, B-29). Twenty's own ids are uuids; the prefix is
 * the mock keeping the same promise a uuid would.
 */
export type Column = { id: string; name: string; statuses: TaskStatus[]; order: number; source: "twenty" };
export type ColumnList = Column[];

/**
 * F-1, ADR-44: a slicer is a stored record, not a closed enum with a server
 * `if/else` behind it. What stays closed is the PREDICATE KIND — five questions
 * the server knows how to answer — which is what makes a slicer Josh writes
 * safe to store and evaluate: the worst one he can save is a filter that
 * matches nothing.
 */
export type SlicerPredicate =
  | { kind: "dueWithin"; days: number }
  | { kind: "status"; status: TaskStatus }
  | { kind: "delegated" }
  | { kind: "owner"; owner: TaskOwner }
  | { kind: "repeat" };

/** `fixed` is "this one cannot be removed" — the same word the focus editor
 * uses, and the same meaning (`ChipSetEditDialog`). */
export type Slicer = { id: string; name: string; predicate: SlicerPredicate; fixed?: boolean };
export type SlicerList = Slicer[];

/** the seeded ids, kept as a type only so the fixtures and the specs can name
 * one without a string literal drifting. A slicer Josh adds has its own id and
 * is not in this union — which is why nothing evaluates against it. */
export type TaskSlice = "week" | "waiting" | "delegated" | "agent" | "recurring";
/** F-1: "gantt" is a real view now — `GET /tasks?view=gantt` returns the same
 * filtered set the other three do, and `GET /tasks/gantt` is gone. */
export type TaskView = "list" | "board" | "gantt" | "done";


// ─── Calendar ────────────────────────────────────────────────────────────

export type CalendarSource = "personal" | "work" | "family";

export type CalEvent = LabelledMeta & {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  source: CalendarSource;
  prep?: string;
  protectedByEa?: boolean;
  googleUrl?: string;
};

export type FreeGap = { startsAt: string; endsAt: string; suggestion?: string };
export type CalendarView = "today" | "3day" | "week" | "month";
export type MonthDotSummary = { date: string; count: number };

// ─── Brain ───────────────────────────────────────────────────────────────

/** W-1 adds `share`: something sent in from another app through the capture
 * route or the Dropbox inbox. A real source rather than a flavour of `typed` —
 * UP-04 asserts the Latest in row says so, and the triage rules treat a link
 * somebody shared differently from a sentence somebody wrote. */
/** Where a capture came from. `system` (LG-1) is the app's own record of
 * something that happened to a record — "Goal archived · …" — and it is its
 * own member rather than borrowed from `agent`, which would say an agent did
 * it, or `typed`, which would say Josh wrote those words. The row renders
 * `meta`, not this, so no label map moves; what this stops is a fixture or a
 * filter reading a system note as somebody's capture. */
export type BrainSource = "voice" | "typed" | "transcript" | "journal" | "agent" | "share" | "system";

export type BrainItem = LabelledMeta & {
  id: string;
  text: string;
  /** When it came in — an instant, formatted by the app (D-1, ADR-47).
   * Separate from `setAt`, which is when its LABELS were set: the two are
   * equal for a capture and are not the same fact. */
  at: string;
  /** the parts that are not a time — "voice · Telegram". The clock used to be
   * composed in here by the server, which is exactly what ADR-47 removed. */
  meta: string;
  source: BrainSource;
  /** V2.1's line, kept while the two coexist — `routing.also` replaces it
   * (resolution #50) and R-1 renders from `routing`. */
  routed: string[]; // "→ task · Twenty"
  /** §1.19 / RP-06: what the default agent decided. Optional while the mock's
   * older fixtures still carry only `routed`; the row renders whichever it
   * has, and prefers this. */
  routing?: CaptureRouting;
  /**
   * W-1 / UP-08: what the agent read out of a shared link.
   *
   * `screened` is not decoration and it is not optional in meaning: it says a
   * tool-less extract step produced this text and nothing in it was executed,
   * quoted to a model as instruction, or allowed to create a rule or a memory.
   * `SECURITY.md`'s ingestion threat model is the long form. The app renders
   * `extractedText` through `Txt` ONLY — never rich text, never a live link —
   * because it is content from outside the system.
   */
  extractedText?: string;
  extractedFrom?: string;
  /** the SERVER's count, so the row and the triage card cannot disagree about
   * how many words were saved — the app counting for itself would be a second
   * implementation of one fact (rule 16) */
  extractedWords?: number;
  screened?: boolean;
  state?: "in review";
  editedAt?: string;
  versions?: BrainItemVersion[];
};

export type BrainItemVersion = { at: string; text: string; editor: "josh" | "ea" };
/** `duplicate` is set only when a capture arrives with an `offlineId` the
 * server has already stored (CONTRACT_v21.md §4.12, §1.12): the write is
 * idempotent and the caller is told the record it got back is the one it
 * already sent, not a new one. Absent means this was the first arrival. */
export type DumpResult = { item: BrainItem; routed: string[]; duplicate?: boolean };
export type FindAnswer = { headline: string; synthesis: string; sources: ActionSource[]; confidence: number; seconds: number };
export type FindResult = { id: string; title: string; snippet: string; ref: string };

export type MemoryProposal = { id: string; text: string; by: "Librarian"; reason: string; focus: string; state: "open" | "accepted" | "edited" };
export type MemoryHitRate = { right: number; total: number; wrongSources: number; misses: number; rulesMisled: number; fixUrl?: string };
/**
 * OP-03: what the Librarian was told, and by whom. A correction with no
 * history is a correction nobody can audit — "all" on Memory opens this.
 * `was` is the value BEFORE the decision, which is the thing you come back
 * to check.
 */
/**
 * §1.19 / RP-06 — how sensitive a capture is, as the agent classified it.
 * The row renders "sensitive" in the alert tint and the other two neutrally.
 * K-1's Find filter (`all | normal | sens`, resolution #49) narrows over this
 * rather than carrying its own vocabulary.
 */
export type Sensitivity = "open" | "normal" | "sensitive";

/**
 * §1.19 — what the default agent decided about a capture. The APP never
 * triages: it renders this. `also` carries secondary destinations
 * ("reminder Fri") and replaces V2.1's `routed` (resolution #50).
 */
/**
 * W-1 / UP-05, UP-09 — what a triage card carries.
 *
 * `routing` rather than a flattened silo/labels/sensitivity, because the card
 * shows the SAME shape the row shows and `edit` hands the same shape back.
 * Two representations of one filing is how the card and the row end up
 * disagreeing about what the EA decided.
 */
export type TriageProposal = {
  captureId: string;
  routing: CaptureRouting;
  why: string;
  /** the extraction, when the share was a link the agent could read */
  extracted?: { words: number; from: string };
};

export type CaptureRouting = {
  kind: "task" | "journal" | "memory" | "question" | "note" | "reading";
  silos: string[];
  labels: string[];
  sensitivity: Sensitivity;
  storage: "twenty" | "journal" | "memory" | "dropbox";
  provisional?: boolean;
  reason?: string;
  also?: string[];
};

/**
 * §3 — the EA's answer to a capture that was a question.
 *
 * `ref` is `"<kind>:<id>"` over `SearchResult.kind`, resolved by the one
 * `openRef` in `layout/openRef.ts` (resolution #31). A reply created from a
 * Dictate turn arrives `read: true` — Josh has already seen it in the thread,
 * and only a question he asked and walked away from should arrive unread
 * (resolution #28).
 */
export type Reply = LabelledMeta & {
  id: string;
  toCaptureId: string;
  text: string;
  sources: { label: string; ref: string }[];
  at: string;
  read: boolean;
};
export type ReplyList = Reply[];
export type ReplyPatch = { read: boolean };

/**
 * §3 / §4.19 (K-1) — global search across the twelve kinds.
 *
 * `ref` is STRUCTURED here and a string on a Reply's source. That is not an
 * inconsistency: a reply's source is written by the EA into free-form JSON and
 * has to survive being read by something that knows nothing about this app, so
 * it is one opaque token; a search result is composed by the search index
 * itself, which already knows the tab and the dialog and would only be
 * re-encoding what it has.
 */
export type SearchKind =
  | "task"
  | "subtask"
  | "brain"
  | "reply"
  | "file"
  | "decision"
  | "issue"
  | "learning"
  | "goal"
  | "habit"
  | "person"
  | "rule";

/** A character range IN the returned `snippet`, so the app highlights what
 * the SERVER matched rather than re-running the match on the text it was
 * handed — two matchers that disagree is two answers to "why is this here". */
export type SearchMatch = { field: string; start: number; end: number };

export type SearchRef = { tab: string; dialog: string; id: string };

export type SearchResult = {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  silo: string;
  sensitivity: Sensitivity;
  matches: SearchMatch[];
  ref: SearchRef;
  at?: string;
};

export type SearchGroup = { kind: SearchKind; count: number; items: SearchResult[] };

/** `truncated` says the CAP bit, not that a group was shortened: each group
 * keeps its full `count` so the app can say "12 tasks" while showing three. */
export type SearchResponse = { q: string; groups: SearchGroup[]; truncated: boolean };

export type MemoryHistoryEntry = { id: string; text: string; decision: "accepted" | "edited" | "declined"; at: string; by: string; was?: string };
export type Rule = { id: string; n: number; text: string; version: number; state: "active" | "retired"; from?: { cardId: string } };

/**
 * §4.23 (W-1, resolution #18) — a standing instruction the EA follows without
 * asking again.
 *
 * Written by `teach` on a triage card: "File x.com shares under Work ·
 * reading". `scope` narrows it to one kind of decision so a rule taught about
 * filing cannot silently start answering questions; `"all"` is the deliberate
 * wide case and it has to be chosen.
 *
 * `mode: "auto"` means the EA acts and does not raise a card; `"ask"` means it
 * still asks but says which rule it is applying. W-1 writes these and the mock
 * obeys them; ST-1 (5c) builds the editor under Settings and migrates V2.1's
 * `Rule` list into it — until then both exist, which is recorded rather than
 * left to be discovered.
 */
export type AutonomyRule = {
  id: string;
  text: string;
  scope: "all" | ActionKind;
  mode: "auto" | "ask";
  on: boolean;
  /** who taught it — `josh` when it came from a card he answered */
  addedBy?: "josh" | "ea";
  addedAt?: string;
};

export type AutonomyRuleList = { rules: AutonomyRule[] };
/** ST-03: the rig's lever for raising a proposal, so the card can be driven in
 * a test without waiting for the EA to notice a pattern. */
export type AutonomyProposeBody = { text?: string };
/** ST-03: what a `rule` card carries. The EA has noticed it keeps being told
 * the same thing and is asking whether to make it standing — so the card
 * shows the rule it would write, in the words it would write them, and
 * Approve appends exactly that. `why` is the evidence: how many times, over
 * what. */
export type ActionRule = { text: string; scope: AutonomyRule["scope"]; mode: AutonomyRule["mode"]; why: string };

/** §3 — what the capture route receives from a share (W-1). Not an API shape:
 * `text`, `url` and `title` arrive in the URL FRAGMENT so no server, proxy or
 * Shortcut log records them (ADR-64, SEC-11's one stated exception), and files
 * arrive only through the PWA `share_target` POST. */
export type ShareIn = { text?: string; url?: string; title?: string; files?: Attachment[] };

// ─── Life ────────────────────────────────────────────────────────────────

/**
 * How a goal is going, as an ENUM (CONTRACT_v22.md §3, LG-1).
 *
 * It was a free `status: string` carrying a whole sentence — "on track · due
 * 17 Sep", "behind · 2 this week" — with a `statusTone` beside it saying how
 * to colour that sentence. Three surfaces printed it verbatim, the date inside
 * it was a fixture literal rather than the field it described, and the tone was
 * a second declaration of what the status already said (hard rules 16, 19, 21).
 * `lib/goalMeta.ts` composes the line now, and the tone is derived.
 */
export type GoalStatus = "active" | "behind" | "done" | "dropped";

/** What a goal is measured by. `value` is the backend's to advance from agent
 * work (contract §4.20); the app only ever reads it. */
export type GoalKpi = { label: string; value: number; target: number; unit?: string };

/** Appended, never rewritten — the record of what happened to a goal, which is
 * what "All goals" opens an archived one to show. */
export type GoalHistoryEntry = { at: string; event: string; detail?: string };

export type Goal = LabelledMeta & {
  id: string;
  area: string;
  text: string;
  status: GoalStatus;
  /** a DAY, with no clock in it — `formatDate`, never `formatWhen`
   * (resolution #6) */
  targetDate?: string;
  kpis?: GoalKpi[];
  taskIds: string[];
  deliverableIds: string[];
  history: GoalHistoryEntry[];
};
/**
 * A habit on the tracking list — or off it (LH-2).
 *
 * `archived` is how a habit LEAVES, and it is the only way: `PUT /habits`
 * refuses a list that has simply dropped one. Josh: "when I delete a habit from
 * my current tracking list, the data must be retained". A delete that keeps the
 * logs but loses the name is a row of numbers nobody can read, so the record
 * stays and stops being listed.
 */
export type Habit = { id: string; name: string; sort: number; archived?: boolean; archivedAt?: string };
export type HabitsBody = { habits: Habit[] };
export type HabitLog = { habitId: string; date: string; done: boolean };
/** LH-1: how a habit went, per DAY KEY. A day absent from the map was never
 * logged at all, which is not the same as logged and missed — the month grid
 * draws the two differently and a `boolean[]` could not tell them apart, nor
 * say WHICH days it was counting. */
export type HabitStatRow = {
  id: string;
  name: string;
  days: Record<string, boolean>;
  /** LH-06: stats compute for an archived habit exactly as they did before
   * it was archived — this says which one you are looking at, so a view can
   * show the active ones without the server deciding for it. */
  archived?: boolean;
  /** counted over EVERY log, not over the window: "current streak" means up to
   * today, and a month view asking about September must not report a streak
   * that starts on the 1st */
  streak: { current: number; longest: number };
  /** within the requested window, and `possible` never counts a future day */
  done: number;
  possible: number;
};

export type HabitPeriod = "week" | "month" | "year" | "all";

/**
 * `GET /habits/stats?period=&anchor=` (CONTRACT_v22.md §3, LH-01).
 *
 * The totals the summary line used to read off the top level are GONE: they
 * were derivable from `habits` and therefore a second declaration of the same
 * fact (rule 16). `lib/habitStats.ts` adds them up, once, for both the Trends
 * summary and the all-time line.
 */
export type HabitStats = {
  period: HabitPeriod;
  /**
   * The first day anybody logged anything (LH-02, resolution #17).
   *
   * A fact about the LOG, not about the window, and that is why it is on
   * the response rather than derived from `habits`: the month view carries
   * one month of days, so a client deriving the bound from what it holds
   * would find the earliest day IS the month it is looking at and the ‹
   * arrow could never page back. It is not a second declaration of
   * anything — nothing else on the wire says where the log begins.
   */
  earliest: string;
  habits: HabitStatRow[];
};

export type PersonVerb = { label: string; action: "draft" | "nudge" | "done" };
export type Person = { id: string; name: string; item: string; meta: string; verb: PersonVerb; focus: string };

export type MoneyRow = { id: string; category: string; spent: number; budget: number; pct: number; over: boolean };
export type MoneyDue = { text: string; date: string; feed: string };

export type LifeSectionConfig = { id: string; categories?: string[]; thresholds?: Record<string, number>; showWithin?: number; managedByEa: boolean };

/** OP-06: `kind` decides how a row opens — `read` shows `body` in the viewer,
 * `watch`/`listen` go through the external-link confirmation. A row with
 * neither a body nor a url is the one case that stays `static`, and says so. */
export type LearningItem = { id: string; title: string; meta: string; focus: string; kind?: "read" | "watch" | "listen"; body?: string; url?: string };

// ─── Agents ──────────────────────────────────────────────────────────────

export type AgentSummary = { runsToday: number; successPct: number; spendToday: number; issues: number; health: "healthy" | "degraded"; heartbeat: { every: string; last: string } };
export type Spend = { month: { spent: number; cap: number; landing: number }; caps: { agent: string; spent: number; cap: number }[] };
export type Portal = { name: string; purpose: string; url: string };
/** Resolution #46 / OP-05: the verbs stay `renew | run | open` (no `mute` —
 * an issue you silence is an issue you meet again later), and O-1 adds the two
 * things the detail needs: what actually failed, and when it last worked. */
export type AgentIssue = { id: string; title: string; why: string; verb: { label: string; action: "renew" | "run" | "open" }; checkId?: string; state: "open" | "done"; detail?: string; lastSuccessAt?: string };
export type SecurityCheck = { id: string; name: string; status: string; ok: boolean; lastRun?: string; issueId?: string };
export type FeedEvent = { id: string; at: string; severity: "ok" | "muted" | "alert"; text: string; meta: string; issueId?: string };
/**
 * `cost` is DERIVED, never stored (T-4, ADR-43). A run costs the sum of the
 * `Usage` rows that name it; the mock computes it in
 * `data/mock/handlers/usage.ts` and the fixture carries no number of its own.
 * It stays on the wire shape because every reader of a run wants it — but
 * there is exactly one record of what anything cost, and it is `Usage`.
 */
export type AgentRun = { id: string; agent: string; at: string; outcome: "ok" | "error" | "blocked"; cost: number; seconds: number; text: string };

// ─── Usage (ADR-43, §4.16) ───────────────────────────────────────────────

/**
 * What one agent run spent on one task — the provider's own numbers, priced
 * server-side into `costAud` against a versioned price table (CONTRACT_v22.md
 * §8 Q17). **Nothing in the app computes a price** (US-05): `costAud` arrives
 * and is displayed, and `tests/unit/usage.test.ts` greps `lib/`, `stores/`
 * and `components/` to keep it that way.
 *
 * `subtaskId` is set when the run was against a subtask, which is what lets
 * the card list a subtask's runs under the subtask rather than under the task
 * (US-02). `runId` is optional because not every provider call the backend
 * prices is one the app has an `AgentRun` record for.
 */
export type Usage = LabelledMeta & {
  id: string;
  taskId: string;
  subtaskId?: string;
  agentId: string;
  runId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  costAud: number;
  at: string;
};

/** rows grouped by model — the only grouping the wire carries. A caller that
 * wants another one (by agent, for the section's stat cards) has the rows. */
export type UsageTotal = { model: string; inputTokens: number; outputTokens: number; costAud: number };
export type UsageSummary = { rows: Usage[]; totals: UsageTotal[]; costAud: number };

// ─── Settings and configuration ─────────────────────────────────────────

export type Schedule = { id: string; name: string; meta: string; cadence: string; paused: boolean; kind: "routine" | "ea_task" };
export type NotificationGroup = { id: string; name: string; meta: string; devices: { iphone: boolean; ipad: boolean; pc: boolean; telegram: boolean }; locked?: boolean };
export type QuietHours = {
  start: string;
  end: string;
  exceptions: string[];
  /**
   * WPS-1 (v2.3.2) · when Today raises Needs you — Josh: "add 'needs you' schedule to be adjustable, in the settings
   * schedule like all the others". The windows of the day it is raised in (`HH:MM` to `HH:MM` in the device's zone, an
   * `end` before its `start` running past midnight, as these quiet hours' does), whether these quiet hours hold it
   * too, and paused. Outside every window the cards wait: the label keeps the count and the section says when they
   * come. Absent, or paused, they come as they arrive. It rides quiet hours' record because it answers the same
   * question — when something reaches Josh — and saves through the same route; the rules are
   * `lib/needsYouSchedule.ts`'s.
   */
  needsYou?: { windows: { start: string; end: string }[]; respectsQuietHours: boolean; paused: boolean };
};
export type AutonomyLevel = "ask" | "propose" | "auto";
export type AutonomySettings = Record<string, AutonomyLevel>;
/**
 * §3, extended by V-2. The four new fields are ADR-24's settings, and every
 * one of them exists because the alternative is a decision the app makes for
 * a person about their own conversation:
 *   `cueWord`      what ends a turn when they say it
 *   `endPhrases`   what makes the EA ASK whether to end (never end)
 *   `silenceTurnSeconds`  their own optional turn timer — null is OFF, and
 *                  null is the default, and car mode ignores it entirely
 *   `carMode`      64px controls, a wake lock, hands-free turn-taking
 */
export type VoiceSettings = {
  style: string;
  speed: number;
  /** TS-02: "Brief replies in Talk". Default brief — Josh will use Talk a lot
   * and a paragraph read aloud is a paragraph you cannot skim. */
  brevity?: "brief" | "full";
  /** TS-03 / resolution #10: replies are read aloud EVERYWHERE by default,
   * not only in car mode ("assume most interaction will be audio"). */
  readAloud?: boolean;
  readBriefAt: string | null;
  cueWord?: string;
  endPhrases?: string[];
  /**
   * ST-06: `null` is OFF and is the default; 10 or 60 otherwise, and NOTHING
   * ELSE. Five seconds was on the list and is gone: a five-second pause is
   * thinking, not finishing, and a timer that ends a turn on it interrupts
   * the person it is listening to — which is the one thing ADR-24 exists to
   * prevent. A union rather than a number, so the option cannot come back by
   * a stored value nobody meant.
   */
  silenceTurnSeconds?: 10 | 60 | null;
  carMode?: boolean;
};

export type Layout = { tab: string; order: string[]; hidden: string[]; managedBy: "josh" | "ea"; reason?: string; changedAt: string };
export type AppLayout = { hiddenTabs: string[]; showFocusRow: boolean };

export type Focus = { id: string; name: string; fixed?: boolean; filter: { silos?: string[]; projects?: string[]; types?: string[] } };

export type Capabilities = {
  liveRouting: boolean;
  liveVoice: boolean;
  speech: boolean;
  fileStore: boolean;
  calendarWrite: boolean;
  moneyFeed: boolean;
  healthFeed: boolean;
  export: boolean;
  calendarViews: boolean;
  /** The VAPID public key the browser needs to subscribe (U-1). Absent means
   * the backend has no push service configured, and the switch says so
   * rather than failing when it is tapped. */
  pushPublicKey?: string; // week/month grid (design/DISCREPANCIES.md: on by default, flag exists so Help can list it)
};

export type Device = { id: string; name: string; lastSeen: string; current: boolean };

// ─── Today composite ─────────────────────────────────────────────────────

export type TodayComposite = Composite & {
  dayName: string;
  /** DISPLAY only — "4 September", the form README Content specifies. Never
   * compare it to a date: `todayDate` is the machine key (B-55). */
  dateLabel: string;
  /** the server's own "today" as YYYY-MM-DD — the key every surface filters
   * habit logs and calendar rows by, so a session that spans real midnight
   * stays on the day the server means (A-22). */
  todayDate: string;
  since: string;
  health: { ok: boolean; spend: string };
  needsYou: ActionItem[]; // ≤5 open, ranked
  insight?: Insight;
  calendar: { events: CalEvent[]; gaps: FreeGap[] };
  tasks: Task[]; // top 3
  glance: { habits: string; people: number; money: string; goals: number };
  close: { habits: Habit[]; logs: HabitLog[]; journalPrompt?: string };
  endLine: string;
};

export type ReviewComposite = {
  anchor: string;
  weekThatWas: { decisions: number; promisesKept: number; timeByFocus: Record<string, number> };
  weekAhead: { habitsPct: number; spend: string };
  threePriorities: string[];
};

// ─── labels admin (v1.2 §12.1 kept) ─────────────────────────────────────

export type LabelAuditRow = { fromSilo: string; fromTypes: string[]; toSilo: string; toTypes: string[]; actor: string; reason?: string; ts: string };

// ─── Named wire shapes for the generated contract (W-1) ─────────────────
//
// `data/routes.ts` names a `body` and a `response` per route, and
// `tools/gen-openapi.mjs` walks THIS file to turn those names into JSON
// Schema. A shape that only ever existed inline in a `DataProvider`
// signature had no name to give, so it is named here. Nothing about the wire
// changed: each of these is the shape that method already returned.
//
// List aliases are shapes too. `GET /actions` returns a list, and "a list of
// ActionItem" is as much a wire shape as ActionItem is — naming it is what
// lets the route table say so in one word.

/** A 204: the route answers with no body at all. */
export type NoContent = Record<string, never>;

// §4.1 Session, devices, lock
export type AuthNonce = { nonce: string; expiresAt: string };
export type RegisterDeviceBody = { name: string; publicKey: string };
export type DeviceRegistration = { deviceId: string; token: string };
export type AuthToken = { token: string };
/** D-3 (ADR-67): the ceremony's two steps — `POST /auth/webauthn/options`
 * asks for a challenge, `POST /auth/webauthn/verify` sends what the
 * authenticator produced. Was a bare path-param string with no enum. */
export type WebauthnStep = "options" | "verify";

/**
 * What `navigator.credentials.create()` (registration) or `.get()`
 * (assertion) needs, in the JSON form `PublicKeyCredential`'s own
 * `toJSON()` produces (WebAuthn Level 3) — every buffer field is base64url,
 * never a raw `ArrayBuffer`, because nothing on the wire can carry one.
 * `rp`, `user` and `pubKeyCredParams` are registration-only; their absence
 * is what tells a client it is asserting an existing credential rather
 * than creating one — the two ceremonies ask for different things and a
 * shape that could not say which would be a shape that lied about one of
 * them by omission.
 */
export type WebauthnOptions = {
  challenge: string;
  timeout?: number;
  rp?: { name: string; id?: string };
  user?: { id: string; name: string; displayName: string };
  pubKeyCredParams?: { alg: number; type: "public-key" }[];
  authenticatorSelection?: { authenticatorAttachment?: "platform" | "cross-platform"; userVerification?: "required" | "preferred" | "discouraged" };
  allowCredentials?: { id: string; type: "public-key" }[];
  userVerification?: "required" | "preferred" | "discouraged";
};

/**
 * What the client sends back at the "verify" step: `PublicKeyCredential` as
 * `.create()`/`.get()` resolves it, JSON-serialised — `response` differs by
 * ceremony (attestation on registration, assertion on login) but both carry
 * base64url buffers only, never a raw one. Every field optional: the
 * ceremony is checked on the DEVICE today, not the server
 * (`lib/webauthnGate.ts` — "the assertion is performed and checked
 * locally; the server trust arrives at go-live"), so this narrows what a
 * real integration will eventually send without pretending the mock can
 * honestly verify any of it now.
 */
export type WebauthnCredential = {
  id?: string;
  rawId?: string;
  type?: "public-key";
  response?: { clientDataJSON?: string; attestationObject?: string; authenticatorData?: string; signature?: string; userHandle?: string; transports?: string[] };
  clientExtensionResults?: Record<string, unknown>;
  authenticatorAttachment?: "platform" | "cross-platform";
};

export type WebauthnBody = WebauthnCredential;
export type WebauthnResult = WebauthnOptions | { verified: true };
/** Who is holding this session, and what they are allowed to see (I-1,
 * CONTRACT_v21.md §3). `silos` is the server's answer, not the client's
 * opinion: every list read is filtered against it server-side, so a client
 * that forgot to filter still cannot show another person's records. */
export type SessionUser = { id: string; name: string; role: "owner" | "partner" | "dev" };
export type Session = {
  user: SessionUser;
  silos: Silo[];
  device: Device;
  devices: Device[];
  /** 900 — the access token's life, so the client can schedule its refresh
   * without hard-coding what the server decided (SEC-05). */
  tokenTtlSeconds: number;
  lockedReason?: string;
};
export type HighRiskBody = { nonce: string; biometricAssertion: string };
export type LockResult = { locked: true; at: string };
export type RecoverBody = { recoveryKey: string; nonce: string; biometricAssertion: string };
export type RecoverResult = { restored: true; agentsResuming: string[] };
/**
 * What the browser's Push API actually hands you (U-1, CONTRACT_v21.md §3).
 *
 * The earlier shape was `{ device, token, groups }`, which is the FCM/APNs
 * mental model. Web push has no token: it has an endpoint URL the push
 * service owns, and two keys the browser generates so only this device can
 * decrypt what is sent. A backend given a "token" here could not send
 * anything.
 */
export type PushSubscribeBody = {
  device: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** which notification groups this device wants — Settings › Notifications */
  groups: string[];
};

// §4.2 Today
export type JournalBody = { text: string; source: "voice" | "typed"; offlineId?: string };

// §4.3 Decisions
export type ActionList = ActionItem[];
export type ActionDraftBody = { subject?: string; body: string };
export type InsightActionBody = { action: "block" | "leave" };

// §4.4 Calendar
export type CalendarWindow = { events: CalEvent[]; gaps: FreeGap[] };
export type CalEventPatch = Partial<CalEvent>;
export type CalendarProposeBody = { gapStart: string; title: string; attendee?: string };
export type CalendarProposeResult = { status: "drafted-not-sent" };

// §4.5 Tasks
export type TaskList = Task[];
export type TaskCreateBody = Omit<Task, "id" | "activity" | "subtasks"> & { attachmentIds?: string[]; offlineId?: string };
export type TaskPatch = Partial<Task> & { offlineId?: string };
/**
 * `restoreId` is the undo path for TK-09's delete: the server keeps a
 * tombstone for the length of the undo window, and a POST naming it puts the
 * subtask back with its own id, its `done` and its meta — rather than adding
 * a lookalike with a new id, which is what a person would notice.
 */
export type SubtaskBody = { title: string; owner: TaskOwner; restoreId?: string; attachmentIds?: string[] };
/** `to` is the delegatee (T-2); `scope` is the older "just this part" hint
 *  and is left alone because the EA report flow still sends it. */
export type DelegateBody = { to?: TaskOwner; scope?: string };
export type TaskReportBody = { verb: "accept" | "revise" | "teach"; note?: string };
export type WaitingRow = { who: string; what: string; days: number; note?: string; taskId: string };
export type WaitingList = WaitingRow[];
export type NudgeResult = { draftRef: string };
export type UndoResult = { undone: string | null };
export type LabelsBody = { silo: Silo; types: LabelType[]; reason?: string };

// §4.6 Brain
/** `attachmentIds` (ADR-64, X-1/UP-02): a capture may reference files that
 * were uploaded first. The upload is its own request, so a queued capture and
 * its file replay in the order they were made rather than as one large body. */
export type BrainDumpBody = { text?: string; audioRef?: string; source: "voice" | "typed" | "share"; offlineId?: string; attachmentIds?: string[]; url?: string };
export type BrainItemList = BrainItem[];
export type BrainItemPatch = Partial<BrainItem>;
export type BrainItemVersionList = BrainItemVersion[];
/** `answer` is null for an empty query — `components/brain/Find.tsx` has
 * always guarded `answer != null`, so this records what the client and the
 * mock already agreed on. The conformance runner is what noticed the type
 * said otherwise (B-16, v2.1). */
export type BrainSearchResult = { answer: FindAnswer | null; results: FindResult[] };
export type ChatBody = { text: string };
export type ChatReply = { reply: string; sources: string[] };
/** TS-04: one turn of the Dictate thread. Server state, not client state —
 * the dialog re-hydrates from `GET /chat/thread` on open, so the conversation
 * is not lost the moment the modal closes or the page reloads. */
export type ChatTurn = { from: "josh" | "ea"; text: string; sources?: string[] };
export type ChatThread = { turns: ChatTurn[] };
export type MemoryProposalList = MemoryProposal[];
export type MemoryHistoryList = MemoryHistoryEntry[];
export type MemoryProposalBody = { verb: "ok" | "edit"; text?: string };
export type RuleList = Rule[];
export type RuleCreateBody = { text: string; from?: string };
export type RuleUpdateBody = { text: string };

// §4.7 Life
export type LifeComposite = {
  goals: Goal[];
  habits: Habit[];
  habitLogs: HabitLog[];
  people: Person[];
  money: MoneyRow[];
  moneyDue: MoneyDue[];
  learning: LearningItem[];
};
export type GoalList = Goal[];
/** `PUT /goals` replaces the whole set, as `/slicers` and `/focuses` do — a
 * goal list is small, edited as a set, and a per-goal route would need an
 * ordering the list already carries. Wrapped in an object rather than sent as
 * a bare array so the 422 can name `goals` as its field. */
export type GoalsBody = { goals: Goal[] };
/**
 * `GET /goals/{id}` — the goal WITH what hangs off it (LG-02).
 *
 * `taskIds` and `deliverableIds` are the record; resolving them here rather
 * than in the client means the detail dialog does not need the tasks tab to
 * have been visited, and the two lists cannot disagree with the ids that
 * produced them.
 */
export type GoalComposite = { goal: Goal; tasks: Task[]; deliverables: Attachment[] };
export type HabitList = Habit[];
export type HabitLogBody = { date: string; done: boolean; offlineId?: string };
export type PersonList = Person[];
export type PersonActBody = { action: "draft" | "nudge" | "done"; offlineId?: string };
export type MoneyComposite = { rows: MoneyRow[]; due: MoneyDue[]; feedNote: string };
/** §4.7's health feed is not specified yet — `capabilities.healthFeed` gates
 * the surface off, and the shape is the backend's to choose (CONTRACT §8).
 * Null until one exists, which is what the mock has always answered. */
export type HealthComposite = Record<string, unknown> | null;
export type LearningList = LearningItem[];
export type LifeSectionConfigPatch = Partial<LifeSectionConfig>;

// §4.8 Agents
export type AgentCapRow = { agent: string; cap: number };
export type AgentCapsBody = { caps: AgentCapRow[]; nonce: string; biometricAssertion: string };
export type PortalList = Portal[];
export type AgentIssueList = AgentIssue[];
export type AgentIssueActionBody = { action: "renew" | "run" | "open" };
export type FeedEventList = FeedEvent[];
export type SecurityCheckList = SecurityCheck[];
export type AgentRunList = AgentRun[];

// §4.16 Usage (ADR-43)
export type UsageList = Usage[];

// §4.9 Settings and configuration
export type NotificationGroupList = NotificationGroup[];
export type NotificationDevices = { iphone: boolean; ipad: boolean; pc: boolean; telegram: boolean };
/**
 * The BODY `PUT /settings/notifications/{id}` actually takes.
 *
 * Two things W-1 got wrong here, both found by H-1's runtime body validation
 * rather than by reading (B-24). It named the flat `NotificationDevices`,
 * while `ApiAdapter.putNotificationGroup` sends `{ devices }` — a contract
 * that disagreed with its only caller. And the devices themselves are
 * PARTIAL: the handler spreads them over what is already stored, so
 * `{ devices: { pc: false } }` means "turn the PC off and leave the rest",
 * which is what a toggle is.
 */
export type NotificationDevicesBody = { devices: Partial<NotificationDevices> };
export type ScheduleList = Schedule[];
export type FocusList = Focus[];
/** the WRAPPED body `PUT /focuses` actually receives (B-29). The table used
 * to declare `FocusList`, a bare array, while `ApiAdapter.putFocuses` sends
 * `{ focuses }` and the handler reads `body.focuses` — the same class of
 * defect as B-24, and invisible until H-1 taught the mock to validate
 * request bodies against `openapi.yaml`. */
export type FocusesBody = { focuses: Focus[] };
export type LayoutPatch = Partial<Layout>;
export type LayoutEaBody = { order: string[]; hidden: string[]; reason: string };
export type AppLayoutPatch = Partial<AppLayout>;
export type ExportJob = { jobId: string };
/** §4.9's label scheme is REMAP's to define; the app reads it opaquely. */
export type LabelsScheme = Record<string, unknown>;
export type LabelAuditRowList = LabelAuditRow[];

/**
 * Something changed on the server that the client did not ask for
 * (CONTRACT_v21.md §3, §4.13). `ids` names what moved; the client's answer is
 * to REFETCH the kind, never to patch its own state from the payload — an
 * event carrying data the client trusted would be a second copy of the
 * server's records.
 */
export type ServerEvent = {
  /** `session` is SH-09's: the server telling this device it has been signed
   * out. It is the one kind whose answer is not "refetch" — there is nothing
   * left to fetch with. */
  kind: "actions" | "tasks" | "brain" | "life" | "agents" | "sections" | "session";
  ids: string[];
  at: string;
};

/**
 * A write that has not reached the server yet (O-1, CONTRACT_v21.md §3).
 *
 * `offlineId` is the client's idea, minted before the request leaves, and it
 * is what makes a replay safe: the server stores it and answers a repeat with
 * `{ duplicate: true }` rather than creating a second record. Without it a
 * flaky connection turns one capture into three.
 */
export type OutboxEntry = {
  offlineId: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body: unknown;
  /**
   * X-1 (UP-03): a queued UPLOAD carries its file rather than a JSON body.
   *
   * `unknown` rather than the `multipart` shape itself, because `data/types.ts`
   * describes the WIRE and a queued blob is transport — `data/transport/outbox.ts`
   * is the only thing that reads it, and it casts there. On web the value is a
   * `Blob` and survives IndexedDB's structured clone; on native it is a file
   * URI string and survives JSON. Neither would survive the other's backing,
   * which is why the picker hands back different things per platform
   * (resolution #33) rather than the app converting between them.
   */
  multipart?: unknown;
  createdAt: string;
  attempts: number;
  state: "queued" | "syncing" | "conflict";
};

/** What Settings › Sync shows, and what a conflict costs (OF-07). */
export type SyncStatus = {
  queued: number;
  lastSyncAt?: string;
  conflicts: { offlineId: string; path: string; localText: string; serverReason: string }[];
};

// ─── The shape registry (W-1) ───────────────────────────────────────────
//
// `data/routes.ts` types its `body` and `response` columns as `keyof Shapes`,
// so a route naming a shape that does not exist is a `pnpm check` error rather
// than something `tools/gen-openapi.mjs` discovers at generation time. Every
// non-generic exported type above appears here exactly once; `openapi.test.ts`
// keeps the two in step, so a shape added without a registry line fails the
// board instead of quietly being unnameable.
//
// `Sensitive<T>` is absent on purpose: it takes a type argument, so it is not
// a wire shape a route can name on its own.
/**
 * §4.10 · sections as records (B-1).
 *
 * A section is normally a file: a component in `components/life/*.tsx`
 * named by `layout/registry.tsx`. A `SectionConfig` is the other kind —
 * a record the EA can propose and Josh can edit, rendered by one
 * component (`layout/SectionRenderer.tsx`) from these blocks.
 *
 * The blocks carry PRESENTATION, never data. `bind` names a slice from
 * `layout/sources.ts` (a published list; `GET /sections/catalogue` is
 * generated from it) and the live rows come from the store that owns
 * `source.endpoint`. That is deliberate: a config that could carry a
 * field path, an expression or a URL would be a small language the EA
 * writes and the app evaluates, and there is no version of that which is
 * safe to accept from a model. Picking a name off a list is.
 *
 * Literal content — `text`, `ghost`, `links`, and authored `stats`/
 * `chips` — is spelled inline, because it IS the content.
 */
export type BlockVerbAction = "open" | "draft" | "nudge" | "done" | "toggle";
export type BlockVerb = { label: string; action: BlockVerbAction };
export type BlockRow = { id: string; name: string; item?: string; meta?: string; verb?: BlockVerb };
export type BlockStat = { id: string; value: string; label: string; sens?: boolean };
export type BlockBar = { id: string; label: string; value: number; max: number; amount: string; over?: boolean };
export type BlockChip = { id: string; label: string; on: boolean };
export type BlockTile = { id: string; name: string; purpose: string; url?: string };
export type BlockLine = { id: string; text: string; accent?: string };
/** `id` is what the renderer keys the row on and derives its testID from — the
 * validator refuses an item without one (R-08). */
export type BlockLink = { id: string; label: string; url: string };

/**
 * `idPrefix` is the section's half of every `testID` it renders: a `rows`
 * block with `idPrefix: "person"` emits `person-{id}` and `person-act-{id}`,
 * `bars` with `"money"` emits `money-row-{id}` and `money-amount-{id}`. It is
 * in the config rather than derived from the section id because the four
 * sections B-2 moves onto this renderer already have their own irregular
 * ids in the LF specs, and a renderer that changes a `testID` has changed
 * the app's public surface (CONTROLS_v21.md), not an implementation detail.
 */
export type Block =
  | { type: "rows"; idPrefix: string; bind?: string; rows?: BlockRow[] }
  | { type: "stats"; idPrefix: string; bind?: string; items?: BlockStat[] }
  | { type: "bars"; idPrefix: string; bind?: string; items?: BlockBar[] }
  | { type: "chips"; idPrefix: string; bind?: string; items?: BlockChip[] }
  | { type: "grid"; idPrefix: string; bind?: string; tiles?: BlockTile[] }
  | { type: "text"; idPrefix?: string; bind?: string; text?: string }
  | { type: "ghost"; idPrefix?: string; text: string }
  | { type: "links"; idPrefix: string; items: BlockLink[] };

export type SectionState = "proposed" | "active" | "retired";

/** what a section-level verb may do. One member today; the point of the closed
 * list is that adding a second is a decision somebody makes on purpose. */
export type SectionVerbAction = "copy-csv" | "open-files-archive" | "open-learning-archive";

export type SectionConfig = {
  id: string;
  tab: "today" | "tasks" | "brain" | "life" | "agents";
  title: string;
  hint?: string;
  column: 1 | 2 | 3;
  /** a capability flag name; the section renders its `ghost` blocks only
   * while the flag is off (LF-07's shape). Checked at validation time
   * against the live capability keys, not by the type — `keyof` is not a
   * wire shape (the OpenAPI walker refuses it by design), so the list is
   * runtime data in `layout/catalogue.tsx` and `tests/unit/sections.test.ts`
   * asserts it against the real `Capabilities`. */
  feed?: string;
  /** Label decorations. `badge: "count"` shows the bound row count (LF-08);
   * `configure: true` shows the "configure" link (LF-05/LF-07). */
  badge?: "count";
  configure?: boolean;
  /**
   * One verb for the whole section (T-4), beside the heading — the slot a
   * configured section did not have until "Copy as CSV" needed one. The
   * `action` is a published name from `SECTION_VERBS` (`layout/sources.ts`),
   * not a URL or a snippet: same rule as a block's `bind`, and for the same
   * reason. The LABEL is the config's, because naming the control is exactly
   * the kind of thing the EA should be able to get right for a section it
   * proposed; what the control DOES is not.
   */
  verb?: { label: string; action: SectionVerbAction };
  source: { endpoint: string };
  blocks: Block[];
  version: number;
  state: SectionState;
  managedBy: "josh" | "ea";
  reason?: string;
  changedAt: string;
};

export type SectionList = SectionConfig[];
export type SectionConfigPatch = Partial<SectionConfig>;
export type SectionProposeBody = { config: SectionConfig; reason: string };
export type SectionCatalogueBlock = { type: string; binds: string[]; literal: boolean };
export type SectionCatalogue = {
  blocks: SectionCatalogueBlock[];
  verbs: BlockVerbAction[];
  /** the section-level verbs (T-4) — a different list from `verbs`, which is
   * what a ROW inside a block may carry. */
  sectionVerbs: SectionVerbAction[];
  endpoints: string[];
  feeds: string[];
  limits: { blocks: number; string: number; items: number };
};
/** the 422 body: one field, one reason, never a list (CB-02). */
export type SectionInvalid = { field: string; reason: string };

// ─── §4.14 Parameters (ADR-41) ──────────────────────────────────────────

/**
 * The six tunables that used to be constants inside the files that read
 * them. `unit` is what the control and `PARAMETERS.md` render, not merely a
 * label: "minutes" gets a stepper of minutes, `"boolean"` gets a switch and
 * has no range at all (defaults table #41).
 */
export type ParameterUnit = "minutes" | "seconds" | "days" | "count" | "boolean";
/** Who may change it. Everything here is Josh's; the second value means the
 * EA may also RAISE A CARD asking, which is not the same as changing it. */
export type ParameterChangeable = "josh" | "josh-or-ea-proposal";
export type ParameterKey = "lock.afterMinutes" | "lock.lockOnHideTouch" | "tasks.rangeDays" | "files.recentDays" | "mic.autoStopSeconds" | "search.maxResults";

/** The static half: `data/parameters.ts`'s table, identical on every device. */
export type ParameterDef = {
  key: ParameterKey;
  label: string;
  help: string;
  unit: ParameterUnit;
  default: number | boolean;
  /** numbers only — a boolean has no range (defaults table #41) */
  min?: number;
  max?: number;
  /** the handful of values worth one tap, offered as a `Seg` above the field.
   * In the table so the control stays generated from the row rather than
   * special-cased per key in the component (defaults table #7). */
  choices?: readonly number[];
  /** app-relative paths that actually read this key; `PARAMETERS.md` prints
   * them, and `tests/unit/parameters.test.ts` opens every one. Empty means
   * nothing reads it YET, and `plannedFor` then names the row that will —
   * a registry that claims a consumer it does not have is worse than one
   * that admits the gap. */
  usedBy: readonly string[];
  /** the build row that will read this key, while `usedBy` is empty */
  plannedFor?: string;
  changeable: ParameterChangeable;
};

/** The record on the wire: the definition plus the value the server holds. */
export type Parameter = ParameterDef & {
  value: number | boolean;
  /** the last proposal Josh answered with Never — kept so the EA can read
   * its own refusal rather than proposing the same change every Monday */
  refused?: { value: number | boolean; at: string };
};
export type ParameterList = Parameter[];
export type ParameterValueBody = { value: number | boolean; offlineId?: string };
export type ParameterProposeBody = { key: string; value: number | boolean; reason: string };
/** the card body (`ActionItem.parameter`) */
export type ParameterProposal = { key: string; label: string; current: number | boolean; proposed: number | boolean; reason: string };

export type Shapes = {
  ActionBillLine: ActionBillLine;
  ActionDraftBody: ActionDraftBody;
  ActionHistoryEntry: ActionHistoryEntry;
  ActionItem: ActionItem;
  ActionKind: ActionKind;
  ActionList: ActionList;
  ActionOption: ActionOption;
  ActionReceipt: ActionReceipt;
  ActionSource: ActionSource;
  ActionState: ActionState;
  ActionVerb: ActionVerb;
  AgentCapRow: AgentCapRow;
  AgentCapsBody: AgentCapsBody;
  AgentIssue: AgentIssue;
  AgentIssueActionBody: AgentIssueActionBody;
  AgentIssueList: AgentIssueList;
  AgentRun: AgentRun;
  AgentRunList: AgentRunList;
  AgentSummary: AgentSummary;
  AppLayout: AppLayout;
  AppLayoutPatch: AppLayoutPatch;
  Attachment: Attachment;
  AutonomyRule: AutonomyRule;
  AutonomyRuleList: AutonomyRuleList;
  ActionRule: ActionRule;
  AutonomyProposeBody: AutonomyProposeBody;
  AttachmentKind: AttachmentKind;
  AttachmentList: AttachmentList;
  AuthNonce: AuthNonce;
  AuthToken: AuthToken;
  AutonomyLevel: AutonomyLevel;
  AutonomySettings: AutonomySettings;
  Block: Block;
  BlockBar: BlockBar;
  BlockChip: BlockChip;
  BlockLine: BlockLine;
  BlockLink: BlockLink;
  BlockRow: BlockRow;
  BlockStat: BlockStat;
  BlockTile: BlockTile;
  BlockVerb: BlockVerb;
  BlockVerbAction: BlockVerbAction;
  BrainDumpBody: BrainDumpBody;
  BrainItem: BrainItem;
  BrainItemList: BrainItemList;
  BrainItemPatch: BrainItemPatch;
  BrainItemVersion: BrainItemVersion;
  BrainItemVersionList: BrainItemVersionList;
  BrainSearchResult: BrainSearchResult;
  BrainSource: BrainSource;
  CalendarProposeBody: CalendarProposeBody;
  CalendarProposeResult: CalendarProposeResult;
  CalendarSource: CalendarSource;
  CalendarView: CalendarView;
  CalendarWindow: CalendarWindow;
  CalEvent: CalEvent;
  CalEventPatch: CalEventPatch;
  Capabilities: Capabilities;
  ChatBody: ChatBody;
  ChatReply: ChatReply;
  ChatThread: ChatThread;
  ChatTurn: ChatTurn;
  Composite: Composite;
  Delta: Delta;
  DelegateBody: DelegateBody;
  Device: Device;
  DeviceRegistration: DeviceRegistration;
  DumpResult: DumpResult;
  ExportJob: ExportJob;
  FeedEvent: FeedEvent;
  FeedEventList: FeedEventList;
  FindAnswer: FindAnswer;
  FindResult: FindResult;
  Focus: Focus;
  FocusList: FocusList;
  FocusesBody: FocusesBody;
  FreeGap: FreeGap;
  Goal: Goal;
  GoalHistoryEntry: GoalHistoryEntry;
  GoalKpi: GoalKpi;
  GoalList: GoalList;
  GoalStatus: GoalStatus;
  GoalsBody: GoalsBody;
  GoalComposite: GoalComposite;
  Habit: Habit;
  HabitList: HabitList;
  HabitsBody: HabitsBody;
  HabitLog: HabitLog;
  HabitLogBody: HabitLogBody;
  HabitPeriod: HabitPeriod;
  HabitStatRow: HabitStatRow;
  HabitStats: HabitStats;
  HealthComposite: HealthComposite;
  HighRiskBody: HighRiskBody;
  Insight: Insight;
  InsightActionBody: InsightActionBody;
  JournalBody: JournalBody;
  LabelAuditRow: LabelAuditRow;
  LabelAuditRowList: LabelAuditRowList;
  LabelledMeta: LabelledMeta;
  LabelsBody: LabelsBody;
  LabelsScheme: LabelsScheme;
  Layout: Layout;
  LayoutEaBody: LayoutEaBody;
  LayoutPatch: LayoutPatch;
  LearningItem: LearningItem;
  LearningList: LearningList;
  LifeComposite: LifeComposite;
  LifeSectionConfig: LifeSectionConfig;
  LifeSectionConfigPatch: LifeSectionConfigPatch;
  LockResult: LockResult;
  MemoryHitRate: MemoryHitRate;
  MemoryProposal: MemoryProposal;
  MemoryProposalBody: MemoryProposalBody;
  CaptureRouting: CaptureRouting;
  ShareIn: ShareIn;
  TriageProposal: TriageProposal;
  Sensitivity: Sensitivity;
  MemoryHistoryEntry: MemoryHistoryEntry;
  Reply: Reply;
  ReplyList: ReplyList;
  SearchKind: SearchKind;
  SearchMatch: SearchMatch;
  SearchRef: SearchRef;
  SearchResult: SearchResult;
  SearchGroup: SearchGroup;
  SearchResponse: SearchResponse;
  ReplyPatch: ReplyPatch;
  MemoryHistoryList: MemoryHistoryList;
  MemoryProposalList: MemoryProposalList;
  MoneyComposite: MoneyComposite;
  MoneyDue: MoneyDue;
  MoneyRow: MoneyRow;
  MonthDotSummary: MonthDotSummary;
  NoContent: NoContent;
  NotificationDevices: NotificationDevices;
  NotificationDevicesBody: NotificationDevicesBody;
  NotificationGroup: NotificationGroup;
  NotificationGroupList: NotificationGroupList;
  NudgeResult: NudgeResult;
  OutboxEntry: OutboxEntry;
  Parameter: Parameter;
  ParameterChangeable: ParameterChangeable;
  ParameterDef: ParameterDef;
  ParameterKey: ParameterKey;
  ParameterList: ParameterList;
  ParameterProposal: ParameterProposal;
  ParameterProposeBody: ParameterProposeBody;
  ParameterUnit: ParameterUnit;
  ParameterValueBody: ParameterValueBody;
  Person: Person;
  PersonActBody: PersonActBody;
  PersonList: PersonList;
  PersonVerb: PersonVerb;
  Portal: Portal;
  PortalList: PortalList;
  PostActionBody: PostActionBody;
  PostActionResult: PostActionResult;
  PushSubscribeBody: PushSubscribeBody;
  QuietHours: QuietHours;
  RecoverBody: RecoverBody;
  RecoverResult: RecoverResult;
  RegisterDeviceBody: RegisterDeviceBody;
  ReviewComposite: ReviewComposite;
  Rule: Rule;
  RuleCreateBody: RuleCreateBody;
  RuleList: RuleList;
  RuleUpdateBody: RuleUpdateBody;
  Schedule: Schedule;
  ScheduleList: ScheduleList;
  SectionCatalogue: SectionCatalogue;
  SectionCatalogueBlock: SectionCatalogueBlock;
  SectionConfig: SectionConfig;
  SectionConfigPatch: SectionConfigPatch;
  SectionInvalid: SectionInvalid;
  SectionList: SectionList;
  SectionProposeBody: SectionProposeBody;
  SectionState: SectionState;
  SectionVerbAction: SectionVerbAction;
  SecurityCheck: SecurityCheck;
  SecurityCheckList: SecurityCheckList;
  ServerEvent: ServerEvent;
  Session: Session;
  SessionUser: SessionUser;
  Spend: Spend;
  SubtaskBody: SubtaskBody;
  SyncStatus: SyncStatus;
  AgentRoster: AgentRoster;
  AgentRosterEntry: AgentRosterEntry;
  SubtaskPatch: SubtaskPatch;
  Work: Work;
  WorkState: WorkState;
  Column: Column;
  ColumnList: ColumnList;
  CompleteBody: CompleteBody;
  Subtask: Subtask;
  Task: Task;
  TaskCreateBody: TaskCreateBody;
  TaskDelegationState: TaskDelegationState;
  TaskList: TaskList;
  TaskOwner: TaskOwner;
  TaskPatch: TaskPatch;
  TaskReport: TaskReport;
  TaskReportBody: TaskReportBody;
  Slicer: Slicer;
  SlicerList: SlicerList;
  SlicerPredicate: SlicerPredicate;
  TaskSlice: TaskSlice;
  TaskStatus: TaskStatus;
  TaskView: TaskView;
  TodayComposite: TodayComposite;
  UndoResult: UndoResult;
  Usage: Usage;
  UsageList: UsageList;
  UsageSummary: UsageSummary;
  UsageTotal: UsageTotal;
  VoiceSettings: VoiceSettings;
  WaitingList: WaitingList;
  WaitingRow: WaitingRow;
  WebauthnBody: WebauthnBody;
  WebauthnCredential: WebauthnCredential;
  WebauthnOptions: WebauthnOptions;
  WebauthnResult: WebauthnResult;
  WebauthnStep: WebauthnStep;
};

/** One shape name, checked at compile time. */
export type ShapeName = keyof Shapes;
