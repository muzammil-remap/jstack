/**
 * routes.ts — the one table (ADR-33, S-1): every endpoint, once. `data/ApiAdapter.ts`'s
 * `CALL_ROUTES`, `data/mock/server.ts`'s router, `tools/gen-backend-grep.mjs`'s markers
 * (Q1) `tools/gen-wiring.mjs` and (W-1) `tools/gen-openapi.mjs` all read this file rather
 * than keeping their own copy —
 * a route added here without a matching `DataProvider` method fails `pnpm check` (SM-01);
 * a route whose `path` and hand-verified real shape disagree fails `routes.test.ts`.
 */
import type { DataProvider } from "./DataProvider";
import type { ShapeName } from "./types";

type HttpVerb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RouteGroup = "session" | "today" | "decisions" | "calendar" | "tasks" | "brain" | "life" | "agents" | "settings" | "sections" | "search" | "files";

type RouteEntry = {
  /** The `DataProvider`/`ApiAdapter` method name — also the `CALL_ROUTES` key. */
  name: keyof DataProvider;
  method: HttpVerb;
  /** Path template: `{param}` segments are path parameters, in call order. */
  path: string;
  /** `TODO(BACKEND: §4.n)`'s marker, kept on the ApiAdapter method that names this route. */
  marker: string;
  /** `"<mock handler module>.<export name>"` — resolved by `data/mock/server.ts` against
   * its own `import * as <module>` map; every handler takes `(req, ...pathParams)`. */
  handler: string;
  /** The request body's wire shape, by name in `data/types.ts` (W-1). Absent
   * means the route takes no body — every `GET`, and the writes whose whole
   * input is in the path. `tools/gen-openapi.mjs` turns this into the path
   * item's `requestBody` schema; `keyof Shapes` is what makes a name that is
   * not a real shape a `pnpm check` error rather than a generation-time one. */
  body?: ShapeName;
  /** The success response's wire shape, same registry. `NoContent` is the
   * name for a 204 — the route answers with no body at all. */
  response: ShapeName;
  /** A capture the app may queue and replay when the connection comes back
   * (O-1, §4.12). The allow-list is HERE rather than in `outbox.ts` for the
   * same reason every other per-route fact is: a second list is a list that
   * drifts. Only writes that are safe to repeat belong on it — the server
   * dedupes them by `offlineId`, and anything that sends, pays, books or
   * revokes is not on it at all (SEC-15). */
  offline?: true;
  /** X-1: the body is `multipart/form-data`, not JSON. `body` stays absent
   * because there is no wire SHAPE to name — the parts are a file and a few
   * string fields — and `tools/gen-openapi.mjs` emits the multipart schema
   * from this flag instead. Declared here rather than special-cased in the
   * generator so the one table still answers "what does this route take?"
   * (rule 16), and so `data/mock/validateBody.ts` can skip it by reading the
   * table rather than by matching on the path. */
  multipart?: true;
  /** WPF-3: works while the session is locked — how a locked session stops
   * being locked (the nonce, registration, refresh, the passkey ceremony,
   * recovery) and the emergency lock itself. `lib/lockGate.ts` and
   * `data/mock/server.ts` both read this flag: two hand-kept lists had
   * already drifted, and neither held the passkey ceremony. */
  whileLocked?: true;
  group: RouteGroup;
};

/** `{id}` → a path-segment capture group; every other character is escaped so a literal
 * `.` or `-` in a path can never accidentally match as regex syntax (S-1: patterns used
 * to be hand-written separately from the path a method actually built, and could drift). */
export function pathToPattern(path: string): RegExp {
  const source = path
    .split("/")
    .map((seg) => (seg.startsWith("{") && seg.endsWith("}") ? "([^/]+)" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${source}$`);
}

export const ROUTES: readonly RouteEntry[] = [
  // ── §4.1 Session, devices, lock ────────────────────────────────────────
  { name: "getAuthNonce", method: "GET", path: "/auth/nonce", marker: "§4.1", handler: "session.getAuthNonce", response: "AuthNonce", whileLocked: true, group: "session" },
  { name: "registerDevice", method: "POST", path: "/auth/register-device", marker: "§4.1", handler: "session.registerDevice", body: "RegisterDeviceBody", response: "DeviceRegistration", whileLocked: true, group: "session" },
  { name: "refreshAuth", method: "POST", path: "/auth/refresh", marker: "§4.1", handler: "session.refreshAuth", response: "AuthToken", whileLocked: true, group: "session" },
  { name: "webauthnCeremony", method: "POST", path: "/auth/webauthn/{step}", marker: "§4.1", handler: "session.webauthnCeremony", body: "WebauthnBody", response: "WebauthnResult", whileLocked: true, group: "session" },
  { name: "getSession", method: "GET", path: "/session", marker: "§4.1", handler: "session.getSession", response: "Session", group: "session" },
  { name: "revokeDevice", method: "POST", path: "/devices/{id}/revoke", marker: "§4.1", handler: "session.revokeDevice", body: "HighRiskBody", response: "NoContent", group: "session" },
  { name: "postLock", method: "POST", path: "/lock", marker: "§4.1", handler: "session.postLock", body: "HighRiskBody", response: "LockResult", whileLocked: true, group: "session" },
  { name: "postRecover", method: "POST", path: "/recover", marker: "§4.1", handler: "session.postRecover", body: "RecoverBody", response: "RecoverResult", whileLocked: true, group: "session" },
  // §4.13 (extends v2 §4.1): a device's Web Push subscription, registered
  // with its groups and removed by device id — on revoke, and when the
  // switch on that device goes off (R-07)
  { name: "postPushSubscribe", method: "POST", path: "/push/subscribe", marker: "§4.13", handler: "session.postPushSubscribe", body: "PushSubscribeBody", response: "NoContent", group: "session" },
  { name: "deletePushSubscription", method: "DELETE", path: "/push/subscribe/{device}", marker: "§4.13", handler: "session.deletePushSubscription", response: "NoContent", group: "session" },

  // ── §4.2 Today ──────────────────────────────────────────────────────────
  { name: "getToday", method: "GET", path: "/today", marker: "§4.2", handler: "today.getToday", response: "TodayComposite", group: "today" },
  { name: "getReview", method: "GET", path: "/review", marker: "§4.2", handler: "today.getReview", response: "ReviewComposite", group: "today" },
  { name: "postJournal", method: "POST", path: "/journal", marker: "§4.2", handler: "today.postJournal", body: "JournalBody", response: "BrainItem", offline: true, group: "today" },

  // ── §4.3 Decisions ──────────────────────────────────────────────────────
  { name: "getActions", method: "GET", path: "/actions", marker: "§4.3", handler: "decisions.getActions", response: "ActionList", group: "decisions" },
  { name: "getAction", method: "GET", path: "/actions/{id}", marker: "§4.3", handler: "decisions.getAction", response: "ActionItem", group: "decisions" },
  { name: "postActionVerb", method: "POST", path: "/actions/{id}", marker: "§4.3", handler: "decisions.postActionVerb", body: "PostActionBody", response: "PostActionResult", group: "decisions" },
  { name: "postActionUndo", method: "POST", path: "/actions/{id}/undo", marker: "§4.3", handler: "decisions.postActionUndo", response: "ActionItem", group: "decisions" },
  { name: "postActionReopen", method: "POST", path: "/actions/{id}/reopen", marker: "§4.3, A-31", handler: "decisions.postActionReopen", response: "ActionItem", group: "decisions" },
  { name: "putActionDraft", method: "PUT", path: "/actions/{id}/draft", marker: "§4.3", handler: "decisions.putActionDraft", body: "ActionDraftBody", response: "ActionItem", group: "decisions" },
  { name: "postInsightAction", method: "POST", path: "/insights/{id}", marker: "§4.3", handler: "decisions.postInsightAction", body: "InsightActionBody", response: "Insight", group: "decisions" },

  // ── §4.4 Calendar ───────────────────────────────────────────────────────
  { name: "getCalendar", method: "GET", path: "/calendar", marker: "§4.4", handler: "calendar.getCalendar", response: "CalendarWindow", group: "calendar" },
  { name: "getEvent", method: "GET", path: "/events/{id}", marker: "§4.4", handler: "calendar.getEvent", response: "CalEvent", group: "calendar" },
  { name: "patchEvent", method: "PATCH", path: "/events/{id}", marker: "§4.4", handler: "calendar.patchEvent", body: "CalEventPatch", response: "CalEvent", group: "calendar" },
  { name: "deleteEvent", method: "DELETE", path: "/events/{id}", marker: "§4.4", handler: "calendar.deleteEvent", response: "NoContent", group: "calendar" },
  { name: "postCalendarPropose", method: "POST", path: "/calendar/propose", marker: "§4.4", handler: "calendar.postCalendarPropose", body: "CalendarProposeBody", response: "CalendarProposeResult", group: "calendar" },

  // ── §4.5 Tasks ──────────────────────────────────────────────────────────
  // getTasksWaiting and getColumns MUST precede getTask: both are literal 2-segment
  // GET paths that /^\/tasks\/([^/]+)$/ would otherwise swallow first (the
  // router matches in array order — S-1 keeps mock/server.ts's original
  // route precedence exactly; routes.test.ts's "pattern matches its own
  // template" per-row test can't see this cross-row ordering hazard, so it
  // is asserted directly instead).
  { name: "getTasksWaiting", method: "GET", path: "/tasks/waiting", marker: "§4.5", handler: "tasks.getTasksWaiting", response: "WaitingList", group: "tasks" },
  { name: "getColumns", method: "GET", path: "/tasks/columns", marker: "§4.15", handler: "tasks.getColumns", response: "ColumnList", group: "tasks" },
  { name: "getTasks", method: "GET", path: "/tasks", marker: "§4.5", handler: "tasks.getTasks", response: "TaskList", group: "tasks" },
  { name: "getTask", method: "GET", path: "/tasks/{id}", marker: "§4.5", handler: "tasks.getTask", response: "Task", group: "tasks" },
  { name: "postTask", method: "POST", path: "/tasks", marker: "§4.5", handler: "tasks.postTask", body: "TaskCreateBody", response: "Task", offline: true, group: "tasks" },
  { name: "patchTask", method: "PATCH", path: "/tasks/{id}", marker: "§4.5", handler: "tasks.patchTask", body: "TaskPatch", response: "Task", offline: true, group: "tasks" },
  { name: "putTask", method: "PUT", path: "/tasks/{id}", marker: "§4.5", handler: "tasks.putTask", body: "Task", response: "Task", group: "tasks" },
  { name: "postSubtask", method: "POST", path: "/tasks/{id}/subtasks", marker: "§4.5", handler: "tasks.postSubtask", body: "SubtaskBody", response: "Task", group: "tasks" },
  // §4.15 (T-2): a subtask is a thing you can change and a thing you can
  // remove. The PATCH is `offline: true` — ticking one on a train is a
  // capture like any other; the DELETE is not, because replaying a delete
  // against a server that already applied it is how a restored subtask
  // disappears a second time.
  { name: "patchSubtask", method: "PATCH", path: "/tasks/{id}/subtasks/{sid}", marker: "§4.15", handler: "tasks.patchSubtask", body: "SubtaskPatch", response: "Task", offline: true, group: "tasks" },
  { name: "deleteSubtask", method: "DELETE", path: "/tasks/{id}/subtasks/{sid}", marker: "§4.15", handler: "tasks.deleteSubtask", response: "Task", group: "tasks" },
  { name: "postTaskDelegate", method: "POST", path: "/tasks/{id}/delegate", marker: "§4.5", handler: "tasks.postTaskDelegate", body: "DelegateBody", response: "Task", group: "tasks" },
  { name: "postTaskReport", method: "POST", path: "/tasks/{id}/report", marker: "§4.5", handler: "tasks.postTaskReport", body: "TaskReportBody", response: "TaskReport", group: "tasks" },
  { name: "postTaskComplete", method: "POST", path: "/tasks/{id}/complete", marker: "§4.15", handler: "tasks.postTaskComplete", body: "CompleteBody", response: "Task", offline: true, group: "tasks" },
  { name: "postTaskAccept", method: "POST", path: "/tasks/{id}/accept", marker: "§4.5", handler: "tasks.postTaskAccept", response: "Task", group: "tasks" },
  { name: "postTaskNudge", method: "POST", path: "/tasks/{id}/nudge", marker: "§4.5", handler: "tasks.postTaskNudge", response: "NudgeResult", group: "tasks" },
  { name: "getSlicers", method: "GET", path: "/slicers", marker: "§4.15", handler: "tasks.getSlicers", response: "SlicerList", group: "tasks" },
  { name: "putSlicers", method: "PUT", path: "/slicers", marker: "§4.15", handler: "tasks.putSlicers", body: "SlicerList", response: "SlicerList", group: "tasks" },
  { name: "getTaskUsage", method: "GET", path: "/tasks/{id}/usage", marker: "§4.15", handler: "usage.getTaskUsage", response: "UsageSummary", group: "tasks" },
  // §4.17 (X-1, FL-01): the task's files AND every subtask's, in one request.
  // Two requests would make the card's Files section depend on how the work
  // happened to be split up, which is not something a person filing a receipt
  // should have to think about.
  { name: "getTaskFiles", method: "GET", path: "/tasks/{id}/files", marker: "§4.15", handler: "files.getTaskFiles", response: "AttachmentList", group: "tasks" },
  { name: "postUndo", method: "POST", path: "/undo", marker: "§4.5", handler: "tasks.postUndo", response: "UndoResult", group: "tasks" },
  { name: "putLabels", method: "PUT", path: "/{noun}/{id}/labels", marker: "§4.5", handler: "tasks.putLabels", body: "LabelsBody", response: "NoContent", group: "tasks" },

  // ── §4.6 Brain ──────────────────────────────────────────────────────────
  { name: "postBrainDump", method: "POST", path: "/brain/dump", marker: "§4.6", handler: "brain.postBrainDump", body: "BrainDumpBody", response: "DumpResult", offline: true, group: "brain" },
  { name: "getBrainLatest", method: "GET", path: "/brain/latest", marker: "§4.6", handler: "brain.getBrainLatest", response: "BrainItemList", group: "brain" },
  { name: "putBrainItem", method: "PUT", path: "/brain/items/{id}", marker: "§4.6", handler: "brain.putBrainItem", body: "BrainItemPatch", response: "BrainItem", group: "brain" },
  { name: "getBrainItemVersions", method: "GET", path: "/brain/items/{id}/versions", marker: "§4.6", handler: "brain.getBrainItemVersions", response: "BrainItemVersionList", group: "brain" },
  { name: "getBrainItem", method: "GET", path: "/brain/items/{id}", marker: "§4.18", handler: "brain.getBrainItem", response: "BrainItem", group: "brain" },
  { name: "getBrainSearch", method: "GET", path: "/brain/search", marker: "§4.6", handler: "brain.getBrainSearch", response: "BrainSearchResult", group: "brain" },
  { name: "getSearch", method: "GET", path: "/search", marker: "§4.19", handler: "search.getSearch", response: "SearchResponse", group: "search" },
  { name: "getMemoryHistory", method: "GET", path: "/memory/history", marker: "§4.18", handler: "brain.getMemoryHistory", response: "MemoryHistoryList", group: "brain" },
  { name: "getReplies", method: "GET", path: "/brain/replies", marker: "§4.18", handler: "brain.getReplies", response: "ReplyList", group: "brain" },
  { name: "patchReply", method: "PATCH", path: "/brain/replies/{id}", marker: "§4.18", handler: "brain.patchReply", body: "ReplyPatch", response: "Reply", group: "brain" },
  { name: "getChatThread", method: "GET", path: "/chat/thread", marker: "§4.18", handler: "brain.getChatThread", response: "ChatThread", group: "brain" },
  { name: "postChat", method: "POST", path: "/chat", marker: "§4.6", handler: "brain.postChat", body: "ChatBody", response: "ChatReply", group: "brain" },
  { name: "getMemoryProposals", method: "GET", path: "/memory/proposals", marker: "§4.6", handler: "brain.getMemoryProposals", response: "MemoryProposalList", group: "brain" },
  { name: "postMemoryProposal", method: "POST", path: "/memory/proposals/{id}", marker: "§4.6", handler: "brain.postMemoryProposal", body: "MemoryProposalBody", response: "MemoryProposal", group: "brain" },
  { name: "undoMemoryProposal", method: "POST", path: "/memory/proposals/{id}/undo", marker: "§4.6, A-26", handler: "brain.undoMemoryProposal", response: "MemoryProposal", group: "brain" },
  { name: "getMemoryHitRate", method: "GET", path: "/memory/hitrate", marker: "§4.6", handler: "brain.getMemoryHitRate", response: "MemoryHitRate", group: "brain" },

  // ── §4.7 Life ───────────────────────────────────────────────────────────
  { name: "getLife", method: "GET", path: "/life", marker: "§4.7", handler: "life.getLife", response: "LifeComposite", group: "life" },
  { name: "getGoals", method: "GET", path: "/goals", marker: "§4.20", handler: "life.getGoals", response: "GoalList", group: "life" },
  // LG-1: the set is replaced whole, as `/slicers` and `/focuses` are — a
  // goal list is small, edited as a set, and a per-goal route would need an
  // ordering the list already carries. `offline: false`: archiving a goal
  // appends a history entry and writes a brain item, both of which the
  // SERVER composes, so a queued replay would compose them against the
  // wrong instant — and unlike ticking a habit, editing a goal is not
  // something you do on a train.
  { name: "putGoals", method: "PUT", path: "/goals", marker: "§4.20", handler: "life.putGoals", body: "GoalsBody", response: "GoalList", group: "life" },
  // `/goals/history` MUST precede `/goals/{id}`: the same array-order
  // hazard as `/tasks/columns` before `/tasks/{id}` — the id pattern would
  // otherwise swallow the literal path as a goal called "history".
  { name: "getGoalsHistory", method: "GET", path: "/goals/history", marker: "§4.20", handler: "life.getGoalsHistory", response: "GoalList", group: "life" },
  { name: "getGoal", method: "GET", path: "/goals/{id}", marker: "§4.20", handler: "life.getGoal", response: "GoalComposite", group: "life" },
  { name: "getHabits", method: "GET", path: "/habits", marker: "§4.7", handler: "life.getHabits", response: "HabitList", group: "life" },
  // LH-2: archive, restore, rename and reorder, as one set — the same shape
  // `/slicers`, `/focuses` and `/goals` take. `offline: false`: the server
  // stamps `archivedAt`, so a queued replay would stamp the wrong instant,
  // and editing your habit list is not something you do on a train.
  { name: "putHabits", method: "PUT", path: "/habits", marker: "§4.20", handler: "life.putHabits", body: "HabitsBody", response: "HabitList", group: "life" },
  { name: "postHabitLog", method: "POST", path: "/habits/{id}/log", marker: "§4.7", handler: "life.postHabitLog", body: "HabitLogBody", response: "HabitLog", offline: true, group: "life" },
  { name: "getHabitStats", method: "GET", path: "/habits/stats", marker: "§4.7", handler: "life.getHabitStats", response: "HabitStats", group: "life" },
  { name: "getPeople", method: "GET", path: "/people", marker: "§4.7", handler: "life.getPeople", response: "PersonList", group: "life" },
  { name: "postPersonAct", method: "POST", path: "/people/{id}/act", marker: "§4.7", handler: "life.postPersonAct", body: "PersonActBody", response: "Person", offline: true, group: "life" },
  { name: "getMoney", method: "GET", path: "/money", marker: "§4.7", handler: "life.getMoney", response: "MoneyComposite", group: "life" },
  { name: "getHealth", method: "GET", path: "/health", marker: "§4.7", handler: "life.getHealth", response: "HealthComposite", group: "life" },
  { name: "getLearning", method: "GET", path: "/learning", marker: "§4.7", handler: "life.getLearning", response: "LearningList", group: "life" },
  { name: "getLearningItem", method: "GET", path: "/learning/{id}", marker: "§4.20", handler: "life.getLearningItem", response: "LearningItem", group: "life" },
  { name: "getLifeSectionConfig", method: "GET", path: "/life/sections/{id}/config", marker: "§4.7", handler: "life.getLifeSectionConfig", response: "LifeSectionConfig", group: "life" },
  { name: "putLifeSectionConfig", method: "PUT", path: "/life/sections/{id}/config", marker: "§4.7", handler: "life.putLifeSectionConfig", body: "LifeSectionConfigPatch", response: "LifeSectionConfig", group: "life" },
  { name: "revertLifeSectionConfig", method: "POST", path: "/life/sections/{id}/config/revert", marker: "§4.7", handler: "life.revertLifeSectionConfig", response: "LifeSectionConfig", group: "life" },

  // ── §4.8 Agents ─────────────────────────────────────────────────────────
  // §4.15 (T-2, resolution #22): who a task can be handed to. Separate from
  // the spend caps, which are a money limit rather than a statement that an
  // agent takes work — and the dev has no cap at all.
  { name: "getAgents", method: "GET", path: "/agents", marker: "§4.15", handler: "agents.getAgents", response: "AgentRoster", group: "agents" },
  { name: "getAgentSummary", method: "GET", path: "/agents/summary", marker: "§4.8", handler: "agents.getAgentSummary", response: "AgentSummary", group: "agents" },
  { name: "getAgentSpend", method: "GET", path: "/agents/spend", marker: "§4.8", handler: "agents.getAgentSpend", response: "Spend", group: "agents" },
  { name: "putAgentCaps", method: "PUT", path: "/agents/caps", marker: "§4.8", handler: "agents.putAgentCaps", body: "AgentCapsBody", response: "Spend", group: "agents" },
  { name: "getPortals", method: "GET", path: "/portals", marker: "§4.8", handler: "agents.getPortals", response: "PortalList", group: "agents" },
  { name: "getAgentIssues", method: "GET", path: "/agents/issues", marker: "§4.8", handler: "agents.getAgentIssues", response: "AgentIssueList", group: "agents" },
  { name: "getAgentIssue", method: "GET", path: "/agents/issues/{id}", marker: "§4.21", handler: "agents.getAgentIssue", response: "AgentIssue", group: "agents" },
  { name: "postAgentIssueAction", method: "POST", path: "/agents/issues/{id}", marker: "§4.8", handler: "agents.postAgentIssueAction", body: "AgentIssueActionBody", response: "AgentIssue", group: "agents" },
  { name: "undoAgentIssueAction", method: "POST", path: "/agents/issues/{id}/undo", marker: "§4.8, A-32", handler: "agents.undoAgentIssueAction", response: "AgentIssue", group: "agents" },
  { name: "getAgentFeed", method: "GET", path: "/agents/feed", marker: "§4.8", handler: "agents.getAgentFeed", response: "FeedEventList", group: "agents" },
  { name: "getSecurityChecks", method: "GET", path: "/security/checks", marker: "§4.8", handler: "agents.getSecurityChecks", response: "SecurityCheckList", group: "agents" },
  { name: "postSecurityCheckRun", method: "POST", path: "/security/checks/{id}/run", marker: "§4.8", handler: "agents.postSecurityCheckRun", response: "SecurityCheck", group: "agents" },
  { name: "getAgentRuns", method: "GET", path: "/agents/runs", marker: "§4.8", handler: "agents.getAgentRuns", response: "AgentRunList", group: "agents" },
  { name: "getUsage", method: "GET", path: "/usage", marker: "§4.16", handler: "usage.getUsage", response: "UsageSummary", group: "agents" },

  // ── §4.17 Files and deliverables (X-1) ──────────────────────────────────
  // Dropbox is the record (Q16, ADR-64): these routes serve the backend's
  // INDEX of it — metadata, extracted text, and a link. They never serve
  // bytes; `url` is a short-lived signed link the app opens and never keeps.
  { name: "getFiles", method: "GET", path: "/files", marker: "§4.17", handler: "files.getFiles", response: "AttachmentList", group: "files" },
  { name: "getFile", method: "GET", path: "/files/{id}", marker: "§4.17", handler: "files.getFile", response: "Attachment", group: "files" },
  // `offline: true`: an upload is a capture. A receipt photographed on a train
  // is the same promise as a thought typed on one, and the outbox replays the
  // file BEFORE the capture that references it so the ids resolve on arrival
  // (UP-03). The 10 MB ceiling is enforced in `outbox.ts`, not here — a route
  // is either queueable or it is not, and "queueable if small" is a property
  // of the queue.
  { name: "postFile", method: "POST", path: "/files", marker: "§4.17", handler: "files.postFile", multipart: true, response: "Attachment", offline: true, group: "files" },

  // ── §4.9 Settings and configuration ────────────────────────────────────
  { name: "getNotificationGroups", method: "GET", path: "/settings/notifications", marker: "§4.9", handler: "settings.getNotificationGroups", response: "NotificationGroupList", group: "settings" },
  { name: "putNotificationGroup", method: "PUT", path: "/settings/notifications/{id}", marker: "§4.9", handler: "settings.putNotificationGroup", body: "NotificationDevicesBody", response: "NotificationGroup", group: "settings" },
  { name: "getQuietHours", method: "GET", path: "/settings/quiet-hours", marker: "§4.9", handler: "settings.getQuietHours", response: "QuietHours", group: "settings" },
  { name: "putQuietHours", method: "PUT", path: "/settings/quiet-hours", marker: "§4.9", handler: "settings.putQuietHours", body: "QuietHours", response: "QuietHours", group: "settings" },
  { name: "getSchedules", method: "GET", path: "/schedules", marker: "§4.9", handler: "settings.getSchedules", response: "ScheduleList", group: "settings" },
  { name: "postScheduleRun", method: "POST", path: "/schedules/{id}/run", marker: "§4.9", handler: "settings.postScheduleRun", response: "Schedule", group: "settings" },
  { name: "postSchedulePause", method: "POST", path: "/schedules/{id}/pause", marker: "§4.9", handler: "settings.postSchedulePause", response: "Schedule", group: "settings" },
  { name: "postScheduleResume", method: "POST", path: "/schedules/{id}/resume", marker: "§4.9", handler: "settings.postScheduleResume", response: "Schedule", group: "settings" },
  { name: "getAutonomy", method: "GET", path: "/settings/autonomy", marker: "§4.9", handler: "settings.getAutonomy", response: "AutonomySettings", group: "settings" },
  { name: "putAutonomy", method: "PUT", path: "/settings/autonomy", marker: "§4.9", handler: "settings.putAutonomy", body: "AutonomySettings", response: "AutonomySettings", group: "settings" },
  // §4.23 (W-1, resolution #55): the standing instructions `teach` writes.
  // W-1 adds the wire and the mock obeys them; ST-1 (5c) builds the editor and
  // migrates V2.1's `Rule` list into it. `PUT` replaces the whole list, as
  // `/slicers` does — a rule list is small, edited as a set, and a per-rule
  // route would need an ordering the list already has.
  { name: "getAutonomyRules", method: "GET", path: "/settings/autonomy/rules", marker: "§4.22", handler: "settings.getAutonomyRules", response: "AutonomyRuleList", group: "settings" },
  { name: "putAutonomyRules", method: "PUT", path: "/settings/autonomy/rules", marker: "§4.22", handler: "settings.putAutonomyRules", body: "AutonomyRuleList", response: "AutonomyRuleList", group: "settings" },
  // ST-03: the EA asks whether a thing it keeps being told should become
  // standing. A real backend raises this when it notices the pattern; the
  // mock needs a lever so the card can be driven, and this is it.
  { name: "postAutonomyPropose", method: "POST", path: "/settings/autonomy/propose", marker: "§4.22", handler: "settings.postAutonomyPropose", body: "AutonomyProposeBody", response: "ActionItem", group: "settings" },
  { name: "getVoiceSettings", method: "GET", path: "/settings/voice", marker: "§4.22", handler: "settings.getVoiceSettings", response: "VoiceSettings", group: "settings" },
  { name: "putVoiceSettings", method: "PUT", path: "/settings/voice", marker: "§4.9", handler: "settings.putVoiceSettings", body: "VoiceSettings", response: "VoiceSettings", group: "settings" },
  { name: "getFocuses", method: "GET", path: "/focuses", marker: "§4.9", handler: "settings.getFocuses", response: "FocusList", group: "settings" },
  { name: "putFocuses", method: "PUT", path: "/focuses", marker: "§4.9", handler: "settings.putFocuses", body: "FocusesBody", response: "FocusList", group: "settings" },
  // getAppLayout/putAppLayout MUST precede getLayout/putLayout: the same
  // array-order hazard as tasks above — /^\/layout\/([^/]+)$/ would
  // otherwise swallow "/layout/app" as tab="app" first.
  { name: "getAppLayout", method: "GET", path: "/layout/app", marker: "§4.9", handler: "settings.getAppLayout", response: "AppLayout", group: "settings" },
  { name: "putAppLayout", method: "PUT", path: "/layout/app", marker: "§4.9", handler: "settings.putAppLayout", body: "AppLayoutPatch", response: "AppLayout", group: "settings" },
  { name: "revertLayout", method: "POST", path: "/layout/{tab}/revert", marker: "§4.9", handler: "settings.revertLayout", response: "Layout", group: "settings" },
  { name: "postLayoutEa", method: "POST", path: "/layout/{tab}/ea", marker: "§4.9", handler: "settings.postLayoutEa", body: "LayoutEaBody", response: "Layout", group: "settings" },
  { name: "getLayout", method: "GET", path: "/layout/{tab}", marker: "§4.9", handler: "settings.getLayout", response: "Layout", group: "settings" },
  { name: "putLayout", method: "PUT", path: "/layout/{tab}", marker: "§4.9", handler: "settings.putLayout", body: "LayoutPatch", response: "Layout", group: "settings" },
  // §4.14 parameters (ADR-41, L-1). `/parameters/propose` comes BEFORE
  // `/parameters/{key}` for the same reason `/sections/catalogue` does: the
  // router walks in order and `{key}` would swallow "propose".
  { name: "getParameters", method: "GET", path: "/parameters", marker: "§4.14", handler: "parameters.getParameters", response: "ParameterList", group: "settings" },
  { name: "proposeParameter", method: "POST", path: "/parameters/propose", marker: "§4.14", handler: "parameters.proposeParameter", body: "ParameterProposeBody", response: "ActionItem", group: "settings" },
  // `offline: true`: setting a parameter is a preference, it is safe to
  // replay, and a lock timeout changed on a train should not be lost because
  // the tunnel was long (§17). The server dedupes by `offlineId`.
  { name: "putParameter", method: "PUT", path: "/parameters/{key}", marker: "§4.14", handler: "parameters.putParameter", body: "ParameterValueBody", response: "Parameter", offline: true, group: "settings" },
  { name: "getSyncStatus", method: "GET", path: "/sync/status", marker: "§4.12", handler: "settings.getSyncStatus", response: "SyncStatus", group: "settings" },
  { name: "getCapabilities", method: "GET", path: "/capabilities", marker: "§4.9", handler: "settings.getCapabilities", response: "Capabilities", group: "settings" },
  { name: "postExport", method: "POST", path: "/export", marker: "§4.9", handler: "settings.postExport", response: "ExportJob", group: "settings" },
  { name: "getLabelsScheme", method: "GET", path: "/labels/scheme", marker: "§4.9", handler: "settings.getLabelsScheme", response: "LabelsScheme", group: "settings" },
  { name: "getLabelAudit", method: "GET", path: "/labels/audit", marker: "§4.9", handler: "settings.getLabelAudit", response: "LabelAuditRowList", group: "settings" },

  // ── §4.10 Sections ──────────────────────────────────────────────────────
  // `/sections/catalogue` comes BEFORE `/sections/{id}`: the router walks
  // this table in order and `{id}` would swallow the literal path. That
  // ordering is load-bearing, so `tests/unit/sections.test.ts` asserts the
  // catalogue path resolves to its own handler rather than to getSection.
  { name: "getSectionCatalogue", method: "GET", path: "/sections/catalogue", marker: "§4.10", handler: "sections.getSectionCatalogue", response: "SectionCatalogue", group: "sections" },
  { name: "getSections", method: "GET", path: "/sections", marker: "§4.10", handler: "sections.getSections", response: "SectionList", group: "sections" },
  { name: "getSection", method: "GET", path: "/sections/{id}", marker: "§4.10", handler: "sections.getSection", response: "SectionConfig", group: "sections" },
  { name: "putSection", method: "PUT", path: "/sections/{id}", marker: "§4.10", handler: "sections.putSection", body: "SectionConfigPatch", response: "SectionConfig", group: "sections" },
  { name: "revertSection", method: "POST", path: "/sections/{id}/revert", marker: "§4.10", handler: "sections.revertSection", response: "SectionConfig", group: "sections" },
  { name: "deleteSection", method: "DELETE", path: "/sections/{id}", marker: "§4.10", handler: "sections.deleteSection", response: "SectionConfig", group: "sections" },
  { name: "proposeSection", method: "POST", path: "/sections/propose", marker: "§4.10", handler: "sections.proposeSection", body: "SectionProposeBody", response: "ActionItem", group: "sections" },
] as const;

/** Derived, not hand-duplicated (SM-01): every `DataProvider` method's verb and matcher,
 * built once from `ROUTES`. A route added above without a matching `DataProvider` method
 * name is still just a string here — `tests/unit/routes.test.ts` is what makes that fail
 * `pnpm test`; the *type* error a mistyped name would need is `CALL_ROUTES`'s own
 * `Record<keyof DataProvider, …>` annotation in `data/ApiAdapter.ts`, which this file
 * re-exports rather than redeclaring. */
export const CALL_ROUTES: Record<string, readonly [verb: HttpVerb, path: RegExp]> = Object.fromEntries(
  ROUTES.map((r) => [r.name, [r.method, pathToPattern(r.path)] as const]),
);

/** `path`, with `{param}` segments filled in order — what `ApiAdapter.req()` sends. */
export function buildPath(path: string, params: readonly string[]): string {
  let i = 0;
  return path.replace(/\{[^}]+\}/g, () => encodeURIComponent(params[i++]));
}

export function routeByName(name: keyof DataProvider): RouteEntry {
  const route = ROUTES.find((r) => r.name === name);
  if (route == null) throw new Error(`routes.ts: no route named "${name}"`);
  return route;
}

/**
 * SM-01's other half, at compile time: every `RouteEntry.name` is already checked against
 * `keyof DataProvider` by `ROUTES`'s own element type (a typo'd or invented name fails
 * right there). This checks the direction that can't: every `DataProvider` method has a
 * row here at all. `RouteNames` not covering `keyof DataProvider` makes `NamesCovered`
 * the tuple below instead of `true`, and assigning `true` to it is then a `pnpm check`
 * error naming exactly the missing method(s) — no runtime object literal, so nothing here
 * needs to duplicate `CALL_ROUTES`'s own completeness the way the old hand-written map did.
 */
type RouteNames = (typeof ROUTES)[number]["name"];
type NamesCovered = keyof DataProvider extends RouteNames ? true : ["routes.ts is missing a row for", Exclude<keyof DataProvider, RouteNames>];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _everyDataProviderMethodHasARoute: NamesCovered = true;
