/**
 * `GET /today` on the n8n build: the Today composite assembled, as the mock's `getToday` builds it
 * (`data/mock/handlers/today.ts`), from the two live sources — the calendar and the tasks.
 *
 *  - `calendar` is exactly `GET /calendar?view=today`'s answer for today, through the same
 *    adapter and the same request body, so the grid and this share one webhook call (the 30-second
 *    sharing in `callWebhook`);
 *  - `tasks` is the first three tasks not done, in focus, in Twenty's order — the mock's rule;
 *  - everything with no source yet stays at the contract's empty value (`data/n8n/empty.ts`):
 *    no Needs-you cards, no insight, the glance and the close-the-day at nothing, no `since` or end
 *    line, and no `delta` — an empty one would say "Nothing changed while you were away".
 *
 * If either source fails, the composite fails with its status: Today cannot be half-known under one
 * response, and an empty half would read as "nothing on the calendar" or "nothing to do".
 */
import { todayKey } from "@/lib/time";
import type { Task, TodayComposite } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { callWebhook } from "@/data/n8n/client";
import { EMPTY_TODAY } from "@/data/n8n/empty";
import { inFocus } from "@/data/n8n/focus";
import type { Asked } from "@/data/n8n/registry";
import { calendarAdapter } from "./calendar";
import { tasksAnswers } from "./tasks";

const TOP_TASKS = 3;

export async function todayAnswer(asked: Asked): Promise<TransportResponse> {
  const focus = asked.req.query?.focus;
  const calendarAsked: Asked = { req: { method: "GET", path: "/calendar", query: { view: "today", anchor: todayKey(), focus } }, params: [] };
  const [calendar, tasks] = await Promise.all([
    callWebhook("calendar", calendarAdapter.body(calendarAsked)).then((data) => calendarAdapter.toContract(data, calendarAsked)),
    tasksAnswers.all(),
  ]);
  if (calendar.status !== 200) return calendar;
  if (tasks.status !== 200) return tasks;
  const composite: TodayComposite = {
    ...EMPTY_TODAY(),
    calendar: calendar.json as TodayComposite["calendar"],
    tasks: inFocus(tasks.json as Task[], focus)
      .filter((t) => t.status !== "done")
      .slice(0, TOP_TASKS),
  };
  return { status: 200, json: composite };
}
