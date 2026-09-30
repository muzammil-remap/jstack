/**
 * The Tasks routes from Twenty, through the `tasks` webhook (JSTACK-DASH-tasks-read): the whole list
 * paged in, each record guarded and mapped into the contract's `Task`, and the mock's list rules
 * (`data/mock/handlers/tasks.ts`) applied on the device — `GET /tasks`, `GET /tasks/{id}`,
 * `GET /tasks/waiting` and the Board's `GET /tasks/columns` all answer from the one list.
 *
 * Paging: `limit` 60 with Twenty's cursor until `hasNextPage` is false, at most ten pages (a warning
 * says so if the cap is reached). Every page call goes through `callWebhook`, which shares the same
 * key and body for 30 seconds — so the four routes on one page load run the workflow once per page.
 *
 * Each mapping answer from Checkpoint 2 is one line below, so Josh can change one without the rest:
 * owner `josh` until `assigneeId` is used; `priority` and `area` read only behind their switches
 * (`data/config.ts`, off until the fields exist); a non-empty `waitingOn` on a task that is not done
 * is `waiting`; `status` decides done-ness when it and `bucket` disagree; no completion time (the
 * contract makes it optional and Twenty has none). Anything else in a reply is the section's 502.
 */
import { dayKey, now } from "@/lib/time";
import { TWENTY_APP_URL, TWENTY_AREA_FIELD, TWENTY_PRIORITY_FIELD } from "@/data/config";
import { defaultParameters } from "@/data/parameters";
import { resolveRange, type TaskFilters } from "@/data/taskFilters";
import type { Silo } from "@/data/labels";
import type { Column, Task, TaskOwner, TaskStatus, TaskView, WaitingRow } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { callWebhook } from "@/data/n8n/client";
import { DEFAULTS } from "@/data/n8n/defaults";
import { inFocus } from "@/data/n8n/focus";
import type { Asked } from "@/data/n8n/registry";
import { inWindow, passesFilters, passesSlicer } from "@/data/n8n/taskRules";

const PAGE_LIMIT = 60;
const MAX_PAGES = 10;

// ── the mapping, one decision per line (Checkpoint 2's answers) ──────────────
/** Twenty workspace-member id → owner. Empty until assignment is used; unknown → `josh`. */
const OWNER_BY_MEMBER: Record<string, TaskOwner> = {};
const DEFAULT_OWNER: TaskOwner = "josh";
const STATUS: Record<string, TaskStatus> = { TODO: "open", IN_PROGRESS: "in_progress", DONE: "done" };
const PRIORITY: Record<string, Task["priority"]> = { HIGH: "high", MEDIUM: "medium", LOW: "low" };
/** the contract requires a priority; with no field it is this, and `lib/taskMeta.ts` does not print it */
const NO_PRIORITY: Task["priority"] = "medium";
const AREA: Record<string, { silo: Silo; focus: string }> = {
  PERSONAL: { silo: "personal:josh", focus: "personal" },
  FAMILY: { silo: "family1", focus: "family" },
  WORK: { silo: "work", focus: "work" },
};
const DEFAULT_AREA = AREA.PERSONAL;

type RawTask = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  dueAt?: string | null;
  position?: number;
  assigneeId?: string | null;
  bucket?: string | null;
  waitingOn?: string | null;
  priority?: unknown;
  area?: unknown;
};

const isInstant = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const optional = <T>(v: unknown, ok: (x: unknown) => x is T) => v === undefined || v === null || ok(v);
const isString = (v: unknown): v is string => typeof v === "string";

function isRawTask(t: unknown): t is RawTask {
  if (t == null || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return (
    isString(r.id) && r.id !== "" && isString(r.title) && isString(r.status) && isInstant(r.createdAt) && isInstant(r.updatedAt) &&
    optional(r.dueAt, isInstant) && optional(r.assigneeId, isString) && optional(r.bucket, isString) && optional(r.waitingOn, isString) &&
    (r.position === undefined || typeof r.position === "number")
  );
}

/** A reply the section cannot use: the 502 is this section's, never a guess at what was meant. */
class UnexpectedReply extends Error {}

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** Every page, in Twenty's order. */
async function loadRaw(): Promise<RawTask[]> {
  const all: RawTask[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = (await callWebhook("tasks", cursor == null ? { limit: PAGE_LIMIT } : { limit: PAGE_LIMIT, cursor })) as { tasks?: unknown; pageInfo?: { hasNextPage?: unknown; endCursor?: unknown } } | null;
    if (!Array.isArray(data?.tasks)) throw new UnexpectedReply("no tasks list");
    const bad = data.tasks.findIndex((t) => !isRawTask(t));
    if (bad !== -1) throw new UnexpectedReply(`task ${page * PAGE_LIMIT + bad} is not a task`);
    all.push(...(data.tasks as RawTask[]));
    const next = data.pageInfo?.hasNextPage === true && isString(data.pageInfo.endCursor) ? data.pageInfo.endCursor : null;
    if (next == null) return all;
    cursor = next;
  }
  warnOnce("cap", `n8n tasks: stopped after ${MAX_PAGES} pages (${all.length} tasks); Twenty has more`);
  return all;
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replace(/_/g, " ");
const columnId = (bucket: string) => `bucket-${bucket}`;

function statusOf(r: RawTask): TaskStatus {
  const mapped = STATUS[r.status];
  if (mapped == null) warnOnce(`status:${r.status}`, `n8n tasks: Twenty status "${r.status}" is not mapped; shown as open`);
  if (mapped === "done") return "done";
  if (isString(r.waitingOn) && r.waitingOn.trim() !== "") return "waiting";
  return mapped ?? "open";
}

function toTask(r: RawTask, doneColumn: string | null): Task {
  const status = statusOf(r);
  const area = TWENTY_AREA_FIELD && isString(r.area) && AREA[r.area] != null ? AREA[r.area] : DEFAULT_AREA;
  const priority = TWENTY_PRIORITY_FIELD && isString(r.priority) && PRIORITY[r.priority] != null ? PRIORITY[r.priority] : NO_PRIORITY;
  const url = TWENTY_APP_URL !== "" ? `${TWENTY_APP_URL}/object/task/${r.id}` : null;
  // `status` decides done-ness: a DONE task still in a non-done bucket is in the done column
  const column = status === "done" && doneColumn != null ? doneColumn : isString(r.bucket) && r.bucket !== "" ? columnId(r.bucket) : undefined;
  const waiting = status === "waiting" && isString(r.waitingOn);
  return {
    id: r.id,
    title: r.title,
    metaParts: { source: "Twenty" },
    owner: (r.assigneeId != null ? OWNER_BY_MEMBER[r.assigneeId] : undefined) ?? DEFAULT_OWNER,
    // a DAY key, as every reader of `due` expects (`lib/taskMeta.ts`, the Gantt, the filters)
    ...(isInstant(r.dueAt) ? { due: dayKey(new Date(r.dueAt)) } : {}),
    priority,
    status,
    links: url != null ? [{ label: "Twenty", url }] : [],
    ...(url != null ? { twentyUrl: url } : {}),
    ...(column != null ? { column } : {}),
    // days since Twenty filed the task: the earliest the wait can have begun (Twenty holds no start)
    ...(waiting ? { waitingOn: { who: r.waitingOn!.trim(), what: r.title, days: daysSince(r.createdAt) } } : {}),
    subtasks: [],
    activity: [],
    labels: { silo: area.silo, types: [], setBy: "source" },
    setAt: new Date(r.updatedAt).toISOString(),
    focus: area.focus,
  };
}

function daysSince(instant: string): number {
  return Math.max(0, Math.floor((now().getTime() - Date.parse(instant)) / 86_400_000));
}

/** The Board's columns: `bucket`'s values, the done one last. Twenty's own option order is not in
 * the reply (a DASH change would add it); until then the others are alphabetical. With no bucket on
 * any task, the default columns (`data/n8n/defaults.ts`), so no task falls off the Board. */
function columnsOf(raw: RawTask[]): Column[] {
  const values = [...new Set(raw.map((r) => r.bucket).filter((b): b is string => isString(b) && b !== ""))];
  if (values.length === 0) return DEFAULTS.getColumns().json as Column[];
  const done = values.filter((v) => v === "DONE");
  const rest = values.filter((v) => v !== "DONE").sort();
  return [...rest, ...done].map((value, i) => ({ id: columnId(value), name: titleCase(value), statuses: value === "DONE" ? ["done"] : ["open", "in_progress", "waiting"], order: i + 1, source: "twenty" }));
}

async function loadTasks(): Promise<{ tasks: Task[]; columns: Column[] }> {
  const raw = [...(await loadRaw())].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const columns = columnsOf(raw);
  const doneColumn = columns.find((c) => c.statuses.includes("done"))?.id ?? null;
  return { tasks: raw.map((r) => toTask(r, doneColumn)), columns };
}

/** A load that answers the contract, or this section's 502 for a reply it cannot use. */
async function answering(make: (loaded: { tasks: Task[]; columns: Column[] }) => TransportResponse): Promise<TransportResponse> {
  try {
    return make(await loadTasks());
  } catch (error) {
    if (error instanceof UnexpectedReply) return { status: 502, json: { reason: `Twenty's tasks answered in an unexpected shape: ${error.message}` } };
    throw error;
  }
}

function parseFilters(raw: string | undefined): TaskFilters | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as TaskFilters;
  } catch {
    return undefined;
  }
}

/** `data/mock/handlers/tasks.ts` `getTasks`: focus, slicer, view, range, filters, search — in that order */
function listFor(tasks: Task[], asked: Asked): Task[] {
  const q = asked.req.query ?? {};
  const at = now();
  let rows = inFocus(tasks, q.focus);
  const slicers = DEFAULTS.getSlicers().json as { id: string; predicate: Parameters<typeof passesSlicer>[1] }[];
  const slicer = q.slice == null ? undefined : slicers.find((s) => s.id === q.slice);
  if (slicer != null) rows = rows.filter((t) => passesSlicer(t, slicer.predicate, at));
  const view = (q.view ?? "list") as TaskView;
  if (view === "done") rows = rows.filter((t) => t.status === "done");
  else if (view === "list") rows = rows.filter((t) => t.status !== "done");
  const filters = parseFilters(q.filters);
  const rangeDays = defaultParameters().find((p) => p.key === "tasks.rangeDays")?.value;
  const window = resolveRange(filters?.range ?? { preset: "default" }, view, typeof rangeDays === "number" ? rangeDays : 90, dayKey(at));
  rows = rows.filter((t) => inWindow(t, window, view));
  if (filters != null) rows = rows.filter((t) => passesFilters(t, filters, at));
  if (q.q) rows = rows.filter((t) => t.title.toLowerCase().includes(q.q!.toLowerCase()));
  return rows;
}

export const tasksAnswers = {
  list: (asked: Asked) => answering(({ tasks }) => ({ status: 200, json: listFor(tasks, asked) })),
  byId: (asked: Asked) =>
    answering(({ tasks }) => {
      const found = tasks.find((t) => t.id === asked.params[0]);
      return found != null ? { status: 200, json: found } : { status: 404, json: { reason: "not found" } };
    }),
  /** `data/mock/handlers/tasks.ts` `getTasksWaiting`: every task with a wait, in focus */
  waiting: (asked: Asked) =>
    answering(({ tasks }) => {
      const rows: WaitingRow[] = inFocus(tasks, asked.req.query?.focus)
        .filter((t) => t.waitingOn != null)
        .map((t) => ({ ...t.waitingOn!, taskId: t.id }));
      return { status: 200, json: rows };
    }),
  columns: () => answering(({ columns }) => ({ status: 200, json: columns })),
};
