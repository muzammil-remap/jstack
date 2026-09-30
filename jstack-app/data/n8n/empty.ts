/**
 * The contract's empty value for every GET response shape the n8n transport answers without a
 * source yet (ADR-76) — a list with nothing in it, a composite with nothing counted — so a section
 * shows its own empty state and never the mock's demo content.
 *
 * A single record by id has no empty value: asked for a task, a goal or an event that no source has
 * produced, the honest answer is `404`, which every detail surface already renders as missing. The
 * section catalogue is the one list-shaped answer with no honest empty form (its values are the
 * app's own vocabulary, built in `layout/` where `data/` cannot reach without a cycle) and nothing
 * in the app asks for it, so it answers `501 { reason: "not connected yet" }` like an unwired write.
 */
import { formatMonthDay, now, todayKey, weekdayLong } from "@/lib/time";
import type { HabitPeriod, HabitStats, ShapeName, TodayComposite } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import type { Asked } from "./registry";

const ok = (json: unknown): TransportResponse => ({ status: 200, json });

export const NOT_CONNECTED: TransportResponse = { status: 501, json: { reason: "not connected yet" } };

const PERIODS: HabitPeriod[] = ["week", "month", "year", "all"];

/**
 * Today with nothing in it: the date is real, everything the sources would say is absent.
 *
 * No `delta`, even when the request carries `?since=`: an empty delta is an ANSWER — "Nothing
 * changed while you were away" (`lib/deltaLine.ts`) — and nothing here knows what changed. Absent,
 * the app shows the composite's own `since` line, which is empty.
 */
function emptyToday(): TodayComposite {
  const today = todayKey();
  const at = now().toISOString();
  return {
    seenAt: at,
    generatedAt: at,
    dayName: weekdayLong(today),
    dateLabel: formatMonthDay(today),
    todayDate: today,
    since: "",
    health: { ok: true, spend: "" },
    needsYou: [],
    calendar: { events: [], gaps: [] },
    tasks: [],
    glance: { habits: "", people: 0, money: "", goals: 0 },
    close: { habits: [], logs: [] },
    endLine: "",
  };
}

function emptyHabitStats({ req }: Asked): HabitStats {
  const asked = req.query?.period as HabitPeriod | undefined;
  return { period: asked != null && PERIODS.includes(asked) ? asked : "week", earliest: todayKey(), habits: [] };
}

export const EMPTY_TODAY = emptyToday;

const EMPTY: Partial<Record<ShapeName, (asked: Asked) => unknown>> = {
  TodayComposite: emptyToday,
  ReviewComposite: () => ({ anchor: todayKey(), weekThatWas: { decisions: 0, promisesKept: 0, timeByFocus: {} }, weekAhead: { habitsPct: 0, spend: "" }, threePriorities: [] }),
  ActionList: () => [],
  CalendarWindow: () => ({ events: [], gaps: [] }),
  WaitingList: () => [],
  TaskList: () => [],
  UsageSummary: () => ({ rows: [], totals: [], costAud: 0 }),
  AttachmentList: () => ({ attachments: [] }),
  BrainItemList: () => [],
  BrainItemVersionList: () => [],
  BrainSearchResult: () => ({ answer: null, results: [] }),
  SearchResponse: ({ req }) => ({ q: req.query?.q ?? "", groups: [], truncated: false }),
  MemoryHistoryList: () => [],
  ReplyList: () => [],
  ChatThread: () => ({ turns: [] }),
  MemoryProposalList: () => [],
  MemoryHitRate: () => ({ right: 0, total: 0, wrongSources: 0, misses: 0, rulesMisled: 0 }),
  LifeComposite: () => ({ goals: [], habits: [], habitLogs: [], people: [], money: [], moneyDue: [], learning: [] }),
  GoalList: () => [],
  HabitList: () => [],
  HabitStats: emptyHabitStats,
  PersonList: () => [],
  MoneyComposite: () => ({ rows: [], due: [], feedNote: "" }),
  HealthComposite: () => null,
  LearningList: () => [],
  // the mock's rule for a day with no runs is 100% (`data/mock/handlers/agents.ts`)
  AgentSummary: () => ({ runsToday: 0, successPct: 100, spendToday: 0, issues: 0, health: "healthy", heartbeat: { every: "", last: now().toISOString() } }),
  Spend: () => ({ month: { spent: 0, cap: 0, landing: 0 }, caps: [] }),
  AgentIssueList: () => [],
  FeedEventList: () => [],
  SecurityCheckList: () => [],
  AgentRunList: () => [],
  ScheduleList: () => [],
  AutonomyRuleList: () => ({ rules: [] }),
  NotificationGroupList: () => [],
  LabelAuditRowList: () => [],
};

/** Single records: nothing to find until a source produces one. */
const BY_ID: ShapeName[] = ["ActionItem", "CalEvent", "Task", "BrainItem", "GoalComposite", "LearningItem", "AgentIssue", "Attachment", "SectionConfig"];

export function emptyFor(shape: ShapeName, asked: Asked): TransportResponse {
  const make = EMPTY[shape];
  if (make != null) return ok(make(asked));
  if (BY_ID.includes(shape)) return { status: 404, json: { reason: "not found" } };
  return NOT_CONNECTED;
}
