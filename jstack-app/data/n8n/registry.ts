/**
 * The n8n dispatcher's route table (ADR-76): which of the app's routes are answered by a webhook,
 * which are assembled from other routes, which are configuration, and which are honestly empty.
 *
 * One row per GET in `data/routes.ts` — `tests/unit/n8nRoutes.test.ts` walks the route table and
 * fails on a GET with no row here, so a route added later cannot fall through to "not found".
 *
 * The webhook KEYS are the proxy's allow-list as the app sees it. The browser only ever sends one
 * of these short names; the proxy maps it to the n8n path and adds the header. The same list lives
 * in `remap/dev-proxy.mjs` (`ALLOW`) and in the nginx config (`remap/DEPLOY_N8N.md`), and
 * `tests/unit/n8nAllowList.test.ts` holds this copy and the dev proxy's to one set. Adding a key is
 * a change in all three places, never here alone.
 */
import type { DataProvider } from "@/data/DataProvider";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";
import { DEFAULTS } from "./defaults";
import { calendarAdapter } from "./adapters/calendar";

/** `remap/WEBHOOKS.md` §C. Nothing that sends, pays, books, revokes or returns file bytes is here. */
export const WEBHOOK_KEYS = ["calendar", "tasks", "people", "files", "memory", "tasks-write", "calendar-edit", "gmail-draft", "records", "actions"] as const;

export type WebhookKey = (typeof WEBHOOK_KEYS)[number];

/** A route's request, with its `{param}` segments already pulled out of the path. */
export type Asked = { req: TransportRequest; params: string[] };

/** Turns one webhook's reply into the route's contract shape. Raw n8n JSON goes in; only the
 * contract's shape (or a contract error status) comes out, so nothing raw can reach a store. */
export type WebhookAdapter = {
  body: (asked: Asked) => Record<string, unknown>;
  toContract: (data: unknown, asked: Asked) => TransportResponse;
};

type ReadRow =
  /** A webhook answers it. Until its adapter exists (Phase 3/4 of `remap/N8N-INTEGRATION-PROMPT.md`)
   * the row is a stub and the route answers its contract-valid empty value, never a call. */
  | { kind: "wired"; key: WebhookKey; adapter?: WebhookAdapter }
  /** Assembled from the webhooks it names, sharing one in-flight call per webhook. Until every one
   * of them is live the route answers empty. */
  | { kind: "derived"; uses: readonly WebhookKey[] }
  /** App configuration — the same answer for every caller, and nothing in Josh's voice. */
  | { kind: "default"; answer: (asked: Asked) => TransportResponse }
  /** No source yet: the contract's empty value for the route's response shape (`data/n8n/empty.ts`). */
  | { kind: "empty" }
  /** No source yet, AND the empty value would be a claim — "$0 spent", "0 tokens", "all healthy" is
   * a statement about activity, not the absence of one. Answers `501 { reason: "not connected yet" }`,
   * which the store records as that section's load error (ADR-78). A local answer, so it says nothing
   * about the connection. */
  | { kind: "unavailable" };

type RouteName = keyof DataProvider;

const EMPTY: ReadRow = { kind: "empty" };
const UNAVAILABLE: ReadRow = { kind: "unavailable" };
const deflt = (name: keyof typeof DEFAULTS): ReadRow => ({ kind: "default", answer: DEFAULTS[name] });

/** `remap/WEBHOOKS.md` §B and §D, route by route, in `data/routes.ts` order. */
export const READS: Partial<Record<RouteName, ReadRow>> = {
  // §4.1 session
  getAuthNonce: deflt("getAuthNonce"),
  getSession: deflt("getSession"),
  // §4.2 today
  getToday: { kind: "derived", uses: ["calendar", "tasks"] },
  getReview: EMPTY,
  // §4.3 decisions — the Needs-you store arrives with the `actions` key (Phase 6)
  getActions: EMPTY,
  getAction: EMPTY,
  // §4.4 calendar
  getCalendar: { kind: "wired", key: "calendar", adapter: calendarAdapter },
  getEvent: EMPTY,
  // §4.5 tasks
  getTasksWaiting: { kind: "derived", uses: ["tasks"] },
  getColumns: deflt("getColumns"),
  getTasks: { kind: "wired", key: "tasks" },
  getTask: { kind: "derived", uses: ["tasks"] },
  getSlicers: deflt("getSlicers"),
  getTaskUsage: EMPTY,
  getTaskFiles: EMPTY,
  // §4.6 brain
  getBrainLatest: EMPTY,
  getBrainItemVersions: EMPTY,
  getBrainItem: EMPTY,
  getBrainSearch: EMPTY,
  getSearch: EMPTY,
  getMemoryHistory: EMPTY,
  getReplies: EMPTY,
  getChatThread: EMPTY,
  getMemoryProposals: EMPTY,
  getMemoryHitRate: EMPTY,
  // §4.7 life
  getLife: { kind: "derived", uses: ["people"] },
  getGoals: EMPTY,
  getGoalsHistory: EMPTY,
  getGoal: EMPTY,
  getHabits: EMPTY,
  getHabitStats: EMPTY,
  getPeople: EMPTY,
  getMoney: EMPTY,
  getHealth: EMPTY,
  getLearning: EMPTY,
  getLearningItem: EMPTY,
  getLifeSectionConfig: deflt("getLifeSectionConfig"),
  // §4.8 agents
  getAgents: deflt("getAgents"),
  getAgentSummary: EMPTY,
  getAgentSpend: EMPTY,
  getPortals: deflt("getPortals"),
  getAgentIssues: EMPTY,
  getAgentIssue: EMPTY,
  getAgentFeed: EMPTY,
  getSecurityChecks: EMPTY,
  getAgentRuns: EMPTY,
  // ADR-78: its section (a config record) survives a failed load and shows nothing, where the empty
  // value printed "$0 this month · 0 tokens". The Agents store's other reads stay empty for now: they
  // load in one Promise.all, and a failure there replaces the whole tab (Checkpoint 2's question).
  getUsage: UNAVAILABLE,
  // §4.17 files
  getFiles: EMPTY,
  getFile: EMPTY,
  // §4.9 settings
  getNotificationGroups: EMPTY,
  getQuietHours: deflt("getQuietHours"),
  getSchedules: EMPTY,
  getAutonomy: deflt("getAutonomy"),
  getAutonomyRules: EMPTY,
  getVoiceSettings: deflt("getVoiceSettings"),
  getFocuses: deflt("getFocuses"),
  getAppLayout: deflt("getAppLayout"),
  getLayout: deflt("getLayout"),
  getParameters: deflt("getParameters"),
  getSyncStatus: deflt("getSyncStatus"),
  getCapabilities: deflt("getCapabilities"),
  getLabelsScheme: deflt("getLabelsScheme"),
  getLabelAudit: EMPTY,
  // §4.10 sections
  getSectionCatalogue: EMPTY,
  getSections: deflt("getSections"),
  getSection: deflt("getSection"),
};

/**
 * The writes that have a key, by route. Empty until each write's workflow is wired, one at a time
 * (`remap/WORKFLOWS-NEEDED.md`); every write not named here answers `501 { reason: "not connected
 * yet" }` without calling anything.
 */
export const WRITES: Partial<Record<RouteName, { key: WebhookKey; adapter: WebhookAdapter }>> = {};
