/**
 * `GET /today` on the n8n build: the Today composite assembled, as the mock's `getToday` builds it
 * (`data/mock/handlers/today.ts`), from the three live sources — the calendar, the tasks and the
 * Needs-you store.
 *
 *  - `calendar` is exactly `GET /calendar?view=today`'s answer for today, through the same
 *    adapter and the same request body, so the grid and this share one webhook call (the 30-second
 *    sharing in `callWebhook`);
 *  - `tasks` is the first three tasks not done, in focus, in Twenty's order — the mock's rule;
 *  - `needsYou` is exactly `GET /actions`'s answer: the open cards in focus, by rank, five at most;
 *  - everything with no source yet stays at the contract's empty value (`data/n8n/empty.ts`):
 *    no insight, the glance and the close-the-day at nothing, no `since` or end line, and no
 *    `delta` — an empty one would say "Nothing changed while you were away".
 *
 * If any source fails, the composite fails with its status: Today cannot be half-known under one
 * response, and an empty part would read as "nothing on the calendar", "nothing to do" or "nothing
 * needs you".
 */
import { todayKey } from "@/lib/time";
import type { ActionItem, Task, TodayComposite } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { callWebhook } from "@/data/n8n/client";
import { EMPTY_TODAY } from "@/data/n8n/empty";
import { inFocus } from "@/data/n8n/focus";
import type { Asked } from "@/data/n8n/registry";
import { actionsAnswers } from "./actions";
import { calendarAdapter } from "./calendar";
import { tasksAnswers } from "./tasks";

const TOP_TASKS = 3;

export async function todayAnswer(asked: Asked): Promise<TransportResponse> {
  const focus = asked.req.query?.focus;
  const calendarAsked: Asked = { req: { method: "GET", path: "/calendar", query: { view: "today", anchor: todayKey(), focus } }, params: [] };
  const actionsAsked: Asked = { req: { method: "GET", path: "/actions", query: { focus } }, params: [] };
  const [calendar, tasks, actions] = await Promise.all([
    callWebhook("calendar", calendarAdapter.body(calendarAsked)).then((data) => calendarAdapter.toContract(data, calendarAsked)),
    tasksAnswers.all(),
    actionsAnswers.list(actionsAsked),
  ]);
  for (const part of [calendar, tasks, actions]) if (part.status !== 200) return part;
  const composite: TodayComposite = {
    ...EMPTY_TODAY(),
    needsYou: actions.json as ActionItem[],
    calendar: calendar.json as TodayComposite["calendar"],
    tasks: inFocus(tasks.json as Task[], focus)
      .filter((t) => t.status !== "done")
      .slice(0, TOP_TASKS),
  };
  return { status: 200, json: composite };
}
