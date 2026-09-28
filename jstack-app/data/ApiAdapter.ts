/**
 * ApiAdapter — the only DataProvider implementation (ADR-02). Builds every
 * request and parses every response against CONTRACT_v2.md §4; every
 * method's trailing comment carries the exact `TODO(BACKEND: §4.n)`
 * endpoint it calls, so `tools/gen-backend-grep.mjs` can list them all for
 * the developer. S-1 (ADR-33, SM-02): every method is a true one-liner —
 * `req()` reads its HTTP verb and path template from `data/routes.ts`, the
 * one table shared with the mock server, `gen-backend-grep` and (Q1)
 * `gen-wiring` — so a path is never hand-typed a second time here. Two
 * transports carry the same interface (data/transport/{http,mock}.ts):
 * `httpTransport` (the one the developer keeps) and `mockTransport` (routes
 * into data/mock/server.ts). No send/pay/book/revoke verb exists on this
 * surface (SEC-15).
 */
import type { DataProvider, HighRiskOpts, LabelNoun, TaskFilterQuery } from "./DataProvider";
import type { MultipartFile, Transport, TransportRequest } from "./transport/Transport";
import type { Silo, LabelType } from "./labels";
import { assertUnlocked } from "@/lib/lockGate";
import { buildPath, CALL_ROUTES as ROUTES_CALL_ROUTES, routeByName } from "./routes";
import type {
  ActionItem,
  AgentIssue,
  ChatThread,
  MemoryHistoryEntry,
  Reply,
  SearchResponse,
  AgentRun,
  AgentSummary,
  AppLayout,
  AutonomySettings,
  BrainItem,
  BrainItemVersion,
  CalEvent,
  CalendarView,
  Capabilities,
  Device,
  DumpResult,
  FeedEvent,
  FindAnswer,
  FindResult,
  Focus,
  FreeGap,
  Goal,
  GoalComposite,
  Habit,
  HabitLog,
  HabitStats,
  Insight,
  LabelAuditRow,
  Layout,
  LearningItem,
  LifeSectionConfig,
  SectionCatalogue,
  SectionConfig,
  MemoryHitRate,
  MemoryProposal,
  MoneyDue,
  MoneyRow,
  AgentRoster,
  NotificationGroup,
  Parameter,
  SubtaskBody,
  SubtaskPatch,
  Person,
  Portal,
  PostActionBody,
  PostActionResult,
  PushSubscribeBody,
  QuietHours,
  ReviewComposite,
  Schedule,
  SecurityCheck,
  Session,
  Spend,
  Column,
  Slicer,
  SyncStatus,
  Task,
  TaskOwner,
  TaskReport,
  TodayComposite,
  UsageSummary,
  Attachment,
  AutonomyRule,
  AutonomyRuleList,
  BrainDumpBody,
  AttachmentList,
  VoiceSettings,
  WebauthnBody,
  WebauthnResult,
  WebauthnStep,
} from "./types";

/** Thrown by `request()` on any non-2xx response; carries the contract's
 * own error shape (§4 preamble: 401/403/409/422/423). */
export class ContractError extends Error {
  status: number;
  reason?: string;
  field?: string;
  constructor(status: number, body: unknown) {
    const b = (body ?? {}) as { reason?: string; field?: string };
    super(`contract error ${status}${b.reason ? `: ${b.reason}` : ""}`);
    this.status = status;
    this.reason = b.reason;
    this.field = b.field;
  }
}

/** Every call this adapter makes, keyed by DataProvider method name — read
 * by the test hook's `calls()` in BOTH mock mode and the BS-05 swap. */
export const apiCalls: { method: keyof DataProvider; args: unknown[] }[] = [];

/** Re-exported from `data/routes.ts` (S-1): HTTP verb + path → the
 * DataProvider method name. A route with an invented name is caught by
 * `RouteEntry`'s own `name: keyof DataProvider` field type; a
 * `DataProvider` method with no row is caught by `routes.ts`'s
 * `NamesCovered` compile-time check (both are `pnpm check` errors — kept
 * from v1.2's idea, AX-01 taught this the hard way). */
export const CALL_ROUTES = ROUTES_CALL_ROUTES;

/**
 * SEC-15's runtime guard (AUDIT_v2.md A-03): "No adapter method, route
 * pattern, handler or fixture verb named send, pay, book or revoke; **the
 * runtime guard throws on such a path**." `request()` is the single choke
 * point every method goes through, so the guard sits there and throws
 * BEFORE the transport is called — a last line, not the first (the brief's
 * "Security by design" means no such affordance exists in the UI at all,
 * and the greps in tests/unit/contract.test.ts keep the source clean).
 * `/devices/{id}/revoke` is the one sanctioned use of the word: device
 * revocation is a security CONTROL (LK-06, SE-08, CONTRACT_v2.md §6), not
 * "revoke a decision".
 */
const FORBIDDEN_VERBS = ["send", "pay", "book", "revoke"] as const;
const SANCTIONED_PATH = /^\/devices\/[^/]+\/revoke$/;

/** A path is a list of segments, so the check is "is any SEGMENT one of these
 * words" - not a substring match, which would refuse a perfectly innocent
 * `/notebooks`, and not a word-boundary regex, which says the same less plainly. */
export function assertAllowedPath(httpMethod: string, path: string): void {
  if (SANCTIONED_PATH.test(path)) return;
  const segments = path.split("?")[0].split("/").map((seg) => seg.toLowerCase());
  const hit = FORBIDDEN_VERBS.find((v) => segments.includes(v));
  if (hit != null) {
    throw new Error(
      `SEC-15: refused ${httpMethod} ${path} — "${hit}" is a forbidden verb. ` +
        `JSTACK never sends, pays, books or revokes on the owner's behalf; only /devices/{id}/revoke is sanctioned.`,
    );
  }
}

export class ApiAdapter implements DataProvider {
  constructor(private transport: Transport) {}

  private async request<T>(
    method: keyof DataProvider,
    httpMethod: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    opts?: { query?: Record<string, string | undefined>; body?: unknown; multipart?: TransportRequest["multipart"] },
  ): Promise<T> {
    assertAllowedPath(httpMethod, path); // SEC-15, before anything leaves
    // CD-14 / H-1(d2): a locked session writes nothing. Here rather than in
    // each store action, because a rule forty callers have to remember is a
    // rule that will be missed in one of them — and the one that matters is
    // whichever a synthetic click reaches first.
    assertUnlocked(httpMethod, path);
    // X-1: an upload logs its FILENAME, never its bytes. `__JSTACK__.calls()`
    // is read by tests and by the rig, and a megabyte of base64 in that log is
    // both useless to read and a copy of the file in a second place.
    apiCalls.push({ method, args: [path, opts?.multipart != null ? { file: opts.multipart.file.filename, ...opts.multipart.fields } : (opts?.body ?? opts?.query)].filter((a) => a !== undefined) });
    const res = await this.transport({ method: httpMethod, path, query: opts?.query, body: opts?.body, multipart: opts?.multipart });
    if (res.status >= 400) throw new ContractError(res.status, res.json);
    return res.json as T;
  }

  /** S-1: every method below is one call to this — verb and path template
   * come from `data/routes.ts` by name, `params` fill the template's
   * `{...}` segments in call order. */
  private req<T>(name: keyof DataProvider, params: readonly string[] = [], opts?: { query?: Record<string, string | undefined>; body?: unknown; multipart?: TransportRequest["multipart"] }): Promise<T> {
    const route = routeByName(name);
    return this.request<T>(name, route.method, buildPath(route.path, params), opts);
  }

  // ── §4.1 Session, devices, lock ──────────────────────────────────────
  getAuthNonce() { return this.req<{ nonce: string; expiresAt: string }>("getAuthNonce"); } // TODO(BACKEND: §4.1) GET /auth/nonce
  registerDevice(input: { name: string; publicKey: string }) { return this.req<{ deviceId: string; token: string }>("registerDevice", [], { body: input }); } // TODO(BACKEND: §4.1) POST /auth/register-device
  refreshAuth() { return this.req<{ token: string }>("refreshAuth"); } // TODO(BACKEND: §4.1) POST /auth/refresh
  webauthnCeremony(step: WebauthnStep, payload?: WebauthnBody) { return this.req<WebauthnResult>("webauthnCeremony", [step], { body: payload }); } // TODO(BACKEND: §4.1) POST /auth/webauthn/{step}
  getSession() { return this.req<Session>("getSession"); } // TODO(BACKEND: §4.1) GET /session
  revokeDevice(id: string, opts: HighRiskOpts) { return this.req<void>("revokeDevice", [id], { body: opts }); } // TODO(BACKEND: §4.1) POST /devices/{id}/revoke — high-risk
  postLock(opts: HighRiskOpts) { return this.req<{ locked: true; at: string }>("postLock", [], { body: opts }); } // TODO(BACKEND: §4.1) POST /lock — high-risk
  postRecover(input: { recoveryKey: string } & HighRiskOpts) { return this.req<{ restored: true; agentsResuming: string[] }>("postRecover", [], { body: input }); } // TODO(BACKEND: §4.1) POST /recover
  postPushSubscribe(input: PushSubscribeBody) { return this.req<void>("postPushSubscribe", [], { body: input }); } // TODO(BACKEND: §4.13) POST /push/subscribe
  deletePushSubscription(device: string) { return this.req<void>("deletePushSubscription", [device]); } // TODO(BACKEND: §4.13) DELETE /push/subscribe/{device}

  // ── §4.2 Today ────────────────────────────────────────────────────────
  getToday(focus?: string, since?: string) { return this.req<TodayComposite>("getToday", [], { query: { focus, since } }); } // TODO(BACKEND: §4.2) GET /today?focus=&since=
  getReview(anchor?: string) { return this.req<ReviewComposite>("getReview", [], { query: { anchor } }); } // TODO(BACKEND: §4.2) GET /review?anchor=
  postJournal(input: { text: string; source: "voice" | "typed" }) { return this.req<BrainItem>("postJournal", [], { body: input }); } // TODO(BACKEND: §4.2) POST /journal

  // ── §4.3 Decisions ────────────────────────────────────────────────────
  getActions(state: "open" | "history", opts?: { focus?: string; q?: string }) { return this.req<ActionItem[]>("getActions", [], { query: { state, ...opts } }); } // TODO(BACKEND: §4.3) GET /actions?state=&focus=&q=
  getAction(id: string) { return this.req<ActionItem>("getAction", [id]); } // TODO(BACKEND: §4.3) GET /actions/{id}
  postActionVerb(id: string, body: PostActionBody) { return this.req<PostActionResult>("postActionVerb", [id], { body }); } // TODO(BACKEND: §4.3) POST /actions/{id}
  postActionUndo(id: string) { return this.req<ActionItem>("postActionUndo", [id]); } // TODO(BACKEND: §4.3) POST /actions/{id}/undo — 409 after the 10s window
  postActionReopen(id: string) { return this.req<ActionItem>("postActionReopen", [id]); } // TODO(BACKEND: §4.3, A-31) POST /actions/{id}/reopen — not in CONTRACT_v2.md
  putActionDraft(id: string, draft: { subject?: string; body: string }) { return this.req<ActionItem>("putActionDraft", [id], { body: draft }); } // TODO(BACKEND: §4.3) PUT /actions/{id}/draft
  postInsightAction(id: string, action: "block" | "leave") { return this.req<Insight>("postInsightAction", [id], { body: { action } }); } // TODO(BACKEND: §4.3) POST /insights/{id}

  // ── §4.4 Calendar ─────────────────────────────────────────────────────
  getCalendar(view: CalendarView, anchor: string, focus?: string) { return this.req<{ events: CalEvent[]; gaps: FreeGap[] }>("getCalendar", [], { query: { view, anchor, focus } }); } // TODO(BACKEND: §4.4) GET /calendar?view=&anchor=&focus=
  getEvent(id: string) { return this.req<CalEvent>("getEvent", [id]); } // TODO(BACKEND: §4.4) GET /events/{id}
  patchEvent(id: string, patch: Partial<CalEvent>) { return this.req<CalEvent>("patchEvent", [id], { body: patch }); } // TODO(BACKEND: §4.4) PATCH /events/{id}
  deleteEvent(id: string) { return this.req<void>("deleteEvent", [id]); } // TODO(BACKEND: §4.4) DELETE /events/{id}
  postCalendarPropose(input: { gapStart: string; title: string; attendee?: string }) { return this.req<{ status: "drafted-not-sent" }>("postCalendarPropose", [], { body: input }); } // TODO(BACKEND: §4.4) POST /calendar/propose — never sends

  // ── §4.5 Tasks ────────────────────────────────────────────────────────
  getTasks(query: TaskFilterQuery, since?: string) { return this.req<Task[]>("getTasks", [], { query: { ...query, since } }); } // TODO(BACKEND: §4.5) GET /tasks?focus=&slice=&view=&q=&filters=&since=
  getTask(id: string) { return this.req<Task>("getTask", [id]); } // TODO(BACKEND: §4.5) GET /tasks/{id}
  postTask(input: Omit<Task, "id" | "activity" | "subtasks">) { return this.req<Task>("postTask", [], { body: input }); } // TODO(BACKEND: §4.5) POST /tasks
  patchTask(id: string, patch: Partial<Task>) { return this.req<Task>("patchTask", [id], { body: patch }); } // TODO(BACKEND: §4.5) PATCH /tasks/{id} — records an undo token
  putTask(id: string, full: Task) { return this.req<Task>("putTask", [id], { body: full }); } // TODO(BACKEND: §4.5) PUT /tasks/{id} — save-on-close, appends activity
  patchSubtask(taskId: string, subtaskId: string, patch: SubtaskPatch) { return this.req<Task>("patchSubtask", [taskId, subtaskId], { body: patch }); } // TODO(BACKEND: §4.15) PATCH /tasks/{id}/subtasks/{sid}
  deleteSubtask(taskId: string, subtaskId: string) { return this.req<Task>("deleteSubtask", [taskId, subtaskId]); } // TODO(BACKEND: §4.15) DELETE /tasks/{id}/subtasks/{sid} — a tombstone is kept for the undo window
  postSubtask(taskId: string, input: SubtaskBody) { return this.req<Task>("postSubtask", [taskId], { body: input }); } // TODO(BACKEND: §4.5) POST /tasks/{id}/subtasks
  postTaskDelegate(id: string, to?: TaskOwner, scope?: string) { return this.req<Task>("postTaskDelegate", [id], { body: { to, scope } }); } // TODO(BACKEND: §4.5) POST /tasks/{id}/delegate — sets owner, delegatedAt, delegated and work
  postTaskReport(id: string, verb: "accept" | "revise" | "teach", note?: string) { return this.req<TaskReport>("postTaskReport", [id], { body: { verb, note } }); } // TODO(BACKEND: §4.5) POST /tasks/{id}/report
  postTaskComplete(id: string, includeSubtasks: boolean) { return this.req<Task>("postTaskComplete", [id], { body: { includeSubtasks } }); } // TODO(BACKEND: §4.15) POST /tasks/{id}/complete — cascades to open subtasks when asked
  postTaskAccept(id: string) { return this.req<Task>("postTaskAccept", [id]); } // TODO(BACKEND: §4.5) POST /tasks/{id}/accept
  getTasksWaiting(focus?: string) { return this.req<{ who: string; what: string; days: number; note?: string; taskId: string }[]>("getTasksWaiting", [], { query: { focus } }); } // TODO(BACKEND: §4.5) GET /tasks/waiting?focus=
  getColumns() { return this.req<Column[]>("getColumns"); } // TODO(BACKEND: §4.15) GET /tasks/columns — Twenty's kanban field
  getSlicers() { return this.req<Slicer[]>("getSlicers"); } // TODO(BACKEND: §4.15) GET /slicers
  putSlicers(next: Slicer[]) { return this.req<Slicer[]>("putSlicers", [], { body: next }); } // TODO(BACKEND: §4.15) PUT /slicers — the whole set at once
  postTaskNudge(id: string) { return this.req<{ draftRef: string }>("postTaskNudge", [id]); } // TODO(BACKEND: §4.5) POST /tasks/{id}/nudge — never sends
  postUndo() { return this.req<{ undone: string | null }>("postUndo"); } // TODO(BACKEND: §4.5) POST /undo
  putLabels(noun: LabelNoun, id: string, labels: { silo: Silo; types: LabelType[] }, reason?: string) { return this.req<void>("putLabels", [noun, id], { body: { ...labels, reason } }); } // TODO(BACKEND: §4.5) PUT /{noun}/{id}/labels — v1.2 §12.1 kept

  // ── §4.6 Brain ────────────────────────────────────────────────────────
  postBrainDump(input: BrainDumpBody) { return this.req<DumpResult>("postBrainDump", [], { body: input }); } // TODO(BACKEND: §4.6) POST /brain/dump — idempotent on offlineId
  getBrainLatest(focus?: string, since?: string) { return this.req<BrainItem[]>("getBrainLatest", [], { query: { focus, since } }); } // TODO(BACKEND: §4.6) GET /brain/latest?focus=&since=
  putBrainItem(id: string, patch: Partial<BrainItem>) { return this.req<BrainItem>("putBrainItem", [id], { body: patch }); } // TODO(BACKEND: §4.6) PUT /brain/items/{id}
  getBrainItem(id: string) { return this.req<BrainItem>("getBrainItem", [id]); } // TODO(BACKEND: §4.18) GET /brain/items/{id}
  getBrainItemVersions(id: string) { return this.req<BrainItemVersion[]>("getBrainItemVersions", [id]); } // TODO(BACKEND: §4.6) GET /brain/items/{id}/versions
  getBrainSearch(q: string) { return this.req<{ answer: FindAnswer; results: FindResult[] }>("getBrainSearch", [], { query: { q } }); } // TODO(BACKEND: §4.6) GET /brain/search?q=
  getSearch(query: { q: string; focus?: string; sensitivity?: string }) { return this.req<SearchResponse>("getSearch", [], { query }); } // TODO(BACKEND: §4.19) GET /search?q=&focus=&sensitivity=
  getChatThread() { return this.req<ChatThread>("getChatThread", []); } // TODO(BACKEND: §4.18) GET /chat/thread
  postChat(text: string) { return this.req<{ reply: string; sources: string[] }>("postChat", [], { body: { text } }); } // TODO(BACKEND: §4.6) POST /chat
  getMemoryProposals(focus?: string) { return this.req<MemoryProposal[]>("getMemoryProposals", [], { query: { focus } }); } // TODO(BACKEND: §4.6) GET /memory/proposals?focus=
  getMemoryHistory() { return this.req<MemoryHistoryEntry[]>("getMemoryHistory"); } // TODO(BACKEND: §4.18) GET /memory/history
  getReplies() { return this.req<Reply[]>("getReplies"); } // TODO(BACKEND: §4.18) GET /brain/replies
  patchReply(id: string, read: boolean) { return this.req<Reply>("patchReply", [id], { body: { read } }); } // TODO(BACKEND: §4.18) PATCH /brain/replies/{id}
  postMemoryProposal(id: string, verb: "ok" | "edit", text?: string) { return this.req<MemoryProposal>("postMemoryProposal", [id], { body: { verb, text } }); } // TODO(BACKEND: §4.6) POST /memory/proposals/{id}
  undoMemoryProposal(id: string) { return this.req<MemoryProposal>("undoMemoryProposal", [id]); } // TODO(BACKEND: §4.6, A-26) POST /memory/proposals/{id}/undo — not in CONTRACT_v2.md; mirrors /actions/{id}/undo so BR-06's accept is undoable
  getMemoryHitRate() { return this.req<MemoryHitRate>("getMemoryHitRate"); } // TODO(BACKEND: §4.6) GET /memory/hitrate — V2.1 feed, mock returns the fixture

  // ── §4.7 Life ─────────────────────────────────────────────────────────
  getLife(focus?: string) { return this.req<{ goals: Goal[]; habits: Habit[]; habitLogs: HabitLog[]; people: Person[]; money: MoneyRow[]; moneyDue: MoneyDue[]; learning: LearningItem[] }>("getLife", [], { query: { focus } }); } // TODO(BACKEND: §4.7) GET /life?focus=
  getGoals(focus?: string) { return this.req<Goal[]>("getGoals", [], { query: { focus } }); } // TODO(BACKEND: §4.20) GET /goals?focus=
  putGoals(goals: Goal[]) { return this.req<Goal[]>("putGoals", [], { body: { goals } }); } // TODO(BACKEND: §4.20) PUT /goals — the whole set at once
  getGoalsHistory(focus?: string) { return this.req<Goal[]>("getGoalsHistory", [], { query: { focus } }); } // TODO(BACKEND: §4.20) GET /goals/history
  getGoal(id: string) { return this.req<GoalComposite>("getGoal", [id]); } // TODO(BACKEND: §4.20) GET /goals/{id} — with its tasks and deliverables
  getHabits(includeArchived?: boolean) { return this.req<Habit[]>("getHabits", [], { query: { includeArchived: includeArchived === true ? "true" : undefined } }); } // TODO(BACKEND: §4.7) GET /habits?includeArchived=
  putHabits(habits: Habit[]) { return this.req<Habit[]>("putHabits", [], { body: { habits } }); } // TODO(BACKEND: §4.20) PUT /habits — the whole set at once
  postHabitLog(habitId: string, date: string, done: boolean) { return this.req<HabitLog>("postHabitLog", [habitId], { body: { date, done } }); } // TODO(BACKEND: §4.7) POST /habits/{id}/log
  getHabitStats(period: HabitStats["period"], anchor?: string) { return this.req<HabitStats>("getHabitStats", [], { query: { period, anchor } }); } // TODO(BACKEND: §4.7) GET /habits/stats?period=&anchor=
  getPeople(focus?: string) { return this.req<Person[]>("getPeople", [], { query: { focus } }); } // TODO(BACKEND: §4.7) GET /people?focus=
  postPersonAct(id: string, action: "draft" | "nudge" | "done") { return this.req<Person>("postPersonAct", [id], { body: { action } }); } // TODO(BACKEND: §4.7) POST /people/{id}/act — draft/nudge never send
  getMoney() { return this.req<{ rows: MoneyRow[]; due: MoneyDue[]; feedNote: string }>("getMoney"); } // TODO(BACKEND: §4.7) GET /money
  getHealth() { return this.req<unknown>("getHealth"); } // TODO(BACKEND: §4.7) GET /health — ghost until capabilities.healthFeed
  getLearning(focus?: string) { return this.req<LearningItem[]>("getLearning", [], { query: { focus } }); } // TODO(BACKEND: §4.7) GET /learning?focus=
  getLearningItem(id: string) { return this.req<LearningItem>("getLearningItem", [id]); } // TODO(BACKEND: §4.20) GET /learning/{id}
  getLifeSectionConfig(id: string) { return this.req<LifeSectionConfig>("getLifeSectionConfig", [id]); } // TODO(BACKEND: §4.7) GET /life/sections/{id}/config
  putLifeSectionConfig(id: string, config: Partial<LifeSectionConfig>) { return this.req<LifeSectionConfig>("putLifeSectionConfig", [id], { body: config }); } // TODO(BACKEND: §4.7) PUT /life/sections/{id}/config
  revertLifeSectionConfig(id: string) { return this.req<LifeSectionConfig>("revertLifeSectionConfig", [id]); } // TODO(BACKEND: §4.7) POST /life/sections/{id}/config/revert

  getSectionCatalogue() { return this.req<SectionCatalogue>("getSectionCatalogue", []); } // TODO(BACKEND: §4.10) GET /sections/catalogue
  getSections(tab?: string) { return this.req<SectionConfig[]>("getSections", [], { query: { tab } }); } // TODO(BACKEND: §4.10) GET /sections?tab=
  getSection(id: string) { return this.req<SectionConfig>("getSection", [id]); } // TODO(BACKEND: §4.10) GET /sections/{id}
  putSection(id: string, config: Partial<SectionConfig>) { return this.req<SectionConfig>("putSection", [id], { body: config }); } // TODO(BACKEND: §4.10) PUT /sections/{id}
  revertSection(id: string) { return this.req<SectionConfig>("revertSection", [id]); } // TODO(BACKEND: §4.10) POST /sections/{id}/revert
  deleteSection(id: string) { return this.req<SectionConfig>("deleteSection", [id]); } // TODO(BACKEND: §4.10) DELETE /sections/{id}
  proposeSection(config: SectionConfig, reason: string) { return this.req<ActionItem>("proposeSection", [], { body: { config, reason } }); } // TODO(BACKEND: §4.10) POST /sections/propose — EA only

  // ── §4.8 Agents ───────────────────────────────────────────────────────
  getAgents() { return this.req<AgentRoster>("getAgents"); } // TODO(BACKEND: §4.15) GET /agents — the delegatee roster
  getAgentSummary() { return this.req<AgentSummary>("getAgentSummary"); } // TODO(BACKEND: §4.8) GET /agents/summary
  getAgentSpend() { return this.req<Spend>("getAgentSpend"); } // TODO(BACKEND: §4.8) GET /agents/spend
  putAgentCaps(caps: { agent: string; cap: number }[], opts: HighRiskOpts) { return this.req<Spend>("putAgentCaps", [], { body: { caps, ...opts } }); } // TODO(BACKEND: §4.8) PUT /agents/caps — high-risk
  getPortals() { return this.req<Portal[]>("getPortals"); } // TODO(BACKEND: §4.8) GET /portals
  getAgentIssues() { return this.req<AgentIssue[]>("getAgentIssues"); } // TODO(BACKEND: §4.8) GET /agents/issues
  getAgentIssue(id: string) { return this.req<AgentIssue>("getAgentIssue", [id]); } // TODO(BACKEND: §4.21) GET /agents/issues/{id}
  postAgentIssueAction(id: string, action: "renew" | "run" | "open") { return this.req<AgentIssue>("postAgentIssueAction", [id], { body: { action } }); } // TODO(BACKEND: §4.8) POST /agents/issues/{id}
  undoAgentIssueAction(id: string) { return this.req<AgentIssue>("undoAgentIssueAction", [id]); } // TODO(BACKEND: §4.8, A-32) POST /agents/issues/{id}/undo — not in CONTRACT_v2.md
  getAgentFeed(hours = 24, since?: string) { return this.req<FeedEvent[]>("getAgentFeed", [], { query: { hours: String(hours), since } }); } // TODO(BACKEND: §4.8) GET /agents/feed?hours=&since=
  getSecurityChecks() { return this.req<SecurityCheck[]>("getSecurityChecks"); } // TODO(BACKEND: §4.8) GET /security/checks — the fixed set of seven
  postSecurityCheckRun(id: string) { return this.req<SecurityCheck>("postSecurityCheckRun", [id]); } // TODO(BACKEND: §4.8) POST /security/checks/{id}/run
  getAgentRuns(filter?: { agent?: string; day?: string }) { return this.req<AgentRun[]>("getAgentRuns", [], { query: filter }); } // TODO(BACKEND: §4.8) GET /agents/runs?agent=&day= — v1.2 §12.3 kept

  // §4.16 Usage (T-4, ADR-43)
  getTaskUsage(id: string) { return this.req<UsageSummary>("getTaskUsage", [id]); } // TODO(BACKEND: §4.15) GET /tasks/{id}/usage
  getUsage(range?: "month" | "all") { return this.req<UsageSummary>("getUsage", [], { query: { range } }); } // TODO(BACKEND: §4.16) GET /usage?range=

  // ── §4.17 Files and deliverables (X-1) ───────────────────────────────
  getTaskFiles(id: string) { return this.req<AttachmentList>("getTaskFiles", [id]); } // TODO(BACKEND: §4.15) GET /tasks/{id}/files — the task's and every subtask's
  getFiles(filter?: { q?: string; addedBy?: string; kind?: string; range?: string; taskId?: string }) { return this.req<AttachmentList>("getFiles", [], { query: filter }); } // TODO(BACKEND: §4.17) GET /files?q=&addedBy=&kind=&range=&taskId=
  getFile(id: string) { return this.req<Attachment>("getFile", [id]); } // TODO(BACKEND: §4.17) GET /files/{id} — mints a short-lived signed `url`; never cache it
  postFile(file: MultipartFile, fields?: { taskId?: string; subtaskId?: string; captureId?: string }) { return this.req<Attachment>("postFile", [], { multipart: { file, fields } }); } // TODO(BACKEND: §4.17) POST /files — multipart; > 25 MB → 413

  // ── §4.9 Settings and configuration ──────────────────────────────────
  getNotificationGroups() { return this.req<NotificationGroup[]>("getNotificationGroups"); } // TODO(BACKEND: §4.9) GET /settings/notifications
  putNotificationGroup(id: string, devices: NotificationGroup["devices"]) { return this.req<NotificationGroup>("putNotificationGroup", [id], { body: { devices } }); } // TODO(BACKEND: §4.9) PUT /settings/notifications/{id} — locked group → 423
  getQuietHours() { return this.req<QuietHours>("getQuietHours"); } // TODO(BACKEND: §4.9) GET /settings/quiet-hours
  putQuietHours(q: QuietHours) { return this.req<QuietHours>("putQuietHours", [], { body: q }); } // TODO(BACKEND: §4.9) PUT /settings/quiet-hours
  getSchedules() { return this.req<Schedule[]>("getSchedules"); } // TODO(BACKEND: §4.9) GET /schedules
  postScheduleRun(id: string) { return this.req<Schedule>("postScheduleRun", [id]); } // TODO(BACKEND: §4.9) POST /schedules/{id}/run
  postSchedulePause(id: string) { return this.req<Schedule>("postSchedulePause", [id]); } // TODO(BACKEND: §4.9) POST /schedules/{id}/pause
  postScheduleResume(id: string) { return this.req<Schedule>("postScheduleResume", [id]); } // TODO(BACKEND: §4.9) POST /schedules/{id}/resume
  getAutonomy() { return this.req<AutonomySettings>("getAutonomy"); } // TODO(BACKEND: §4.9) GET /settings/autonomy
  getAutonomyRules() { return this.req<AutonomyRuleList>("getAutonomyRules"); } // TODO(BACKEND: §4.22) GET /settings/autonomy/rules
  putAutonomyRules(rules: AutonomyRule[]) { return this.req<AutonomyRuleList>("putAutonomyRules", [], { body: { rules } }); } // TODO(BACKEND: §4.22) PUT /settings/autonomy/rules — replaces the list
  postAutonomyPropose(text?: string) { return this.req<ActionItem>("postAutonomyPropose", [], { body: { text } }); } // TODO(BACKEND: §4.22) POST /settings/autonomy/propose
  putAutonomy(settings: AutonomySettings) { return this.req<AutonomySettings>("putAutonomy", [], { body: settings }); } // TODO(BACKEND: §4.9) PUT /settings/autonomy — enforced server-side
  getVoiceSettings() { return this.req<VoiceSettings>("getVoiceSettings"); } // TODO(BACKEND: §4.22) GET /settings/voice
  putVoiceSettings(settings: VoiceSettings) { return this.req<VoiceSettings>("putVoiceSettings", [], { body: settings }); } // TODO(BACKEND: §4.9) PUT /settings/voice
  getFocuses() { return this.req<Focus[]>("getFocuses"); } // TODO(BACKEND: §4.9) GET /focuses
  putFocuses(focuses: Focus[]) { return this.req<Focus[]>("putFocuses", [], { body: { focuses } }); } // TODO(BACKEND: §4.9) PUT /focuses — Everything is fixed
  getParameters() { return this.req<Parameter[]>("getParameters"); } // TODO(BACKEND: §4.14) GET /parameters
  putParameter(key: string, value: number | boolean) { return this.req<Parameter>("putParameter", [key], { body: { value } }); } // TODO(BACKEND: §4.14) PUT /parameters/{key} — outside [min, max] is 422 { field: "value" }
  proposeParameter(key: string, value: number | boolean, reason: string) { return this.req<ActionItem>("proposeParameter", [], { body: { key, value, reason } }); } // TODO(BACKEND: §4.14) POST /parameters/propose — EA only; creates a decision card, changes nothing
  getLayout(tab: string) { return this.req<Layout>("getLayout", [tab]); } // TODO(BACKEND: §4.9) GET /layout/{tab}
  putLayout(tab: string, layout: Partial<Layout>) { return this.req<Layout>("putLayout", [tab], { body: layout }); } // TODO(BACKEND: §4.9) PUT /layout/{tab} — pinned sections rejected on hide (422)
  revertLayout(tab: string) { return this.req<Layout>("revertLayout", [tab]); } // TODO(BACKEND: §4.9) POST /layout/{tab}/revert
  postLayoutEa(tab: string, sections: { order: string[]; hidden: string[] }, reason: string) { return this.req<Layout>("postLayoutEa", [tab], { body: { ...sections, reason } }); } // TODO(BACKEND: §4.9) POST /layout/{tab}/ea — a reason is required (422 without one)
  getAppLayout() { return this.req<AppLayout>("getAppLayout"); } // TODO(BACKEND: §4.9) GET /layout/app
  putAppLayout(layout: Partial<AppLayout>) { return this.req<AppLayout>("putAppLayout", [], { body: layout }); } // TODO(BACKEND: §4.9) PUT /layout/app
  getSyncStatus() { return this.req<SyncStatus>("getSyncStatus"); } // TODO(BACKEND: §4.12) GET /sync/status
  getCapabilities() { return this.req<Capabilities>("getCapabilities"); } // TODO(BACKEND: §4.9) GET /capabilities
  postExport() { return this.req<{ jobId: string }>("postExport"); } // TODO(BACKEND: §4.9) POST /export
  getLabelsScheme() { return this.req<unknown>("getLabelsScheme"); } // TODO(BACKEND: §4.9) GET /labels/scheme — v1.2 §12.1 kept
  getLabelAudit(record: string) { return this.req<LabelAuditRow[]>("getLabelAudit", [], { query: { record } }); } // TODO(BACKEND: §4.9) GET /labels/audit?record=
}
