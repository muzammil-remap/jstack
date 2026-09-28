/** §4.7 Life. */
import { addDays, atTime, dayKey, monthDays } from "@/lib/time";
import * as db from "@/data/mock/db";
import { emitServerEvent } from "@/data/mock/events";
import { err, inFocus, ok } from "@/data/mock/util";
import type { Goal, GoalComposite, GoalStatus, Habit, HabitLog, HabitPeriod, HabitStats, Person } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

/** The four the contract names, as a value the validator can read — a status
 * added to the union later fails this list rather than slipping through as an
 * unknown string (hard rule 17). */
const GOAL_STATUSES: GoalStatus[] = ["active", "behind", "done", "dropped"];

/** Still in play. `behind` is very much in play — it is the one you most want
 * on the card — so "active" here means "not archived", not the enum member. */
const isActive = (g: Goal) => g.status === "active" || g.status === "behind";

/** On the tracking list. An archived habit is still a habit and still has
 * every log it ever had — it is only off the list (LH-06). */
const isListed = (h: Habit) => h.archived !== true;

/** When a goal left the active set, for ordering the archive. Its last history
 * entry, falling back to `setAt` for a fixture archived before histories were
 * kept — never `Date.now()`, which would reorder the list on every read. */
const archivedAt = (g: Goal) => g.history.at(-1)?.at ?? g.setAt;

export function getLife(req: TransportRequest): TransportResponse {
  const state = db.get();
  const focus = req.query?.focus;
  const todayStr = dayKey(db.now());
  return ok({
    // LG-1: the ACTIVE set, the same as `GET /goals`. The composite and the
    // dedicated route are a pair, and a pair that disagrees is worse than
    // either being wrong on its own — the Life card loads through this one,
    // so an archived goal came back here after `GET /goals` had learnt to
    // filter it out. `tests/unit/goals.test.ts` asserts the two agree.
    goals: inFocus(state.goals.filter(isActive), focus),
    // LH-2: the TRACKING list. An archived habit keeps its record and its
    // logs and stops being listed, and the composite is what the Life card
    // and Today's chips load through — so it filters with `GET /habits`
    // rather than beside it (the pair rule, qa A-2).
    habits: state.habits.filter(isListed),
    // CONTRACT_v2.md §4.7: "habits (today)" — today's logs ride along so a
    // fresh load (Life's own screen, or Today's via useLifeStore) shows
    // what's already done without a separate logs fetch that doesn't
    // exist on the wire (B-22: habitLogs previously never loaded at all,
    // so a fresh page always showed 0/9 regardless of seeded/prior logs).
    habitLogs: state.habitLogs.filter((l) => l.date === todayStr),
    people: inFocus(state.people, focus),
    money: state.moneyRows,
    moneyDue: state.moneyDue,
    learning: inFocus(state.learning, focus),
  });
}

/** The goals still in play. `done` and `dropped` are the archive, and they
 * answer on `/goals/history` — a card that listed everything ever set would
 * stop being the thing you look at to know what you are doing (LG-01). */
export function getGoals(req: TransportRequest): TransportResponse {
  return ok(inFocus(db.get().goals.filter(isActive), req.query?.focus));
}

/** LG-04: everything that is no longer in play, newest archived first. The
 * whole record comes back, history included — the archive exists to be read,
 * not counted. */
export function getGoalsHistory(req: TransportRequest): TransportResponse {
  const rows = db
    .get()
    .goals.filter((g) => !isActive(g))
    .slice()
    .sort((a, b) => archivedAt(b).localeCompare(archivedAt(a)));
  return ok(inFocus(rows, req.query?.focus));
}

/**
 * LG-02: one goal WITH what hangs off it.
 *
 * The ids resolve here rather than in the client, so the detail does not need
 * the tasks tab to have been visited and the two lists cannot disagree with
 * the ids that produced them. Order follows `taskIds`/`deliverableIds` rather
 * than the tables', because the order a goal names its tasks in is a fact
 * about the goal.
 */
export function getGoal(_req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const goal = inFocus(state.goals, undefined).find((g) => g.id === id);
  if (goal == null) return err(404, "not found");
  const find = <T extends { id: string }>(rows: T[], ids: string[]) => ids.map((x) => rows.find((r) => r.id === x)).filter((r): r is T => r != null);
  return ok<GoalComposite>({
    goal,
    tasks: find(state.tasks, goal.taskIds),
    deliverables: find(state.files, goal.deliverableIds),
  });
}

/**
 * LG-01/LG-04: the set is replaced whole, and the server decides what
 * archiving means.
 *
 * Two ways a goal leaves the active card, and both land here: its status is
 * set to `done` or `dropped`, or it is simply REMOVED from the list. The
 * second is what the editor's "remove" does, and treating it as a delete
 * would throw away a history somebody may want — so a removal is an archive
 * with `dropped`, and nothing on this route destroys a record.
 *
 * The history entry and the brain item are composed HERE rather than by the
 * caller: the client does not own the clock (D-1), and two clients archiving
 * a goal would otherwise write two different sentences for the same event.
 */
export function putGoals(req: TransportRequest): TransportResponse {
  const state = db.get();
  const body = (req.body ?? {}) as { goals?: unknown };
  const next = body.goals;
  if (!Array.isArray(next)) return err(422, "a list of goals is required", { field: "goals" });
  for (const g of next as Goal[]) {
    if (typeof g?.id !== "string" || typeof g?.text !== "string" || g.text.trim() === "") {
      return err(422, "every goal needs an id and a title", { field: "goals" });
    }
    if (!GOAL_STATUSES.includes(g.status)) return err(422, "no such status", { field: "status" });
  }

  const now = db.now();
  const at = now.toISOString();
  const submitted = next as Goal[];

  // A4R5-02: absence archives, but only among the goals the CALLER MAY READ. A
  // session can only ever submit what its silos let it see (MU-02), so a goal
  // outside them was never in its list to leave — judging absence against the
  // whole household let Joce's first goal archive every one of Josh's. And a
  // caller cannot write into a silo it cannot read, whether by changing a goal
  // it cannot see or by filing a new one there.
  const readable = new Set(inFocus(state.goals, undefined).map((g) => g.id));
  const silos = db.currentSilos();
  for (const g of submitted) {
    const existing = state.goals.find((e) => e.id === g.id);
    if (existing != null && !readable.has(g.id)) return err(403, "that goal is not yours to change");
    if (existing == null && g.labels != null && !silos.includes(g.labels.silo)) {
      return err(403, "a new goal is filed in one of your own silos", { field: "labels.silo" });
    }
  }
  const wasActive = new Map(state.goals.filter((g) => isActive(g) && readable.has(g.id)).map((g) => [g.id, g]));

  // a goal the editor dropped off the list is archived, not deleted
  const removed = [...wasActive.values()]
    .filter((g) => !submitted.some((n) => n.id === g.id))
    .map((g) => ({ ...g, status: "dropped" as const }));

  const merged = [...submitted, ...removed].map((g) => {
    const before = wasActive.get(g.id);
    if (before == null || isActive(g)) return g;
    // it left the active set on this write: record what happened, once
    return { ...g, history: [...g.history, { at, event: g.status }] };
  });

  // Every goal this write could not have held stays exactly as it was.
  // A4R4-01: the ARCHIVE — the client only ever holds the active set (`GET
  // /life` and `GET /goals` both answer `goals.filter(isActive)`), so assigning
  // `merged` alone deleted the whole archive on every save, and `GET
  // /goals/history` showed whatever had survived the last write. A4R5-02: every
  // goal OUTSIDE THE CALLER'S SILOS, active or not — they were never its to send.
  const untouched = state.goals.filter((g) => !wasActive.has(g.id) && !submitted.some((n) => n.id === g.id));
  const archivedNow = merged.filter((g) => !isActive(g) && wasActive.has(g.id));
  state.goals = [...merged, ...untouched];

  for (const g of archivedNow) {
    state.brainItems = [
      {
        id: `goal-archived-${g.id}-${now.getTime()}`,
        text: `Goal archived · ${g.text}`,
        at,
        meta: "Life · goals",
        source: "system",
        routed: ["→ goals"],
        labels: g.labels,
        setAt: at,
        focus: g.focus,
      },
      ...state.brainItems,
    ];
  }
  if (archivedNow.length > 0) emitServerEvent({ kind: "brain", ids: archivedNow.map((g) => `goal-archived-${g.id}-${now.getTime()}`), at });

  return ok(inFocus(state.goals.filter(isActive), req.query?.focus));
}

/** The tracking list. `?includeArchived=true` is what the habit editor's "Add
 * habit" asks for, so the ones Josh has put away are offered back to him
 * (LH-07); nothing else wants them. */
export function getHabits(req: TransportRequest): TransportResponse {
  const all = db.get().habits;
  return ok(req.query?.includeArchived === "true" ? all : all.filter(isListed));
}

/**
 * LH-06/LH-07 — archive, restore, rename and reorder, as one set.
 *
 * IT REFUSES A LIST THAT HAS DROPPED A HABIT. That is the row's whole promise:
 * Josh asked that deleting a habit keep its data, and a route that silently
 * accepted a shorter list would make the one gesture that loses it the easiest
 * one to perform. Archiving is the way out, and it is a field.
 *
 * `archivedAt` is stamped HERE and only on the write that archives — a second
 * save that leaves a habit archived must not move the date, or "archived three
 * days ago" resets itself every time anything else on the list is edited. The
 * client does not own the clock either way (D-1).
 *
 * `sort` is renumbered from the ORDER of the list rather than trusted from the
 * body: two habits carrying the same number would otherwise render in whatever
 * order the table happened to hold them.
 */
export function putHabits(req: TransportRequest): TransportResponse {
  const state = db.get();
  const body = (req.body ?? {}) as { habits?: unknown };
  const next = body.habits;
  if (!Array.isArray(next)) return err(422, "a list of habits is required", { field: "habits" });
  for (const h of next as Habit[]) {
    if (typeof h?.id !== "string" || typeof h?.name !== "string" || h.name.trim() === "") {
      return err(422, "every habit needs an id and a name", { field: "habits" });
    }
  }

  const submitted = next as Habit[];
  const missing = state.habits.filter((h) => !submitted.some((n) => n.id === h.id));
  if (missing.length > 0) {
    // named, so the dialog can say WHICH one rather than "something went wrong"
    return err(422, `${missing[0].name} cannot be removed — archive it instead, and it keeps its history`, { field: "habits" });
  }

  const at = db.now().toISOString();
  const was = new Map(state.habits.map((h) => [h.id, h]));
  state.habits = submitted.map((h, i) => {
    const before = was.get(h.id);
    const archived = h.archived === true;
    return {
      ...h,
      sort: i + 1,
      archived,
      // stamped on the write that archives; kept on later ones; cleared on
      // restore, so a listed habit never claims to be put away
      archivedAt: archived ? (before?.archived === true ? before.archivedAt : at) : undefined,
    };
  });

  return ok(state.habits.filter(isListed));
}

export function postHabitLog(req: TransportRequest, habitId: string): TransportResponse {
  const state = db.get();
  const body = (req.body ?? {}) as { date: string; done: boolean };
  const idx = state.habitLogs.findIndex((l) => l.habitId === habitId && l.date === body.date);
  const log: HabitLog = { habitId, date: body.date, done: body.done };
  if (idx === -1) state.habitLogs = [...state.habitLogs, log];
  else state.habitLogs[idx] = log;
  return ok(log);
}

/**
 * LH-01 — the window a period asks about, as DAY KEYS.
 *
 * `month` and `year` are CALENDAR periods anchored on a day, not "the last 30"
 * and "the last 365": the grid Josh asked for is a calendar month with its
 * month name and its ‹ ›, and a rolling window cannot be paged through
 * (resolution #17). `anchor` was declared on the route and never read until
 * this row — the same shape as `files.recentDays` before X-1.
 *
 * `week` stays rolling: it is the seven cells beside a habit's name on the Life
 * card (LH-05), which are the last seven days and not Monday to Sunday.
 */
function windowKeys(period: HabitPeriod, anchor: string, todayKeyValue: string): string[] {
  if (period === "week") return [6, 5, 4, 3, 2, 1, 0].map((n) => addDays(todayKeyValue, -n));
  if (period === "month") return monthDays(anchor);
  if (period === "year") {
    const first = `${anchor.slice(0, 4)}-01-01`;
    const keys: string[] = [];
    for (let k = first; k.slice(0, 4) === first.slice(0, 4); k = addDays(k, 1)) keys.push(k);
    return keys;
  }
  return [];
}

/**
 * The current and longest runs of DONE days, counted over every log the habit
 * has and never over the window (LH-04).
 *
 * A day with no log breaks a run exactly as a logged miss does — not doing the
 * thing is not doing the thing, whatever was written down. The one exception is
 * TODAY: an unfinished today does not break a streak, because the day is not
 * over, so the current run is counted from today when today is done and from
 * yesterday when it is not.
 */
function streakFor(doneByDay: Map<string, boolean>, todayKeyValue: string, earliest: string): { current: number; longest: number } {
  let current = 0;
  let from = doneByDay.get(todayKeyValue) === true ? todayKeyValue : addDays(todayKeyValue, -1);
  while (from >= earliest && doneByDay.get(from) === true) {
    current += 1;
    from = addDays(from, -1);
  }

  let longest = 0;
  let run = 0;
  for (let k = earliest; k <= todayKeyValue; k = addDays(k, 1)) {
    run = doneByDay.get(k) === true ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return { current, longest };
}

export function getHabitStats(req: TransportRequest): TransportResponse {
  const state = db.get();
  const period = (req.query?.period ?? "week") as HabitPeriod;
  const todayKeyValue = dayKey(db.now());
  // an anchor outside the log is not an error, it is an empty month — the ‹ ›
  // are bounded by the client, and a server that 422'd here would turn a
  // paging mistake into a broken dialog
  const anchor = req.query?.anchor != null && req.query.anchor !== "" ? req.query.anchor : todayKeyValue;

  const allKeys = state.habitLogs.map((l) => l.date).sort();
  const earliest = allKeys[0] ?? todayKeyValue;

  // EVERY habit, archived ones included: LH-06 promises their stats still
  // compute, and making that true by construction is better than a branch
  // somebody has to remember. The row says which it is; the views filter.
  const habits = state.habits.map((h) => {
    const doneByDay = new Map<string, boolean>();
    for (const l of state.habitLogs) if (l.habitId === h.id) doneByDay.set(l.date, l.done);

    const keys = period === "all" ? [...doneByDay.keys()].sort() : windowKeys(period, anchor, todayKeyValue);
    const days: Record<string, boolean> = {};
    for (const k of keys) if (doneByDay.has(k)) days[k] = doneByDay.get(k)!;

    // `possible` never counts a day that has not happened: a month grid opened
    // on the 9th would otherwise report "18 of 30" against twenty-one days that
    // do not exist yet, and read as a failure rather than a month in progress.
    const past = keys.filter((k) => k <= todayKeyValue);
    return {
      id: h.id,
      name: h.name,
      archived: h.archived === true,
      days,
      streak: streakFor(doneByDay, todayKeyValue, earliest),
      done: past.filter((k) => days[k] === true).length,
      possible: past.length,
    };
  });

  return ok<HabitStats>({ period, earliest, habits });
}

export function getPeople(req: TransportRequest): TransportResponse {
  return ok(inFocus(db.get().people, req.query?.focus));
}

export function postPersonAct(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.people.findIndex((p) => p.id === id);
  if (idx === -1) return err(404, "not found");
  const body = (req.body ?? {}) as { action: Person["verb"]["action"] };
  state.people[idx] = { ...state.people[idx], verb: { ...state.people[idx].verb, action: body.action } };
  return ok(state.people[idx]);
}

export function getMoney(_req: TransportRequest): TransportResponse {
  const state = db.get();
  return ok({ rows: state.moneyRows, due: state.moneyDue, feedNote: "EA-entered until the Redbark feed lands (V2.1)" });
}

export function getHealth(_req: TransportRequest): TransportResponse {
  return ok(null);
}

/** OP-06: one learning row, with the body the viewer renders or the url the
 * external-link confirmation names. */
export function getLearningItem(_req: TransportRequest, id: string): TransportResponse {
  const item = db.get().learning.find((l) => l.id === id);
  return item == null ? err(404, "not found") : ok(item);
}

export function getLearning(req: TransportRequest): TransportResponse {
  let rows = inFocus(db.get().learning, req.query?.focus);
  // LL-01/WPG-1c: `GET /learning?q=` searches title, meta, body and kind —
  // the words a person can actually see on the row, not only the ones the
  // record happens to carry in a body — so "podcast" finds the listen item
  // and nothing else, not the whole list. le2's "podcast" sits in its meta
  // ("podcast · half listened…"), not its title/body/kind, which is exactly
  // the case meta being left out missed.
  const q = req.query?.q?.toLowerCase();
  if (q) {
    rows = rows.filter((item) =>
      item.title.toLowerCase().includes(q) ||
      item.meta.toLowerCase().includes(q) ||
      (item.body ?? "").toLowerCase().includes(q) ||
      (item.kind ?? "").toLowerCase().includes(q));
  }
  return ok(rows);
}

export function getLifeSectionConfig(_req: TransportRequest, id: string): TransportResponse {
  const config = db.get().lifeSectionConfigs[id];
  return config ? ok(config) : err(404, "not found");
}

export function putLifeSectionConfig(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  if (state.lifeSectionConfigs[id] == null) return err(404, "not found");
  state.lifeSectionConfigs[id] = { ...state.lifeSectionConfigs[id], ...(req.body as Record<string, unknown>), managedByEa: false };
  return ok(state.lifeSectionConfigs[id]);
}

export function revertLifeSectionConfig(_req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const original = state.lifeSectionConfigsOriginal[id];
  if (state.lifeSectionConfigs[id] == null || original == null) return err(404, "not found");
  state.lifeSectionConfigs[id] = { ...original, managedByEa: true };
  return ok(state.lifeSectionConfigs[id]);
}
