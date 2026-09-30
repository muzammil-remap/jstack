/**
 * The task writes, through the `tasks-write` webhook (JSTACK-DASH-tasks-write): what Twenty's writer
 * can hold — a task's title, its status and its due date — and a refusal for everything else.
 *
 *  - `PATCH /tasks/{id}` (the card's fields, a tick undone, the Gantt, a Board move) writes the
 *    fields Twenty holds; a patch that names ANY other field is refused whole, `422 { field,
 *    reason }` naming it, so the card says why under the control and nothing is half-saved;
 *  - `POST /tasks/{id}/complete` is the status DONE (Twenty's tasks have no subtasks to close);
 *  - `PUT /tasks/{id}` — only the undo of a completion sends it — puts back the title, the status
 *    and the due date; a task that was waiting goes back to the status Twenty had for it;
 *  - `POST /tasks` creates one, deduped on its `offlineId` (the outbox's replay), refusing what a
 *    new task would lose — a goal link, a project, dates, an owner other than Josh, an area.
 *
 * The answer is Twenty's record mapped exactly as the list maps it (`taskFromRecord`). Anything
 * the writer answered that is not a task record is this section's 502.
 */
import { atTime } from "@/lib/time";
import type { Task, TaskStatus } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { TWENTY_AREA_FIELD } from "@/data/config";
import { callWebhook } from "@/data/n8n/client";
import type { Asked } from "@/data/n8n/registry";
import { taskFromRecord, twentyStatusOf } from "./tasks";

const STATUS: Record<TaskStatus, string | null> = { open: "TODO", in_progress: "IN_PROGRESS", done: "DONE", waiting: null };

/** Fields a task carries that Twenty's writer cannot hold, in the words the card shows. */
const NOT_HELD: Record<string, string> = {
  column: "Twenty's stage can't be set from here yet",
  startsAt: "Twenty keeps no start date",
  endsAt: "Twenty keeps no end date",
  priority: "Twenty keeps no priority",
  owner: "who does it can't be set from here yet",
  delegated: "delegating can't be set from here yet",
  delegatedAt: "delegating can't be set from here yet",
  project: "Twenty keeps no project",
  goalId: "Twenty keeps no goal link",
  repeat: "Twenty keeps no repeat",
  waitingOn: "who it waits on can't be set from here yet",
  labels: "Twenty keeps no area",
  focus: "Twenty keeps no area",
  links: "Twenty keeps no links",
  work: "an agent's work can't be set from here",
  report: "an EA report can't be set from here",
  completedAt: "Twenty keeps no completion time",
  completedBy: "Twenty keeps no completion time",
  subtasks: "Twenty's tasks have no subtasks",
};

/** Fields that describe a task rather than set it: carried in every body, never written. */
const DESCRIPTIVE = new Set(["id", "offlineId", "metaParts", "dueLabel", "activity", "setAt", "twentyUrl", "attachmentIds"]);

const refuse = (field: string, reason: string): TransportResponse => ({ status: 422, json: { field, reason } });
/** A due DAY (the contract's key) as Twenty's instant: local noon, so every zone reads the same day back. */
const dueAtOf = (due: unknown) => (typeof due === "string" && due !== "" ? atTime(due, 12).toISOString() : null);

/** The Twenty fields a patch writes, or the refusal of the first field it cannot. */
function fieldsOf(patch: Record<string, unknown>): { fields: Record<string, unknown> } | { refused: TransportResponse } {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (DESCRIPTIVE.has(key) || value === undefined) continue;
    if (key === "title") fields.title = value;
    else if (key === "due") fields.dueAt = dueAtOf(value);
    else if (key === "status") {
      const status = STATUS[value as TaskStatus];
      if (status == null) return { refused: refuse("status", value === "waiting" ? "who it waits on can't be set from here yet" : "not a status Twenty keeps") };
      fields.status = status;
    } else return { refused: refuse(key, NOT_HELD[key] ?? `Twenty keeps no ${key}`) };
  }
  return { fields };
}

/** The writer's answer as the contract's Task, or this section's 502. */
function answered(data: unknown): TransportResponse {
  const task = taskFromRecord(data != null && typeof data === "object" ? (data as { task?: unknown }).task : undefined);
  return task != null ? { status: 200, json: task } : { status: 502, json: { reason: "Twenty's writer answered in an unexpected shape: no task record" } };
}

const update = async (id: string, fields: Record<string, unknown>, offlineId?: unknown) =>
  answered(await callWebhook("tasks-write", { op: "update", id, fields, ...(typeof offlineId === "string" ? { offlineId } : {}) }, { write: true }));

const bodyOf = (asked: Asked): Record<string, unknown> => (asked.req.body != null && typeof asked.req.body === "object" ? (asked.req.body as Record<string, unknown>) : {});

/** A new task's own id for the writer's dedupe: the outbox's `offlineId`, else one of its own. */
function offlineIdOf(body: Record<string, unknown>): string {
  if (typeof body.offlineId === "string" && /^[A-Za-z0-9-]{8,100}$/.test(body.offlineId)) return body.offlineId;
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `dash-${random}`;
}

export const tasksWriteAnswers = {
  patch: async (asked: Asked): Promise<TransportResponse> => {
    const body = bodyOf(asked);
    const made = fieldsOf(body);
    if ("refused" in made) return made.refused;
    if (Object.keys(made.fields).length === 0) return refuse("patch", "nothing Twenty keeps was changed");
    return update(asked.params[0], made.fields, body.offlineId);
  },

  complete: (asked: Asked) => update(asked.params[0], { status: "DONE" }, bodyOf(asked).offlineId),

  /** only the undo of a completion sends a whole task: its title, status and due date go back */
  put: (asked: Asked) => {
    const id = asked.params[0];
    const task = bodyOf(asked) as Partial<Task>;
    const status = task.status === "waiting" ? (twentyStatusOf(id) === "IN_PROGRESS" ? "IN_PROGRESS" : "TODO") : STATUS[task.status ?? "open"] ?? "TODO";
    return update(id, { ...(typeof task.title === "string" ? { title: task.title } : {}), status, dueAt: dueAtOf(task.due) });
  },

  create: async (asked: Asked): Promise<TransportResponse> => {
    const body = bodyOf(asked) as Partial<Task> & Record<string, unknown>;
    // what a new task would lose on the way into Twenty is refused, not dropped
    for (const key of ["goalId", "project", "startsAt", "endsAt", "repeat", "delegated", "waitingOn", "column"] as const) {
      if (body[key] != null) return refuse(key, NOT_HELD[key]!);
    }
    if (body.owner != null && body.owner !== "josh") return refuse("owner", NOT_HELD.owner);
    if (!TWENTY_AREA_FIELD && body.labels != null && body.labels.silo !== "personal:josh") return refuse("labels", NOT_HELD.labels);
    const status = STATUS[body.status ?? "open"];
    if (status == null) return refuse("status", "who it waits on can't be set from here yet");
    const fields = { title: body.title, status, dueAt: dueAtOf(body.due) };
    return answered(await callWebhook("tasks-write", { op: "create", offlineId: offlineIdOf(body), fields }, { write: true }));
  },
};
