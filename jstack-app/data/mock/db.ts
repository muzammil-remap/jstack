/**
 * In-memory mock database (ADR-02, CONTRACT_v2.md §7). Loaded from
 * data/mock/fixtures/*.json, date-shifted to "today" on load and on
 * reset(). Every table is plain data kept in module-level state; only
 * data/mock/handlers/*.ts and data/mock/server.ts may mutate it.
 */
import { addDays, atTime, dayKey, formatMonthDay, formatShort, isWeekend, weekdayLong, weekdayShort } from "@/lib/time";
import type { Silo } from "@/data/labels";
import type { MultipartFile } from "@/data/transport/Transport";
import type { MemoryHistoryEntry, ChatTurn,
  ActionItem,
  AgentIssue,
  AgentRun,
  AppLayout,
  AutonomySettings,
  BrainItem,
  CalEvent,
  Capabilities,
  Device,
  FeedEvent,
  Focus,
  Goal,
  Habit,
  HabitLog,
  Insight,
  Layout,
  LearningItem,
  LifeSectionConfig,
  MemoryHitRate,
  MemoryProposal,
  MoneyDue,
  MoneyRow,
  AgentRoster,
  NotificationGroup,
  Parameter,
  Person,
  Portal,
  PushSubscribeBody,
  QuietHours,
  Reply,
  Schedule,
  Column,
  SectionConfig,
  SecurityCheck,
  Slicer,
  SessionUser,
  Subtask,
  Task,
  Usage,
  Attachment,
  AutonomyRule,
  VoiceSettings,
} from "@/data/types";

import actionsFixture from "./fixtures/actions.json";
import agentsFixture from "./fixtures/agents.json";
import brainFixture from "./fixtures/brain.json";
import calendarFixture from "./fixtures/calendar.json";
import checksFixture from "./fixtures/checks.json";
import feedFixture from "./fixtures/feed.json";
import filesFixture from "./fixtures/files.json";
import autonomyRulesFixture from "./fixtures/autonomy-rules.json";
import day2Fixture from "./fixtures/day2.json";
import focusesFixture from "./fixtures/focuses.json";
import goalsFixture from "./fixtures/goals.json";
import habitLogFixture from "./fixtures/habits-log.json";
import { defaultParameters } from "@/data/parameters";
import { money } from "@/lib/money";
import { totalCost } from "@/lib/usage";
import layoutsFixture from "./fixtures/layouts.json";
import lifeFixture from "./fixtures/life.json";
import proposalsFixture from "./fixtures/proposals.json";
import repliesFixture from "./fixtures/replies.json";
import schedulesFixture from "./fixtures/schedules.json";
import columnsFixture from "./fixtures/columns.json";
import sectionsFixture from "./fixtures/sections.json";
import slicersFixture from "./fixtures/slicers.json";
import settingsFixture from "./fixtures/settings.json";
import tasksFixture from "./fixtures/tasks.json";
import todayFixture from "./fixtures/today.json";
import usageFixture from "./fixtures/usage.json";

/** A4R6-01/03: what ONE answer wrote — the rules it appended, the parameter
 * record it overwrote — so its undo, and a reopen, take back exactly that and
 * nothing else. Recorded by the effect itself, never inferred from the card.
 * A4R8-01: the rules AS WRITTEN too, because a revert takes a rule back only
 * while it still says what the answer wrote — a rule Josh rewrote since is his. */
export type AnswerEffect = { rules?: string[]; wroteRules?: AutonomyRule[]; parameter?: Parameter; wrote?: Parameter };

export type UndoEntry = { actionId: string; answeredAt: number; snapshot: ActionItem; effect?: AnswerEffect };

type DB = {
  actions: ActionItem[];
  insights: Insight[];
  tasks: Task[];
  calendarEvents: CalEvent[];
  brainItems: BrainItem[];
  /** TS-04: the Dictate thread is SERVER state, so the dialog can re-hydrate
   * it on open rather than losing the conversation when the modal closes. */
  chatThread: ChatTurn[];
  memoryProposals: MemoryProposal[];
  /** OP-03: the audit trail behind Memory's "all" — a correction nobody can
   * look back at is a correction nobody can check. */
  memoryHistory: MemoryHistoryEntry[];
  memoryHitRate: MemoryHitRate;
  /** R-1: the EA's answers to captures that were questions (§3). A reply is
   * its own record, not a field on the capture, because one capture can be
   * answered more than once and an answer outlives the row that asked. */
  replies: Reply[];
  goals: Goal[];
  habits: Habit[];
  habitLogs: HabitLog[];
  people: Person[];
  moneyRows: MoneyRow[];
  moneyDue: MoneyDue[];
  learning: LearningItem[];
  lifeSectionConfigs: Record<string, LifeSectionConfig>;
  /** the EA's original proposal, untouched by `putLifeSectionConfig` —
   * `revertLifeSectionConfig` restores FROM this (B-21: reverting used to
   * only flip `managedByEa` back on while keeping the user's edited
   * values, which isn't a revert). */
  lifeSectionConfigsOriginal: Record<string, LifeSectionConfig>;
  /** §4.10 configured sections (B-1). `sectionsOriginal` is the revert
   * source, the same shape as `lifeSectionConfigsOriginal` above and for
   * the same reason: a revert restores the record, it does not un-set the
   * fields the last edit happened to touch. */
  sections: SectionConfig[];
  sectionsOriginal: SectionConfig[];
  agentIssues: AgentIssue[];
  /** T-4: `Omit<..., "cost">` is the point, not a convenience — a run has no
   * cost of its own. `handlers/usage.ts` `runsWithCost()` derives each one
   * from the usage rows that name it, and the type is what stops a handler
   * reading a number that is not there (ADR-43, rule 16). */
  agentRuns: Omit<AgentRun, "cost">[];
  /** §4.16 (T-4): the ONE cost record. A task's delegation cost, its meta
   * line's cost, a run's cost and the day's spend are all sums of these. */
  usage: Usage[];
  /** §4.17 (X-1): every file the backend has indexed, wherever it lives.
   * One table, not a field on the task — a file can belong to a task, a
   * subtask, a capture or to nothing at all, and `TaskReport.files` could
   * only express the first (FL-01). Brain's Files section, the task card's,
   * Find's `file` group and the archive are four views of this one list. */
  files: Attachment[];
  /** §4.23 (W-1): the standing instructions the EA follows without asking
   * again. `teach` on a triage card appends one; the ingestion path reads them
   * before it decides whether to raise a card at all. */
  autonomyRules: AutonomyRule[];
  securityChecks: SecurityCheck[];
  feed: FeedEvent[];
  schedules: Schedule[];
  notificationGroups: NotificationGroup[];
  quietHours: QuietHours;
  autonomy: AutonomySettings;
  voiceSettings: VoiceSettings;
  focuses: Focus[];
  /** §4.14 (L-1): the six tunables at their current values. No fixture —
   * `defaultParameters()` IS the seed, because the defaults live in
   * `data/parameters.ts` and a JSON copy of them is a copy that drifts. */
  parameters: Parameter[];
  /** §4.15 (T-2): who a task can be handed to. Seeded from `agents.json`. */
  agentRoster: AgentRoster;
  /** §4.5 (B-1, ADR-45): the board's columns, mirroring Twenty's kanban field.
   * Their names and order change THERE, not here. */
  columns: Column[];
  /** §4.5 (F-1, ADR-44): the slicer chips, a list Josh edits. `fixed` ones
   * cannot be removed; every one carries a `SlicerPredicate` the server
   * evaluates from a table rather than an `if/else` chain. */
  slicers: Slicer[];
  /** TK-09: a deleted subtask, kept so the undo can restore it with its own
   * id rather than adding a lookalike. The mock keeps them for the session;
   * a real server would keep them for the undo window and no longer. */
  /** `index` is where it stood, so the undo puts it back THERE (A4R6-08). */
  subtaskTombstones: { taskId: string; subtask: Subtask; index?: number }[];
  /** A4R5-06, A4R6-02: what the LAST agent-issue verb overwrote — the issue
   * AND the security check it marked passed — and when, so its undo puts back
   * exactly those, inside the ten seconds and never after. Keyed by issue id;
   * replaced by every press, cleared by the undo that uses it. A4R8-01's
   * class: `wrote` is what the press left, so the undo puts things back only
   * while they still say that. */
  issueUndo: Record<string, { at: number; issue: AgentIssue; check?: SecurityCheck; wrote: { issue: AgentIssue; check?: SecurityCheck } }>;
  /** A4R9-11: what a memory proposal's LAST answer overwrote and wrote, and when —
   * its undo puts back exactly that, inside the ten seconds, while it still holds */
  memoryUndo: Record<string, { at: number; before: MemoryProposal; wrote: MemoryProposal }>;
  /** A4R7-04: an upload's offlineId → the file it became, for the capture that named it offline */
  fileByOfflineId: Record<string, string>;
  /** A4R8-03: an upload's offlineId → the capture that named it before the upload arrived */
  captureByPendingUpload: Record<string, string>;
  layouts: Record<string, Layout>;
  /** AR-05 "yesterday" — the pristine per-tab layout, same pattern as
   * lifeSectionConfigsOriginal above: revertLayout restores FROM this,
   * not from `current` with managedBy/reason merely stripped off (that
   * would keep whatever order/hidden the last edit left behind, B-33). */
  layoutsOriginal: Record<string, Layout>;
  appLayout: AppLayout;
  devices: Device[];
  /** §4.13: one Web Push subscription per device, replaced on re-subscribe,
   * dropped on revoke and on DELETE (R-07). Empty at load: a subscription is
   * something a browser mints, not a fixture. */
  pushSubscriptions: PushSubscribeBody[];
  portals: Portal[];
  capabilities: Capabilities;
  agentCaps: { agent: string; cap: number }[];
  undoLedger: UndoEntry[];
  clockOffsetMs: number;
  /** Who this session belongs to (I-1). The mock is a SERVER: it knows who is
   * calling, and every list read is filtered against this person's silos in
   * `data/mock/util.ts` rather than by each handler remembering to. */
  currentUser: SessionUser;
  /**
   * Every `offlineId` this server has already applied, and what it answered
   * (O-1, §4.12). A replay is not an error — it is the normal consequence of
   * a connection that dropped after the request arrived — so the second
   * arrival gets the FIRST one's answer back, marked `duplicate`, and creates
   * nothing. The mock keeps it in memory; a real backend keeps it for as long
   * as a client might plausibly retry.
   */
  applied: Record<string, unknown>;
  /** `offlineId`s the rig has armed to answer 409 on replay (OF-07). */
  conflicting: string[];
  /** When this person last saw the app. Today's delta line counts what
   * changed AFTER this instant, so "since" is a fact rather than a phrase
   * (D2-02). Day 1 seeds it last night; `reset("day2")` seeds it yesterday. */
  seenAt: string;
};

/* D-1: the four name tables that used to live here are gone. The mock renders
 * a date through `lib/time.ts` like everything else now — the tables were a
 * second copy of that file's, and the two agreed only because nobody had
 * changed either (rule 16). The "Sept"/"Sep" ICU note they carried is still
 * true and still the reason `lib/time.ts` uses fixed tables rather than
 * `Intl`; it is written down there, once. */

/** base + n days, then forward to the next Mon-Fri if that lands on a
 * weekend. CD-18: a school pickup on a Saturday is not a scheduling detail,
 * it is the demo telling an obvious lie about the owner's week. */
function schoolDay(base: Date, offset: number): string {
  let key = addDays(dayKey(base), offset);
  while (isWeekend(key)) key = addDays(key, 1);
  return key;
}

/**
 * The date a `{{WEEKDAY…:<field>}}` token is describing, read off the sibling
 * field of the same record after that field has resolved. Throwing rather than
 * falling back: a token pointing at a field that is not there is a fixture
 * error, and a silent fallback would put a wrong day on screen — which is the
 * whole thing these tokens exist to stop.
 */
function siblingDay(record: Record<string, unknown>, field: string, token: string): Date {
  const source = record[field];
  if (typeof source !== "string") {
    throw new Error(`data/mock/db.ts: {{${token}:${field}}} names a field this record does not have`);
  }
  // D-1: a DAY KEY is a local date, not an instant. `new Date("2026-09-10")`
  // parses as UTC midnight, which in any zone behind UTC is the previous
  // evening — so a `{{WEEKDAYSHORT:due}}` beside a `due` day key named the day
  // before. Caught by FX-A, which is what that guard is for.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(source) ? atTime(source, 0) : new Date(source);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`data/mock/db.ts: {{${token}:${field}}} points at ${JSON.stringify(source)}, which is not a date`);
  }
  return d;
}

/** Every string field in a fixture that should shift with "today".
 *
 * MACHINE tokens, for fields something computes with: `{{TODAY+N}}` (date only,
 * YYYY-MM-DD) and `{{NOW+N;HH:MM}}` (a full UTC instant N days out at HH:MM).
 *
 * DISPLAY tokens, for a string that is rendered as-is: `{{DATE+N}}` → "4
 * September", `{{DATESHORT+N}}` → "19 Sep" (the abbreviated form the pack
 * uses in card titles and due lines) — the forms README Content
 * specifies ("Dates: `4 September`"). A `{{TIME;HH:MM}}` that rendered
 * "09:41" was here too and is gone (T-4, B-27): its only two uses were
 * activity `at` fields, where a display string is not an instant and
 * `new Date("02:14")` is Invalid Date. Security-check
 * statuses and Today's subtitle used the machine tokens and so printed
 * `2026-09-04` and `last 2026-09-04T09:41:00.000Z` on screen (ux-review D26).
 * All four resolve against `base`. */
function resolveTokens<T>(value: T, base: Date): T {
  if (typeof value === "string") {
    let out = value.replace(/\{\{TODAY([+-]\d+)?\}\}/g, (_m, off) => {
      return addDays(dayKey(base), off ? parseInt(off, 10) : 0);
    });
    // R23-01: the SHORT display form, added because the same bill was
    // stating two different due dates. The Life money footer computed its
    // date from `{{TODAY+14}}` and the decision card carried the literal
    // "due 19 Sep", so the two agreed only on the day the fixtures were
    // written. Nine review rounds photographed that day; the tenth crossed
    // midnight and the demo told the owner one bill was due on two dates.
    // One offset, two renderings, no literals.
    out = out.replace(/\{\{DATESHORT([+-]\d+)?\}\}/g, (_m, off) => {
      return formatShort(addDays(dayKey(base), off ? parseInt(off, 10) : 0));
    });
    out = out.replace(/\{\{DATE([+-]\d+)?\}\}/g, (_m, off) => {
      return formatMonthDay(addDays(dayKey(base), off ? parseInt(off, 10) : 0));
    });
    out = out.replace(/\{\{SCHOOLDAY([+-]\d+)?;(\d{2}):(\d{2})\}\}/g, (_m, off, hh, mm) => {
      return atTime(schoolDay(base, off ? parseInt(off, 10) : 0), parseInt(hh, 10), parseInt(mm, 10)).toISOString();
    });
    // FX-A: SHORT before long, the same ordering DATESHORT needs — and for the
    // same reason it exists at all. A due date computed from an offset beside
    // a `dueLabel` of "Fri" agreed only on the day the fixture was written.
    out = out.replace(/\{\{WEEKDAYSHORT([+-]\d+)?\}\}/g, (_m, off) => {
      return weekdayShort(addDays(dayKey(base), off ? parseInt(off, 10) : 0));
    });
    out = out.replace(/\{\{WEEKDAY([+-]\d+)?\}\}/g, (_m, off) => {
      return weekdayLong(addDays(dayKey(base), off ? parseInt(off, 10) : 0));
    });
    out = out.replace(/\{\{NOW([+-]\d+)?;(\d{2}):(\d{2})\}\}/g, (_m, off, hh, mm) => {
      return atTime(addDays(dayKey(base), off ? parseInt(off, 10) : 0), parseInt(hh, 10), parseInt(mm, 10)).toISOString();
    });
    return out as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => resolveTokens(v, base)) as unknown as T;
  if (value != null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTokens(v, base);
    // CD-18: `{{WEEKDAY:expiresAt}}` in prose reads the weekday off a SIBLING
    // field of the same record, after that field has been resolved. Prose that
    // names a day and a timestamp that means a day are two statements about
    // one fact, and the fixtures used to make them separately: the clash card
    // said "Dev call Thursday" whatever day the call actually landed on, and
    // "expires Wed 5pm" beside an expiry three days out. Now the sentence
    // cannot drift from the field it is describing, because it IS the field.
    for (const [k, v] of Object.entries(out)) {
      if (typeof v !== "string") continue;
      // `{{WEEKDAYSHORT:due}}` first — `{{WEEKDAY:` is a prefix of it, and a
      // sibling-field token that half-resolved would be worse than either form.
      let next = v.replace(/\{\{WEEKDAYSHORT:([A-Za-z0-9_]+)\}\}/g, (_m, field: string) => weekdayShort(dayKey(siblingDay(out, field, "WEEKDAYSHORT"))));
      next = next.replace(/\{\{WEEKDAY:([A-Za-z0-9_]+)\}\}/g, (_m, field: string) => weekdayLong(dayKey(siblingDay(out, field, "WEEKDAY"))));
      out[k] = next;
    }
    return out as T;
  }
  return value;
}

/**
 * LH-1 — `habits-log.json` is a compact DAY STRING per habit, and this is what
 * turns it into logs.
 *
 * Index 0 is TODAY and index n is TODAY-n; `1` is logged and done, `0` is
 * logged and missed, `.` was never logged at all. A day that is not logged
 * produces NO ROW, which is the whole reason for the third character: the
 * month grid draws "missed" and "never logged" differently, and a fixture that
 * could only say true or false could not tell them apart.
 *
 * A compact encoding rather than ~1000 rows carrying `{{TODAY-n}}`: a thousand
 * tokens are a thousand chances to drift, and about 60 KB of an entry bundle
 * with ten per cent of headroom (F-2). Nothing in the fixture is a literal
 * date — the day keys are composed HERE, from the same `base` every other
 * fixture resolves against.
 */
function expandHabitLog(todayKeyValue: string): HabitLog[] {
  const out: HabitLog[] = [];
  for (const [habitId, days] of Object.entries(habitLogFixture.logs as Record<string, string>)) {
    for (let n = 0; n < days.length; n++) {
      const mark = days[n];
      if (mark === ".") continue;
      out.push({ habitId, date: addDays(todayKeyValue, -n), done: mark === "1" });
    }
  }
  return out;
}

/**
 * The fixtures are "the state of the world" — they resolve their
 * `{{TODAY}}`/`{{NOW}}` tokens against the REAL current date, once, on
 * reset. `now()` (below) is a separate, independently offsettable reading
 * of the clock: setting a large offset advances what the mock server
 * PERCEIVES as "now" past a fixture's fixed `expiresAt` without also
 * moving that `expiresAt` — the whole point of the clock-offset test rig
 * (TD-13-style expiry/escalation tests, CT-07's expiry semantics).
 */
/**
 * The day the fixtures are written against — and it must be the SAME day the
 * server thinks it is (B-22).
 *
 * It used to be `new Date()`, i.e. UTC today, while `now()` below is
 * Brisbane-shifted (+10, §1.11). For the ten hours between 14:00 UTC and
 * midnight UTC those two are different dates: every `{{TODAY}}` habit log,
 * every `{{NOW;HH:MM}}` calendar event and the composite's own `todayDate`
 * were seeded for yesterday while the handlers filtered for today. Today went
 * empty — no events, no habit ticks, an "0/9" glance — every evening, and
 * filled itself back in the next morning.
 *
 * This is `B-09` one layer down: local getters and UTC getters disagree for
 * ten hours a day, so everything date-derived goes through one base. The
 * fixtures are part of "everything".
 */
function fixtureAnchor(): Date {
  return new Date();
}

let db: DB;

/**
 * Day 2 (ADR-31, D2-01..04): the same scene the following morning, applied as
 * a DIFF over day 1 rather than as a second fixture set.
 *
 * A second complete set would drift from the first the moment anything
 * changed in either — two stories about one household, maintained by hand.
 * Everything in `day2.json` is instead something that changed BECAUSE time
 * passed: a card whose expiry arrived and whose then-what was therefore
 * applied, a Later that came back, yesterday's habit ticks, an overnight
 * delegation that finished. That is the only thing a second day is for, and
 * expressing it as a diff means day 1 stays the single description of the
 * scene.
 */
function applyDay2(): void {
  const yesterday = addDays(dayKey(now()), day2Fixture.seenAtOffsetDays ?? -1);

  // The person last looked yesterday MORNING — a whole day away, which is
  // what makes the delta line say "Since yesterday" rather than "Since 9pm".
  // Every change below is stamped AFTER that, because a change at the same
  // instant as the last look did not happen since it.
  db.seenAt = atTime(yesterday, 9).toISOString();

  // last evening, and overnight
  const lastEvening = atTime(yesterday, 18);
  const overnightAt = atTime(addDays(yesterday, 1), 3);

  // 1. the expired card, with its then-what applied — the promise the card
  //    made in silence, kept while nobody was watching
  const expiring = db.actions.findIndex((a) => a.id === day2Fixture.expire.actionId);
  if (expiring !== -1) {
    const card = db.actions[expiring];
    db.actions[expiring] = {
      ...card,
      state: "answered",
      expiresAt: lastEvening.toISOString(),
      history: [...card.history, { verb: "approve", option: card.recommended, at: lastEvening.toISOString(), via: "expiry" }],
    };
  }

  // 2. the Later that returned. A Later that never comes back is a card
  //    quietly dropped, which is the failure this fixture exists to show.
  const returning = db.actions.findIndex((a) => a.id === day2Fixture.laterReturns.actionId);
  if (returning !== -1) {
    db.actions[returning] = { ...db.actions[returning], state: "open", laterUntil: overnightAt.toISOString() };
  }

  // 3. yesterday's habit logs
  const stamp = yesterday; // `yesterday` IS a day key now (D-1)
  db.habitLogs = [
    ...db.habitLogs.filter((l) => l.date !== stamp),
    ...day2Fixture.habitLogsYesterday.map((l) => ({ habitId: l.habitId, date: stamp, done: l.done })),
  ];

  // 3b. LG-1 / resolution #65: an agent's overnight work moved a goal's KPI,
  //     and the goal's history records it. `kpis[].value` is the BACKEND's to
  //     advance (contract §4.20) — the editor deliberately has no field for it
  //     — so day 2 is where the app gets to show a number that changed because
  //     something happened rather than because somebody typed it.
  const goalProgress = day2Fixture.goalProgress;
  const goalIndex = db.goals.findIndex((g) => g.id === goalProgress.goalId);
  if (goalIndex !== -1) {
    const goal = db.goals[goalIndex];
    db.goals[goalIndex] = {
      ...goal,
      kpis: (goal.kpis ?? []).map((k) => (k.label === goalProgress.kpiLabel ? { ...k, value: goalProgress.value } : k)),
      history: [...goal.history, { at: overnightAt.toISOString(), event: goalProgress.event, detail: goalProgress.detail }],
    };
  }

  // 4a. WK-04: the EA's redaction run on t2 finished overnight. The MARKER
  //     goes — it is a statement about now — but the delegation does not: a run
  //     ending is not the task finishing, and the activity entry names the
  //     usage row so the card draws the run's tokens and cost under it.
  const overnightRun = day2Fixture.overnightRun;
  db.agentRuns = [...db.agentRuns, { ...overnightRun.run, at: overnightAt.toISOString() } as Omit<AgentRun, "cost">];
  db.usage = [...db.usage, { ...overnightRun.usage, at: overnightAt.toISOString(), setAt: dayKey(overnightAt) } as Usage];
  const runIndex = db.tasks.findIndex((t) => t.id === overnightRun.taskId);
  if (runIndex !== -1) {
    const running = db.tasks[runIndex];
    db.tasks[runIndex] = {
      ...running,
      work: undefined,
      delegated: running.delegated == null ? running.delegated : { ...running.delegated, progressPct: overnightRun.progressPct },
      metaParts: { ...running.metaParts, note: overnightRun.note },
      activity: [...running.activity, { at: overnightAt.toISOString(), actor: "ea", text: overnightRun.text, usageId: overnightRun.usage.id }],
    };
  }

  // 4. the overnight subtask, the run that did it, what it spent, and the
  //    report it produced. T-4: the usage row is written FIRST, because the
  //    delegation's cost is now read off it rather than typed beside it.
  const overnightWork = day2Fixture.overnightSubtask;
  db.agentRuns = [...db.agentRuns, { ...overnightWork.run, at: overnightAt.toISOString() } as Omit<AgentRun, "cost">];
  db.usage = [...db.usage, { ...overnightWork.usage, at: overnightAt.toISOString(), setAt: dayKey(overnightAt) } as Usage];
  // X-1 (FL-01): the deliverable it produced is an `Attachment` like every
  // other file. It used to live inside the report as a `{ name, ref }` pair,
  // which meant a file the EA made overnight could be shown on the task card
  // and nowhere else — not in Brain's Files, not in the archive, not in Find.
  db.files = [...db.files, { ...day2Fixture.overnightSubtask.file, at: overnightAt.toISOString(), setAt: dayKey(overnightAt) } as Attachment];
  const taskIndex = db.tasks.findIndex((t) => t.id === overnightWork.taskId);
  if (taskIndex !== -1) {
    const task = db.tasks[taskIndex];
    db.tasks[taskIndex] = {
      ...task,
      subtasks: task.subtasks.map((st) => (st.id === overnightWork.subtaskId ? { ...st, done: true, completedAt: overnightAt.toISOString() } : st)),
      // no `cost` here: `deriveTaskCosts()` sets it from the usage row above,
      // which is the only place the number exists (T-4).
      delegated: { to: "ea", state: "done" },
      report: overnightWork.report as Task["report"],
      // TK-12 (T-3): the EA finished this one overnight, and the card says so
      // from these two fields rather than from prose.
      completedBy: "ea",
      // `at` is a timestamp on the wire (CONTRACT_v21.md §1.11, first
      // sentence), which is what the delta line below counts against
      // `seenAt`; the task card formats it (`lib/time.ts` `formatWhen`,
      // ux-review R3-02 — it printed "2026-09-07T03:00:00.000Z" raw).
      //
      // `actor: "ea"`, lower case: it is the wire's `TaskOwner`, and
      // `Activity.tsx` maps it to the proper noun on screen. The uppercase
      // literal here was the one place that bypassed that map (D-1 named it,
      // T-3 fixed it).
      // `usageId` (T-4) joins this line to the run's usage row, so the card
      // draws the tokens and the cost UNDER the sentence that describes them
      // rather than as a second, unexplained row.
      activity: [...task.activity, { at: overnightAt.toISOString(), actor: "ea", text: overnightWork.report.summary, usageId: overnightWork.usage.id }],
    };
  }
}

export function reset(clockOffsetMs = 0, scenario?: string): void {
  const base = fixtureAnchor();
  // EVERY fixture module goes through the resolver, once, here. It used to be
  // applied per-table on the way into `db`, and the tables nobody thought to
  // wrap kept their tokens: `settings.json`'s devices carried `lastSeen:
  // "{{TODAY-1}}"` and `layouts.json` carried `changedAt: "{{TODAY-30}}"`, so
  // Settings › Devices and the Arrange banner were rendering the literal
  // template string. Resolving the MODULE rather than the field means a new
  // table cannot be forgotten, and `tests/unit/fixture-weekdays.test.ts`
  // asserts no `{{` survives into `db` at all (B-18).
  const today = resolveTokens(todayFixture, base) as { insight: Insight | null };
  const life = resolveTokens(lifeFixture, base) as {
    habits: Habit[];
    people: Person[];
    money: MoneyRow[];
    moneyDue: MoneyDue[];
    learning: LearningItem[];
    sectionConfigs: Record<string, LifeSectionConfig>;
  };
  const brain = resolveTokens(brainFixture, base) as { items: BrainItem[]; hitRate: MemoryHitRate };
  const agents = resolveTokens(agentsFixture, base) as { issues: AgentIssue[]; runs: Omit<AgentRun, "cost">[]; portals: Portal[] };
  const settings = resolveTokens(settingsFixture, base) as {
    notificationGroups: NotificationGroup[];
    quietHours: QuietHours;
    autonomy: AutonomySettings;
    voice: VoiceSettings;
    appLayout: AppLayout;
    devices: Device[];
    capabilities: Capabilities;
  };

  db = {
    actions: resolveTokens(actionsFixture, base) as ActionItem[],
    insights: today.insight ? [today.insight] : [],
    tasks: resolveTokens(tasksFixture, base) as Task[],
    calendarEvents: resolveTokens(calendarFixture, base) as CalEvent[],
    brainItems: brain.items,
    // seeded so the thread has a history to come back to, the way every other
    // record in this mock does
    chatThread: [
      { from: "josh", text: "What did Andy say about the V2 start date?" },
      { from: "ea", text: "He needs it before he can book his team. Nothing since Tuesday.", sources: ["Andy"] },
    ],
    memoryProposals: resolveTokens(proposalsFixture, base) as MemoryProposal[],
    memoryHistory: [
      { id: "mh1", text: "Steve's villa deposit is $4,500, not $4,000", decision: "accepted", at: "{{NOW-2;09:12}}", by: "Josh", was: "$4,000" },
      { id: "mh2", text: 'File "Moz discovery call" under Work · jstack', decision: "edited", at: "{{NOW-3;16:40}}", by: "Josh", was: "Work · admin" },
      { id: "mh3", text: "Andy prefers Tuesdays for calls", decision: "declined", at: "{{NOW-6;08:05}}", by: "Josh" },
    ].map((e) => resolveTokens(e, base)) as MemoryHistoryEntry[],
    memoryHitRate: brain.hitRate,
    replies: resolveTokens(repliesFixture, base) as Reply[],
    // LG-1: goals have their own table now. They were three lines at the top
    // of `life.json` while a goal was a name and a sentence; with KPIs, task
    // and deliverable links and an appended history they are a record like
    // tasks and files, and the archived ones live here too (`GET /goals`
    // filters it to the active set, `GET /goals/history` does not).
    goals: resolveTokens(goalsFixture, base) as Goal[],
    habits: life.habits,
    habitLogs: expandHabitLog(dayKey(base)),
    people: life.people,
    moneyRows: life.money,
    moneyDue: life.moneyDue,
    learning: life.learning,
    lifeSectionConfigs: JSON.parse(JSON.stringify(life.sectionConfigs)) as Record<string, LifeSectionConfig>,
    lifeSectionConfigsOriginal: life.sectionConfigs,
    sections: JSON.parse(JSON.stringify(sectionsFixture)) as SectionConfig[],
    sectionsOriginal: JSON.parse(JSON.stringify(sectionsFixture)) as SectionConfig[],
    agentIssues: agents.issues,
    agentRuns: agents.runs,
    slicers: JSON.parse(JSON.stringify(slicersFixture)) as Slicer[],
    columns: JSON.parse(JSON.stringify(columnsFixture)) as Column[],
    usage: resolveTokens(usageFixture, base) as Usage[],
    files: resolveTokens(filesFixture, base) as Attachment[],
    autonomyRules: resolveTokens(autonomyRulesFixture, base) as AutonomyRule[],
    securityChecks: resolveTokens(checksFixture, base) as SecurityCheck[],
    feed: resolveTokens(feedFixture, base) as FeedEvent[],
    schedules: schedulesFixture as Schedule[],
    notificationGroups: settings.notificationGroups,
    quietHours: settings.quietHours,
    autonomy: settings.autonomy,
    voiceSettings: settings.voice,
    focuses: focusesFixture as Focus[],
    parameters: defaultParameters(),
    agentRoster: (agentsFixture as { roster?: AgentRoster }).roster ?? [],
    subtaskTombstones: [],
    issueUndo: {},
    memoryUndo: {},
    fileByOfflineId: {},
    captureByPendingUpload: {},
    // B-32: putLayout/postLayoutEa/revertLayout/putAppLayout each do
    // `state.layouts[tab] = {...}` / `state.appLayout = {...}` — a bare
    // reference to the imported JSON here means that REASSIGNS a property
    // on the fixture module's own singleton object, so an earlier test's
    // mutation survives every later reset() in the same file (same lesson
    // as lifeSectionConfigs below, one layer up: cloning matters wherever
    // a handler replaces a whole entry, not just where it mutates one).
    layouts: resolveTokens(JSON.parse(JSON.stringify(layoutsFixture)), base) as Record<string, Layout>,
    layoutsOriginal: resolveTokens(JSON.parse(JSON.stringify(layoutsFixture)), base) as Record<string, Layout>,
    appLayout: { ...settings.appLayout },
    devices: settings.devices,
    pushSubscriptions: [],
    portals: agents.portals,
    capabilities: settings.capabilities,
    agentCaps: [
      { agent: "EA", cap: 150 },
      { agent: "Watchdog", cap: 20 },
      { agent: "Librarian", cap: 30 },
    ],
    undoLedger: [],
    clockOffsetMs,
    applied: {},
    conflicting: [],
    currentUser: { id: "josh", name: "Josh", role: "owner" },
    // last night, 9pm — the demo opens on "since you went to bed"
    seenAt: atTime(addDays(dayKey(base), -1), 21).toISOString(),
  };

  if (scenario === "day2") applyDay2();
  // LAST, because day 2 seeds a usage row of its own
  deriveTaskCosts();
}

/**
 * T-4, ADR-43: a task's delegation cost and the cost in its meta line are the
 * sum of its `Usage` rows, never a second number typed beside them.
 *
 * They were literals in `tasks.json` — `"cost": 0.4` on the delegation and
 * `"cost": "$0.40"` in `metaParts` — which agreed with the run fixture's own
 * `0.4` only because one person typed all three on the same afternoon. A task
 * with no usage rows keeps whatever the fixture says: `t4`'s `$0.05` is a
 * repeat schedule's last run, a record this row does not model.
 */
function deriveTaskCosts(): void {
  db.tasks = db.tasks.map((t) => {
    const spent = totalCost(db.usage.filter((u) => u.taskId === t.id));
    if (spent === 0) return t;
    return {
      ...t,
      delegated: t.delegated == null ? t.delegated : { ...t.delegated, cost: spent },
      metaParts: { ...t.metaParts, cost: money(spent) },
    };
  });
}

/**
 * The household (I-1, MU-01..04). Silos are the SERVER's answer to "what may
 * this person see" — the client never computes them, so a client that forgot
 * to filter still cannot show another person's records.
 *
 * Josh is the owner and sees everything he is a party to. Joce sees her own
 * personal silo and the shared family one — never `personal:josh`, and never
 * `work`. That asymmetry is the whole point of MU-02.
 */
const USERS: Record<string, SessionUser & { silos: Silo[] }> = {
  josh: { id: "josh", name: "Josh", role: "owner", silos: ["personal:josh", "family1", "family2", "work"] },
  joce: { id: "joce", name: "Joce", role: "partner", silos: ["personal:joce", "family1"] },
  dev: { id: "dev", name: "Dev", role: "dev", silos: ["work"] },
};

/** The silos the current session may read. */
export function currentSilos(): Silo[] {
  return USERS[db.currentUser.id]?.silos ?? [];
}

/**
 * Reseed the session as somebody else (rig only, MU-01). Only the HOLDER
 * changes: the records are the same records, which is what makes MU-02 a real
 * check rather than two different fixture sets that happen to differ.
 */
export function asUser(id: string): SessionUser {
  const user = USERS[id];
  if (user == null) throw new Error(`data/mock/db.ts: no such user "${id}"`);
  db.currentUser = { id: user.id, name: user.name, role: user.role };
  return db.currentUser;
}

// module load: seed immediately so a stray import before the test hook's
// reset() still has a populated db
reset();

export function get(): DB {
  return db;
}

/**
 * X-1 (UP-02): the bytes of an uploaded file, in memory, for the length of
 * the process.
 *
 * Deliberately NOT part of `DB` and deliberately not reseeded by `reset()`:
 * this is not fixture state, it is the thing a file server would hold, and
 * keeping it out of the record tables means `resolveTokens` never walks a
 * megabyte of binary and a rig reseed between capture families does not
 * discard a file the test just uploaded. `getFileBlob` is the only reader and
 * it exists only in the test build.
 */
const blobs = new Map<string, MultipartFile>();

export function putBlob(id: string, file: MultipartFile): void {
  blobs.set(id, file);
}

export function getBlob(id: string): MultipartFile | undefined {
  return blobs.get(id);
}

/** Advances/rewinds the mock server's perceived clock WITHOUT touching any
 * other table — a test rig moving "now" forward to trigger expiry must not
 * also wipe out mutations already made this test. */
export function setClockOffsetMs(ms: number): void {
  db.clockOffsetMs = ms;
}

/** CT-05 test rig: capabilities are backend/EA-set (no PUT in
 * CONTRACT_v2.md) — this is the only way a test flips one to prove a
 * surface reacts. */
export function setCapability(key: keyof DB["capabilities"], value: boolean): void {
  // `pushPublicKey` is a string, not a flag (U-1): flipping it off means
  // removing the key, which is exactly what a backend with no push service
  // looks like.
  if (key === "pushPublicKey") {
    if (value) db.capabilities.pushPublicKey = settingsFixture.capabilities.pushPublicKey;
    else delete db.capabilities.pushPublicKey;
    return;
  }
  (db.capabilities as unknown as Record<string, boolean>)[key] = value;
}

/** test-hook / debug inspection: a structured-clone-safe snapshot. */
export function inspect(): DB {
  return JSON.parse(JSON.stringify(db)) as DB;
}

/**
 * The mock's clock — a real instant, moved by the mock's OWN offset.
 *
 * It keeps its own (`db.clockOffsetMs`, moved by the rig's `setClockOffsetMs`)
 * rather than calling `lib/time.ts`'s `now()`, because `lib/time.ts` is
 * deliberately import-free and the app's offset is a different lever — see
 * that file's header.
 *
 * D-1 (ADR-47): this used to shift the instant onto a fixed Brisbane basis, so
 * that every handler's `todayStr` and every fixture token landed on a Brisbane
 * day. The mock runs in-process, in the same zone as the app, so "today" is
 * now simply the device's today — computed by `dayKey()`, which is where the
 * zone knowledge lives, rather than by slicing an ISO string (resolution #42).
 */
export function now(): Date {
  return new Date(Date.now() + db.clockOffsetMs);
}
