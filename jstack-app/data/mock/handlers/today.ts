/** §4.2 Today: the composite, review, journal. */
import { defaultLabelsFor } from "@/data/mock/labelRules";
import * as db from "@/data/mock/db";
import { gapsFor } from "@/data/mock/handlers/calendar";
import { getActions } from "@/data/mock/handlers/decisions";
import { addDays, dayKey, formatMonthDay, hourOfDay, weekdayLong } from "@/lib/time";
import { inFocus, nextId, ok } from "@/data/mock/util";
import type { BrainItem, Delta, TodayComposite } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";


/**
 * What moved since `seen`, as ids (OF-09, CD-02).
 *
 * The sentence and the `delta` block are both derived from this one pass, so
 * the line can never claim a number the delta does not name — the second-copy
 * failure V2.1 kept finding (rule 16). Ids rather than counts because §4.12's
 * delta is ids: the full body is returned either way, and what a client needs
 * is which of the records it already holds are new or moved.
 */
function changesSince(state: ReturnType<typeof db.get>, seen: Date): { answered: string[]; delegated: string[]; laters: string[] } {
  const after = (iso: string | undefined) => iso != null && new Date(iso).getTime() > seen.getTime();
  return {
    answered: state.actions.filter((a) => a.history.some((h) => h.via !== "app" && after(h.at))).map((a) => a.id),
    delegated: state.tasks.filter((t) => t.delegated?.state === "done" && t.activity.some((e) => after(e.at))).map((t) => t.id),
    laters: state.actions.filter((a) => a.state === "open" && after(a.laterUntil)).map((a) => a.id),
  };
}

/**
 * `removed` is always empty and that is the truth, not a stub: this mock never
 * deletes a record a client could be holding — a decision is answered, a task
 * is completed, and both keep their id. A backend that does delete fills it.
 */
function deltaSince(state: ReturnType<typeof db.get>, seen: Date): Delta {
  const { answered, delegated, laters } = changesSince(state, seen);
  return { added: laters, changed: [...answered, ...delegated], removed: [] };
}

/**
 * D2-02: what actually happened since this person last looked.
 *
 * The line used to read "Since 9pm: 2 things landed while you slept" with the
 * two written into the string. It was right on the day the fixture was
 * authored and a guess every day after — the same defect as a fixture naming
 * a weekday it does not mean (CD-18), one layer up. Every number here is
 * counted from the records; the phrase is assembled from the numbers, so it
 * cannot state something the data does not.
 */
function sinceLine(state: ReturnType<typeof db.get>, now: Date, openProposals: number): string {
  const seen = new Date(state.seenAt);
  const { answered, delegated, laters } = changesSince(state, seen);
  const landed = answered.length + delegated.length + laters.length;

  // Last night at 9pm and this time yesterday are both "an earlier date", and
  // a person means different things by them: "since 9pm" is the overnight the
  // demo opens on, "since yesterday" is a whole day away (D2-02).
  //
  // Compared as CALENDAR DAYS plus the hour, not as elapsed hours. An
  // elapsed-hours rule reads "since 9pm" or "since yesterday" for the same
  // fixture depending on what time of day the suite happens to run, which is
  // a test that passes in the morning and fails after dinner.
  // D-1: day KEYS, and the hour through `lib/time.ts`. This compared UTC
  // calendar days and read a UTC hour, so for the ten hours either side of
  // midnight it counted the wrong number of days between two instants and
  // named an hour nobody's clock had shown.
  const seenKey = dayKey(seen);
  const nowKey = dayKey(now);
  const daysAway = seenKey === nowKey ? 0 : addDays(seenKey, 1) === nowKey ? 1 : 2;
  const seenHour = Math.floor(hourOfDay(seen));
  const lastNight = daysAway === 1 && seenHour >= 18;
  const prefix = daysAway === 0 || lastNight ? `Since ${seenHour % 12 || 12}pm` : "Since yesterday";

  const things = landed === 1 ? "1 thing landed" : `${landed} things landed`;
  const waiting = openProposals === 0 ? "" : `, ${openProposals} memory proposal${openProposals === 1 ? "" : "s"} waiting`;
  return `${prefix}: ${things} while you slept${waiting}.`;
}

export function getToday(req: TransportRequest): TransportResponse {
  const focus = req.query?.focus;
  const state = db.get();
  const now = db.now();
  const needsYou = (getActions({ ...req, query: { ...req.query, state: "open" } }).json as TodayComposite["needsYou"]) ?? [];

  const todayStr = dayKey(now);
  const events = inFocus(state.calendarEvents, focus).filter((e) => dayKey(new Date(e.startsAt)) === todayStr);
  const gaps = gapsFor(todayStr, events);

  const tasks = inFocus(state.tasks, focus)
    .filter((t) => t.status !== "done")
    .slice(0, 3);

  const habitsToday = state.habitLogs.filter((l) => l.date === todayStr && l.done);
  // LG-1: the status IS the tone now — `statusTone` was a second field
  // saying what `status` already said, and the two could disagree.
  const goalsBehind = state.goals.filter((g) => g.status === "behind").length;
  const openProposals = state.memoryProposals.filter((p) => p.state === "open").length;

  const composite: TodayComposite = {
    seenAt: state.seenAt,
    generatedAt: now.toISOString(),
    dayName: weekdayLong(todayStr),
    // dateLabel is DISPLAY, written the way README Content specifies ("Dates:
    // `4 September`, `19 Sep` in tight spaces") — it printed `2026-09-04`
    // beside "Friday" in the row-21 device pass (ux-review D26). todayDate is
    // the MACHINE key the surfaces filter by; the two were one field until
    // B-55, which is how making the label human emptied the habit chips.
    dateLabel: formatMonthDay(todayStr),
    todayDate: todayStr,
    // TD-01: the live count is `openProposals` — Header appends its own
    // "Review the week" link after this text (BUGLOG_v2.md A-20).
    since: sinceLine(state, now, openProposals),
    // §4.12: only when the request asked. A cold open has missed nothing, and
    // an absent block says that more honestly than three empty arrays.
    ...(req.query?.since != null ? { delta: deltaSince(state, new Date(req.query.since)) } : {}),
    health: { ok: true, spend: "$61 of $200 this month" },
    needsYou,
    // an answered insight still renders (collapsed to its result line,
    // TD-03) rather than vanishing — there is one insight in Stage 1
    // scope, so "open, else whatever's there" is enough (BUGLOG_v2.md A-18).
    insight: state.insights.find((i) => i.state === "open") ?? state.insights[0],
    calendar: { events, gaps },
    tasks,
    glance: {
      habits: `${habitsToday.length}/${state.habits.length}`,
      people: state.people.length,
      money: `${state.moneyRows.filter((m) => m.over).length} over budget`,
      goals: goalsBehind,
    },
    close: { habits: state.habits, logs: state.habitLogs.filter((l) => l.date === todayStr) },
    // DC-10 — the Needs-you end line; server-computed like every other
    // decision-card text (BUGLOG_v2.md B-09: this was a stale placeholder
    // that never matched DC-10's required copy).
    endLine: needsYou.length > 0 ? "That's all until 4pm. Two more return then." : "Nothing needs you. Two more return at 4pm.",
  };
  return ok(composite);
}

export function getReview(_req: TransportRequest): TransportResponse {
  const state = db.get();
  const now = db.now();
  return ok({
    anchor: dayKey(now),
    weekThatWas: {
      decisions: state.actions.filter((a) => a.state === "answered").length,
      promisesKept: state.people.filter((p) => p.verb.action === "done").length,
      timeByFocus: { work: 12, family: 8, personal: 4 },
    },
    weekAhead: { habitsPct: 0.7, spend: "$61 of $200" },
    threePriorities: state.tasks.filter((t) => t.priority === "high" && t.status !== "done").slice(0, 3).map((t) => t.title),
  });
}

export function postJournal(req: TransportRequest): TransportResponse {
  const state = db.get();
  const body = (req.body ?? {}) as { text: string; source: "voice" | "typed"; offlineId?: string };
  const now = db.now();
  const item: BrainItem = {
    // A4R7-01: named by the capture's own `offlineId`, as `dump-${offlineId}` is.
    // Named after the millisecond, two lines replayed back to back were filed
    // under ONE id — one row opened the other, and an edit to one overwrote both.
    id: body.offlineId != null && body.offlineId !== "" ? `journal-${body.offlineId}` : nextId("journal-"),
    text: body.text,
    at: now.toISOString(),
    meta: `${body.source} · Close the day`,
    source: "journal",
    routed: ["→ journal"],
    // DATA_LABELS.md §3's journal default, from the rules rather than a
    // copy of them — the mock is the server, so it applies its own scheme
    labels: defaultLabelsFor({ noun: "brain", category: "Journal" }),
    setAt: now.toISOString(),
    focus: "personal",
  };
  state.brainItems = [item, ...state.brainItems];
  return ok(item);
}
