/**
 * DataProvider — the app ↔ backend contract, 1:1 with CONTRACT_v2.md §4.
 * ApiAdapter is the only implementation (ADR-02); every method's real body
 * is marked `TODO(BACKEND: §4.n)` there, not here. No send/pay/book/revoke
 * verb exists on this interface by design (SEC-15) — the grep in row 4's
 * Jest suite proves it.
 */
import type { Silo, LabelType } from "./labels";
import type { MultipartFile } from "./transport/Transport";
import type {
  ChatThread,
  MemoryHistoryEntry,
  Reply,
  SearchResponse,
  ActionItem,
  AgentIssue,
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
  TaskSlice,
  TaskView,
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

/** §9's high-risk options — a fresh nonce + biometric assertion, required
 * on: emergency lock, recovery, editing caps, revoking a device, accepting
 * a memory proposal that widens a silo (ADR-15). */
export type HighRiskOpts = { nonce: string; biometricAssertion: string };

/** `slice` is a slicer ID now (F-1): the list is stored, so the union could
 * not name one Josh added. */
export type TaskFilterQuery = { slice?: string; view?: TaskView; q?: string; filters?: string; focus?: string };
export type LabelNoun = "tasks" | "brain" | "events" | "actions";

export interface DataProvider {
  // ── §4.1 Session, devices, lock ──────────────────────────────────────
  getAuthNonce(): Promise<{ nonce: string; expiresAt: string }>;
  registerDevice(input: { name: string; publicKey: string }): Promise<{ deviceId: string; token: string }>;
  refreshAuth(): Promise<{ token: string }>;
  webauthnCeremony(step: WebauthnStep, payload?: WebauthnBody): Promise<WebauthnResult>;
  getSession(): Promise<Session>;
  revokeDevice(id: string, opts: HighRiskOpts): Promise<void>;
  postLock(opts: HighRiskOpts): Promise<{ locked: true; at: string }>;
  postRecover(input: { recoveryKey: string } & HighRiskOpts): Promise<{ restored: true; agentsResuming: string[] }>;
  postPushSubscribe(input: PushSubscribeBody): Promise<void>;
  deletePushSubscription(device: string): Promise<void>;

  // ── §4.2 Today ────────────────────────────────────────────────────────
  getToday(focus?: string, since?: string): Promise<TodayComposite>;
  getReview(anchor?: string): Promise<ReviewComposite>;
  postJournal(input: { text: string; source: "voice" | "typed" }): Promise<BrainItem>;

  // ── §4.3 Decisions ────────────────────────────────────────────────────
  getActions(state: "open" | "history", opts?: { focus?: string; q?: string }): Promise<ActionItem[]>;
  getAction(id: string): Promise<ActionItem>;
  postActionVerb(id: string, body: PostActionBody): Promise<PostActionResult>;
  postActionUndo(id: string): Promise<ActionItem>;
  /** AG-09: Decision history's "reopen" — mock-only, not in
   * CONTRACT_v2.md (A-31); unlike postActionUndo it works with no time
   * window since there's no snapshot to revert to by then. */
  postActionReopen(id: string): Promise<ActionItem>;
  putActionDraft(id: string, draft: { subject?: string; body: string }): Promise<ActionItem>;
  postInsightAction(id: string, action: "block" | "leave"): Promise<Insight>;

  // ── §4.4 Calendar ─────────────────────────────────────────────────────
  getCalendar(view: CalendarView, anchor: string, focus?: string): Promise<{ events: CalEvent[]; gaps: FreeGap[] }>;
  getEvent(id: string): Promise<CalEvent>;
  patchEvent(id: string, patch: Partial<CalEvent>): Promise<CalEvent>;
  deleteEvent(id: string): Promise<void>;
  postCalendarPropose(input: { gapStart: string; title: string; attendee?: string }): Promise<{ status: "drafted-not-sent" }>;

  // ── §4.5 Tasks ────────────────────────────────────────────────────────
  getTasks(query: TaskFilterQuery, since?: string): Promise<Task[]>;
  getTask(id: string): Promise<Task>;
  postTask(input: Omit<Task, "id" | "activity" | "subtasks">): Promise<Task>;
  patchTask(id: string, patch: Partial<Task>): Promise<Task>;
  putTask(id: string, full: Task): Promise<Task>;
  patchSubtask(taskId: string, subtaskId: string, patch: SubtaskPatch): Promise<Task>;
  deleteSubtask(taskId: string, subtaskId: string): Promise<Task>;
  postSubtask(taskId: string, input: SubtaskBody): Promise<Task>;
  /** T-2: `to` is the delegatee; `scope` is the older "just this part" hint. */
  postTaskDelegate(id: string, to?: TaskOwner, scope?: string): Promise<Task>;
  postTaskReport(id: string, verb: "accept" | "revise" | "teach", note?: string): Promise<TaskReport>;
  /** TK-10/TK-11: finish it, and its open subtasks when asked. */
  postTaskComplete(id: string, includeSubtasks: boolean): Promise<Task>;
  postTaskAccept(id: string): Promise<Task>;
  getTasksWaiting(focus?: string): Promise<{ who: string; what: string; days: number; note?: string; taskId: string }[]>;
  postTaskNudge(id: string): Promise<{ draftRef: string }>;
  getColumns(): Promise<Column[]>;
  getSlicers(): Promise<Slicer[]>;
  putSlicers(next: Slicer[]): Promise<Slicer[]>;
  postUndo(): Promise<{ undone: string | null }>;
  putLabels(noun: LabelNoun, id: string, labels: { silo: Silo; types: LabelType[] }, reason?: string): Promise<void>;

  // ── §4.6 Brain ────────────────────────────────────────────────────────
  postBrainDump(input: BrainDumpBody): Promise<DumpResult>;
  getBrainLatest(focus?: string, since?: string): Promise<BrainItem[]>;
  putBrainItem(id: string, patch: Partial<BrainItem>): Promise<BrainItem>;
  /** O-1: one item, for the detail a Find result or a Latest in row opens. */
  getBrainItem(id: string): Promise<BrainItem>;
  getBrainItemVersions(id: string): Promise<BrainItemVersion[]>;
  getBrainSearch(q: string): Promise<{ answer: FindAnswer; results: FindResult[] }>;
  /** K-1 / GS-01: the ONE search. Scoping is the server's — a record outside
   * the user's silos or above the session's clearance is never returned. */
  getSearch(query: { q: string; focus?: string; sensitivity?: string }): Promise<SearchResponse>;
  /** TS-04: the Dictate thread as the server holds it, so the dialog can
   * re-hydrate rather than losing the conversation with the modal. */
  getChatThread(): Promise<ChatThread>;
  postChat(text: string): Promise<{ reply: string; sources: string[] }>;
  getMemoryProposals(focus?: string): Promise<MemoryProposal[]>;
  /** OP-03: every correction, with who decided and what it was before. */
  getMemoryHistory(): Promise<MemoryHistoryEntry[]>;
  /** R-1: the EA's answers to captures that were questions, unread first. */
  getReplies(): Promise<Reply[]>;
  patchReply(id: string, read: boolean): Promise<Reply>;
  postMemoryProposal(id: string, verb: "ok" | "edit", text?: string): Promise<MemoryProposal>;
  /** BR-06's 10s undo on accept — CONTRACT_v2.md §4.6 has no dedicated undo
   * route for proposals (unlike `/actions/{id}/undo`); added mirroring that
   * exact pattern rather than leaving accept unrecoverable (BUGLOG_v2.md A-26). */
  undoMemoryProposal(id: string): Promise<MemoryProposal>;
  getMemoryHitRate(): Promise<MemoryHitRate>;

  // ── §4.7 Life ─────────────────────────────────────────────────────────
  getLife(
    focus?: string,
  ): Promise<{ goals: Goal[]; habits: Habit[]; habitLogs: HabitLog[]; people: Person[]; money: MoneyRow[]; moneyDue: MoneyDue[]; learning: LearningItem[] }>;
  getGoals(focus?: string): Promise<Goal[]>;
  putGoals(goals: Goal[]): Promise<Goal[]>;
  getGoalsHistory(focus?: string): Promise<Goal[]>;
  getGoal(id: string): Promise<GoalComposite>;
  getHabits(includeArchived?: boolean): Promise<Habit[]>;
  putHabits(habits: Habit[]): Promise<Habit[]>;
  postHabitLog(habitId: string, date: string, done: boolean): Promise<HabitLog>;
  getHabitStats(period: HabitStats["period"], anchor?: string): Promise<HabitStats>;
  getPeople(focus?: string): Promise<Person[]>;
  postPersonAct(id: string, action: "draft" | "nudge" | "done"): Promise<Person>;
  getMoney(): Promise<{ rows: MoneyRow[]; due: MoneyDue[]; feedNote: string }>;
  getHealth(): Promise<unknown>;
  getLearning(focus?: string): Promise<LearningItem[]>;
  getLearningItem(id: string): Promise<LearningItem>;
  getLifeSectionConfig(id: string): Promise<LifeSectionConfig>;
  putLifeSectionConfig(id: string, config: Partial<LifeSectionConfig>): Promise<LifeSectionConfig>;
  revertLifeSectionConfig(id: string): Promise<LifeSectionConfig>;

  // ── §4.10 Sections (config records; the EA proposes, Josh edits) ──
  getSectionCatalogue(): Promise<SectionCatalogue>;
  getSections(tab?: string): Promise<SectionConfig[]>;
  getSection(id: string): Promise<SectionConfig>;
  putSection(id: string, config: Partial<SectionConfig>): Promise<SectionConfig>;
  revertSection(id: string): Promise<SectionConfig>;
  deleteSection(id: string): Promise<SectionConfig>;
  proposeSection(config: SectionConfig, reason: string): Promise<ActionItem>;

  // ── §4.8 Agents ───────────────────────────────────────────────────────
  /** §4.15 (T-2): who a task can be handed to. */
  getAgents(): Promise<AgentRoster>;
  getAgentSummary(): Promise<AgentSummary>;
  getAgentSpend(): Promise<Spend>;
  putAgentCaps(caps: { agent: string; cap: number }[], opts: HighRiskOpts): Promise<Spend>;
  getPortals(): Promise<Portal[]>;
  getAgentIssues(): Promise<AgentIssue[]>;
  getAgentIssue(id: string): Promise<AgentIssue>;
  postAgentIssueAction(id: string, action: "renew" | "run" | "open"): Promise<AgentIssue>;
  /** AG-04's 10s undo — mock-only, not in CONTRACT_v2.md (A-32, mirrors A-26). */
  undoAgentIssueAction(id: string): Promise<AgentIssue>;
  getAgentFeed(hours?: number, since?: string): Promise<FeedEvent[]>;
  getSecurityChecks(): Promise<SecurityCheck[]>;
  postSecurityCheckRun(id: string): Promise<SecurityCheck>;
  getAgentRuns(filter?: { agent?: string; day?: string }): Promise<AgentRun[]>;

  // §4.16 Usage (ADR-43)
  getTaskUsage(id: string): Promise<UsageSummary>;
  getUsage(range?: "month" | "all"): Promise<UsageSummary>;

  // §4.17 Files and deliverables (X-1, ADR-64)
  getTaskFiles(id: string): Promise<AttachmentList>;
  getFiles(filter?: { q?: string; addedBy?: string; kind?: string; range?: string; taskId?: string }): Promise<AttachmentList>;
  getFile(id: string): Promise<Attachment>;
  postFile(file: MultipartFile, fields?: { taskId?: string; subtaskId?: string; captureId?: string }): Promise<Attachment>;

  // ── §4.9 Settings and configuration ──────────────────────────────────
  getNotificationGroups(): Promise<NotificationGroup[]>;
  putNotificationGroup(id: string, devices: NotificationGroup["devices"]): Promise<NotificationGroup>;
  getQuietHours(): Promise<QuietHours>;
  putQuietHours(q: QuietHours): Promise<QuietHours>;
  getSchedules(): Promise<Schedule[]>;
  postScheduleRun(id: string): Promise<Schedule>;
  postSchedulePause(id: string): Promise<Schedule>;
  postScheduleResume(id: string): Promise<Schedule>;
  getAutonomy(): Promise<AutonomySettings>;
  // §4.23 (W-1): the standing instructions `teach` writes
  getAutonomyRules(): Promise<AutonomyRuleList>;
  putAutonomyRules(rules: AutonomyRule[]): Promise<AutonomyRuleList>;
  postAutonomyPropose(text?: string): Promise<ActionItem>;
  putAutonomy(settings: AutonomySettings): Promise<AutonomySettings>;
  getVoiceSettings(): Promise<VoiceSettings>;
  putVoiceSettings(settings: VoiceSettings): Promise<VoiceSettings>;
  getFocuses(): Promise<Focus[]>;
  putFocuses(focuses: Focus[]): Promise<Focus[]>;
  /** §4.14 (ADR-41): the six tunables. `putParameter` refuses a value
   * outside the published range with a 422 naming `value`. */
  getParameters(): Promise<Parameter[]>;
  putParameter(key: string, value: number | boolean): Promise<Parameter>;
  proposeParameter(key: string, value: number | boolean, reason: string): Promise<ActionItem>;
  getLayout(tab: string): Promise<Layout>;
  putLayout(tab: string, layout: Partial<Layout>): Promise<Layout>;
  revertLayout(tab: string): Promise<Layout>;
  postLayoutEa(tab: string, sections: { order: string[]; hidden: string[] }, reason: string): Promise<Layout>;
  getAppLayout(): Promise<AppLayout>;
  putAppLayout(layout: Partial<AppLayout>): Promise<AppLayout>;
  /** §4.12: the server's view of this device's sync — what it thinks is
   * outstanding and when it last heard from us (O-1). */
  getSyncStatus(): Promise<SyncStatus>;
  getCapabilities(): Promise<Capabilities>;
  postExport(): Promise<{ jobId: string }>;
  getLabelsScheme(): Promise<unknown>;
  getLabelAudit(record: string): Promise<LabelAuditRow[]>;
}
