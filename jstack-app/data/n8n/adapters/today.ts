/**
 * `GET /today` on the n8n build: the Today composite assembled, as the mock's `getToday` builds it
 * (`data/mock/handlers/today.ts`), from the live sources — the calendar, the tasks, the Needs-you
 * store and the Life records.
 *
 *  - `calendar` is exactly `GET /calendar?view=today`'s answer for today, through the same
 *    adapter and the same request body, so the grid and this share one webhook call (the 30-second
 *    sharing in `callWebhook`);
 *  - `tasks` is the first three tasks not done, in focus, in Twenty's order — the mock's rule;
 *  - `needsYou` is exactly `GET /actions`'s answer: the open cards in focus, by rank, five at most;
 *  - the close-the-day chips are the habits being tracked and today's logs, and the glance counts
 *    the habits done today of those tracked and the goals behind (the mock's glance);
 *  - everything with no source yet stays at the contract's empty value (`data/n8n/empty.ts`):
 *    no insight, the glance's people and money at nothing, no `since` or end line, and no
 *    `delta` — an empty one would say "Nothing changed while you were away".
 *
 * If any source fails, the composite fails with its status: Today cannot be half-known under one
 * response, and an empty part would read as "nothing on the calendar", "nothing to do" or "nothing
 * needs you".
 */
import { todayKey } from "@/lib/time";
import type { ActionItem, LifeComposite, Task, TodayComposite } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { callWebhook } from "@/data/n8n/client";
import { EMPTY_TODAY } from "@/data/n8n/empty";
import { inFocus } from "@/data/n8n/focus";
import type { Asked } from "@/data/n8n/registry";
import { actionsAnswers } from "./actions";
import { lifeRecords } from "./records";
import { calendarAdapter } from "./calendar";
import { tasksAnswers } from "./tasks";

const TOP_TASKS = 3;

export async function todayAnswer(asked: Asked): Promise<TransportResponse> {
  const focus = asked.req.query?.focus;
  const calendarAsked: Asked = { req: { method: "GET", path: "/calendar", query: { view: "today", anchor: todayKey(), focus } }, params: [] };
  const actionsAsked: Asked = { req: { method: "GET", path: "/actions", query: { focus } }, params: [] };
  const [calendar, tasks, actions, life] = await Promise.all([
    callWebhook("calendar", calendarAdapter.body(calendarAsked)).then((data) => calendarAdapter.toContract(data, calendarAsked)),
    tasksAnswers.all(),
    actionsAnswers.list(actionsAsked),
    lifeRecords(focus),
  ]);
  for (const part of [calendar, tasks, actions]) if (part.status !== 200) return part;
  const empty = EMPTY_TODAY();
  const composite: TodayComposite = {
    ...empty,
    needsYou: actions.json as ActionItem[],
    glance: { ...empty.glance, habits: `${life.logsToday.filter((l) => l.done && life.habits.some((h) => h.id === l.habitId)).length}/${life.habits.length}`, goals: life.goals.filter((g) => g.status === "behind").length },
    close: { habits: life.habits, logs: life.logsToday },
    calendar: calendar.json as TodayComposite["calendar"],
    tasks: inFocus(tasks.json as Task[], focus)
      .filter((t) => t.status !== "done")
      .slice(0, TOP_TASKS),
  };
  return { status: 200, json: composite };
}

/** `GET /life` on the n8n build: the mock's `getLife` — the active goals in focus, the habits being
 * tracked and today's logs, from the records store. People, money, due bills and learning have no
 * source yet and stay empty. */
export async function lifeAnswer(asked: Asked): Promise<TransportResponse> {
  const life = await lifeRecords(asked.req.query?.focus);
  const composite: LifeComposite = { goals: life.goals, habits: life.habits, habitLogs: life.logsToday, people: [], money: [], moneyDue: [], learning: [] };
  return { status: 200, json: composite };
}
