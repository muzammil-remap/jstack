/**
 * The configuration routes, answered on the device while n8n has no store for them (ADR-76):
 * who is signed in, what this build can do, the layouts, focuses, parameters and section configs.
 *
 * Configuration only. Where the mock's fixtures hold the app's own vocabulary — the four focuses,
 * the five tab layouts, the board's columns, the slicers, who can take a task — it is copied here
 * with its source named, because `data/n8n/` may not import `data/mock/` (CT-03). What the fixtures
 * hold that reads as Josh's own life is left out: EA rules, notification meta, budgets, a health
 * appointment, the EA's reasons for a section. Those arrive from `records` when it is wired
 * (Phase 6), or stay empty.
 */
import { Platform } from "react-native";
import { SILO_META, TYPE_META } from "@/data/labels";
import { defaultParameters } from "@/data/parameters";
import { TWENTY_APP_URL } from "@/data/config";
import { now } from "@/lib/time";
import type { AgentRoster, AppLayout, AutonomySettings, Capabilities, Column, Device, Layout, LifeSectionConfig, Portal, QuietHours, SectionConfig, Session, Slicer, SyncStatus, VoiceSettings } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import type { Asked } from "./registry";
import { FOCUSES, OWNER_SILOS } from "./focus";

const ok = (json: unknown): TransportResponse => ({ status: 200, json });
const notFound = (): TransportResponse => ({ status: 404, json: { reason: "not found" } });

/** The instant these defaults stand for. Not an edit anybody made: a record that has never been
 * saved still needs a `changedAt`, and one fixed value says so more plainly than today's date. */
const DEFAULTS_AT = "2026-09-29T00:00:00.000Z";

function thisDevice(): Device {
  return { id: "this-device", name: "This device", lastSeen: now().toISOString(), current: true };
}

/** `data/mock/fixtures/layouts.json` — each tab's sections in their designed order, none hidden. */
const LAYOUT_ORDER: Record<string, string[]> = {
  today: ["needs", "insights", "allcal", "calendar", "tasks", "glance", "close"],
  tasks: ["views", "waiting"],
  brain: ["entry", "latest", "memory", "rules"],
  life: ["goals", "habits", "people", "money", "health", "learning"],
  agents: ["stats", "portals", "history", "needseyes", "feed", "checks", "lock"],
};

/** `data/mock/fixtures/columns.json` — the board's five columns over four statuses (ADR-45). */
const COLUMNS: Column[] = [
  { id: "col-now", name: "Now", statuses: ["open"], order: 1, source: "twenty" },
  { id: "col-next", name: "Next", statuses: ["open"], order: 2, source: "twenty" },
  { id: "col-in-progress", name: "In progress", statuses: ["in_progress"], order: 3, source: "twenty" },
  { id: "col-waiting", name: "Waiting", statuses: ["waiting"], order: 4, source: "twenty" },
  { id: "col-done", name: "Done", statuses: ["done"], order: 5, source: "twenty" },
];

/** `data/mock/fixtures/slicers.json` — the seeded slicers (ADR-44). */
const SLICERS: Slicer[] = [
  { id: "week", name: "This week", predicate: { kind: "dueWithin", days: 7 }, fixed: true },
  { id: "waiting", name: "Waiting", predicate: { kind: "status", status: "waiting" } },
  { id: "delegated", name: "Delegated", predicate: { kind: "delegated" }, fixed: true },
  { id: "agent", name: "Agent", predicate: { kind: "owner", owner: "ea" } },
  { id: "recurring", name: "Recurring", predicate: { kind: "repeat" } },
];

/** `data/mock/fixtures/agents.json` `roster` — who a task can be handed to. */
const ROSTER: AgentRoster = [
  { id: "ea", name: "EA", short: "EA", canTakeTasks: true },
  { id: "dev", name: "Dev", short: "DV", canTakeTasks: true },
  { id: "josh", name: "Josh", short: "JO", canTakeTasks: false },
  { id: "joce", name: "Joce", short: "JM", canTakeTasks: false },
];

/**
 * The configured sections (`data/mock/fixtures/sections.json`, B-2): People, Money, Learning and
 * Health on Life, Usage on Agents, Replies and Files on Brain are RECORDS, and an empty list would
 * take the sections off their tabs rather than show them empty. The structure is copied; the EA's
 * `reason` for each is not (it describes the fixtures' people and budgets), and Health's ghost
 * keeps the sentence about the feature and drops the fixture's appointment.
 */
const SECTIONS: SectionConfig[] = [
  { id: "people", tab: "life", title: "People", column: 2, configure: true, source: { endpoint: "/people" }, blocks: [{ type: "rows", idPrefix: "person", bind: "people.rows" }], version: 1, state: "active", managedBy: "ea", changedAt: DEFAULTS_AT },
  {
    id: "money", tab: "life", title: "Money", column: 2, configure: true, source: { endpoint: "/money" },
    blocks: [{ type: "bars", idPrefix: "money", bind: "money.bars" }, { type: "text", idPrefix: "money-due", bind: "money.due" }],
    version: 1, state: "active", managedBy: "ea", changedAt: DEFAULTS_AT,
  },
  {
    id: "learning", tab: "life", title: "Learning", column: 3, configure: true, badge: "count", source: { endpoint: "/learning" },
    blocks: [{ type: "rows", idPrefix: "learning", bind: "learning.rows" }], version: 1, state: "active", managedBy: "ea", changedAt: DEFAULTS_AT,
    verb: { label: "all", action: "open-learning-archive" },
  },
  {
    id: "usage", tab: "agents", title: "Usage", hint: "This month", column: 1, verb: { label: "Copy as CSV", action: "copy-csv" }, source: { endpoint: "/usage" },
    blocks: [{ type: "stats", idPrefix: "usage-total", bind: "usage.totals" }, { type: "rows", idPrefix: "usage-task", bind: "usage.tasks" }],
    version: 1, state: "active", managedBy: "ea", changedAt: DEFAULTS_AT,
  },
  {
    id: "health", tab: "life", title: "Health", column: 3, configure: true, feed: "healthFeed", source: { endpoint: "/health" },
    blocks: [{ type: "ghost", idPrefix: "health", text: "Appointments, results, scripts and a brief before a visit appear when the health source is gated in." }],
    version: 1, state: "active", managedBy: "ea", changedAt: DEFAULTS_AT,
  },
  {
    id: "replies", tab: "brain", title: "Replies", column: 2, configure: true, badge: "count", source: { endpoint: "/brain/replies" },
    blocks: [{ type: "rows", idPrefix: "reply", bind: "brain.replies" }], version: 1, state: "active", managedBy: "ea", changedAt: DEFAULTS_AT,
  },
  {
    id: "files", tab: "brain", title: "Files", column: 3, badge: "count", configure: true, source: { endpoint: "/files" },
    blocks: [{ type: "rows", idPrefix: "file", bind: "files.recent" }], version: 1, state: "active", managedBy: "ea", changedAt: DEFAULTS_AT,
    verb: { label: "all", action: "open-files-archive" },
  },
];

/** The places Josh works, and only real addresses: Twenty only when its URL is configured. The
 * `purpose` words are the mock portals' (`data/mock/fixtures/agents.json`). */
function portals(): Portal[] {
  return [
    ...(TWENTY_APP_URL !== "" ? [{ name: "Twenty", purpose: "tasks", url: TWENTY_APP_URL }] : []),
    { name: "Gmail", purpose: "send", url: "https://mail.google.com" },
    { name: "Calendar", purpose: "google", url: "https://calendar.google.com" },
    { name: "Dropbox", purpose: "files", url: "https://www.dropbox.com/home" },
  ];
}

/** What this build really does on n8n. `speech` is the device's own answer, decided the way
 * `data/capabilities.ts` `localCapabilitiesFallback` decides it; `calendarViews` is on by design
 * (`design/DISCREPANCIES.md`). Everything else is off until its route is wired. */
function capabilities(): Capabilities {
  const speech = Platform.OS === "web" && typeof globalThis !== "undefined" && "speechSynthesis" in globalThis;
  return { liveRouting: false, liveVoice: false, speech, fileStore: false, calendarWrite: true, moneyFeed: false, healthFeed: false, export: false, calendarViews: true };
}

/** ADR-79: Settings › Autonomy's six categories (`data/mock/fixtures/settings.json`), every one at
 * `ask` — nothing automatic until Josh changes it. */
const AUTONOMY: AutonomySettings = {
  "Email drafts": "ask",
  "Calendar proposals": "ask",
  "Filing captures": "ask",
  "Task changes by EA": "ask",
  Bills: "ask",
  "Memory writes": "ask",
};

/** ADR-79: 23:00–07:00, the window `JSTACK-SEND-OR-QUEUE` holds Telegram messages in today (it reads
 * the hour in Australia/Brisbane), so the app and Telegram agree. The Security exception and the
 * Needs-you schedule are the mock's. Once `records` is wired, Josh's saved value replaces this. */
const QUIET_HOURS: QuietHours = {
  start: "23:00",
  end: "07:00",
  exceptions: ["Security"],
  needsYou: { windows: [{ start: "08:00", end: "09:00" }, { start: "16:00", end: "17:00" }], respectsQuietHours: true, paused: true },
};

/** The documented defaults (ADR-24, TS-02, TS-03, ST-06): brief replies, read aloud, no turn
 * timer, no car mode, no morning read time chosen. The end phrases are the fixture's. */
const VOICE: VoiceSettings = {
  style: "warm",
  speed: 1,
  brevity: "brief",
  readAloud: true,
  readBriefAt: null,
  cueWord: "over",
  endPhrases: ["that's all", "thanks, that's it", "goodbye", "we're done"],
  silenceTurnSeconds: null,
  carMode: false,
};

const APP_LAYOUT: AppLayout = { hiddenTabs: [], showFocusRow: true };

function randomToken(): string {
  return Math.random().toString(36).slice(2, 12);
}

/** A default section by id, for the records adapter's overrides (`data/n8n/adapters/records.ts`). */
export const defaultSection = (id: string): SectionConfig | null => SECTIONS.find((s) => s.id === id) ?? null;

export const DEFAULTS = {
  /** Nothing verifies it: every high-risk write it would authorise answers 501 on n8n. */
  getAuthNonce: (): TransportResponse => ok({ nonce: `n8n-${randomToken()}`, expiresAt: new Date(now().getTime() + 60_000).toISOString() }),
  getSession: (): TransportResponse => {
    const device = thisDevice();
    const session: Session = { user: { id: "josh", name: "Josh", role: "owner" }, silos: OWNER_SILOS, device, devices: [device], tokenTtlSeconds: 900 };
    return ok(session);
  },
  getColumns: (): TransportResponse => ok(COLUMNS),
  getSlicers: (): TransportResponse => ok(SLICERS),
  /** No categories or thresholds chosen yet — the fixture's are Josh's budgets. */
  getLifeSectionConfig: ({ params }: Asked): TransportResponse => {
    const config: LifeSectionConfig = { id: params[0], managedByEa: false };
    return ok(config);
  },
  getAgents: (): TransportResponse => ok(ROSTER),
  getPortals: (): TransportResponse => ok(portals()),
  getQuietHours: (): TransportResponse => ok(QUIET_HOURS),
  getAutonomy: (): TransportResponse => ok(AUTONOMY),
  getVoiceSettings: (): TransportResponse => ok(VOICE),
  getFocuses: (): TransportResponse => ok(FOCUSES),
  getAppLayout: (): TransportResponse => ok(APP_LAYOUT),
  getLayout: ({ params }: Asked): TransportResponse => {
    const order = LAYOUT_ORDER[params[0]];
    if (order == null) return notFound();
    const layout: Layout = { tab: params[0], order, hidden: [], managedBy: "josh", changedAt: DEFAULTS_AT };
    return ok(layout);
  },
  getParameters: (): TransportResponse => ok(defaultParameters()),
  /** The queue is the device's (`data/transport/outbox.ts`); no server holds one on n8n. */
  getSyncStatus: (): TransportResponse => {
    const status: SyncStatus = { queued: 0, conflicts: [] };
    return ok(status);
  },
  getCapabilities: (): TransportResponse => ok(capabilities()),
  getLabelsScheme: (): TransportResponse => ok({ silos: SILO_META, types: TYPE_META }),
  getSections: ({ req }: Asked): TransportResponse => {
    const tab = req.query?.tab;
    return ok(SECTIONS.filter((s) => s.state === "active" && (tab == null || tab === "" || s.tab === tab)));
  },
  getSection: ({ params }: Asked): TransportResponse => {
    const found = SECTIONS.find((s) => s.id === params[0]);
    return found != null ? ok(found) : notFound();
  },
};
