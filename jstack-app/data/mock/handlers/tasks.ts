/**
 * §4.5 Tasks (the Gantt reads `?view=gantt`, ADR-46). `filters` is `data/taskFilters.ts`'s
 * `TaskFilters` JSON-serialised (TK-14) — groups AND together, values within
 * one group OR (a task matching ANY selected priority AND ANY selected status
 * ... passes). The slicers and the groups are tables in
 * `data/mock/predicates.ts`; this file looks them up (S-2).
 */
import * as db from "@/data/mock/db";
import { err, inFocus, ok } from "@/data/mock/util";
import { PREDICATE_KINDS, inWindow, passesFilters, passesSlicer } from "@/data/mock/predicates";
import { resolveRange, type TaskFilters } from "@/data/taskFilters";
import { dayKey } from "@/lib/time";

const PREDICATE_KIND_NAMES: string[] = Object.keys(PREDICATE_KINDS);
import { agentRoster } from "@/data/mock/handlers/agents";
import type { CompleteBody, DelegateBody, Slicer, Subtask, SubtaskBody, SubtaskPatch, Task, TaskView } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

function parseFilters(raw: string | undefined): TaskFilters | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as TaskFilters;
  } catch {
    // an unparseable filter string is not a filter — the app's own
    // serialiser cannot produce one, so this is somebody hand-editing a URL
    return undefined;
  }
}

/** BUGLOG_v2.md A-09: CONTRACT_v2.md §1.8 says a `t1`-sensitivity record is
 * "never served" (403). No V2 surface currently creates one (the v1.2
 * Therapy/Direct-lines feature this line described is retired, ADR-06) —
 * this reserved id keeps the 403 path real and testable (CT-07) without
 * inventing a fake field on every Task. */
const T1_SENSITIVE_TASK_ID = "t1-sensitive";

export function getTasks(req: TransportRequest): TransportResponse {
  const state = db.get();
  let rows = inFocus(state.tasks, req.query?.focus);
  const slice = req.query?.slice;
  const view = (req.query?.view ?? "list") as TaskView;
  const q = req.query?.q?.toLowerCase();

  // F-1: the slicer is a STORED record now, so the id is looked up in the list
  // rather than in a closed table — that is what makes one Josh added filter
  // as well as the five that shipped.
  const slicer = slice == null ? undefined : state.slicers.find((s) => s.id === slice);
  if (slicer != null) rows = rows.filter((t) => passesSlicer(t, slicer.predicate, db.now()));

  if (view === "done") rows = rows.filter((t) => t.status === "done");
  // board and gantt show every status; the list hides what is finished
  else if (view === "list") rows = rows.filter((t) => t.status !== "done");

  const filters = parseFilters(req.query?.filters);
  // the RANGE is applied whether or not filters were sent: `default` is a real
  // window (the next `tasks.rangeDays` days on the open views), and a request
  // that carries no filters is asking for the default, not for everything
  // (F-1, ADR-44). `data/taskFilters.ts` decides what the window is; the two
  // halves of the app cannot disagree about it.
  const window = resolveRange(filters?.range ?? { preset: "default" }, view, rangeDays(), dayKey(db.now()));
  rows = rows.filter((t) => inWindow(t, window, view));

  if (filters != null) rows = rows.filter((t) => passesFilters(t, filters, db.now()));
  if (q) rows = rows.filter((t) => t.title.toLowerCase().includes(q));
  return ok(rows);
}

/** the parameter, read the way every other reader does (L-1, ADR-41). */
function rangeDays(): number {
  const row = db.get().parameters.find((p) => p.key === "tasks.rangeDays");
  return typeof row?.value === "number" ? row.value : 90;
}

/**
 * B-1, ADR-45: the columns are Twenty's, in Twenty's order. The app renders
 * what it is given — `bucketOf`, which guessed "Now" from a due LABEL and had
 * no lane for `in_progress` at all, is gone.
 */
export function getColumns(_req: TransportRequest): TransportResponse {
  return ok([...db.get().columns].sort((a, b) => a.order - b.order));
}

export function getSlicers(_req: TransportRequest): TransportResponse {
  return ok([...db.get().slicers]);
}

/**
 * The whole set at once, the same shape `PUT /settings/focuses` takes — a
 * reorder, a rename and a removal are one save, and a per-item route would
 * turn "move this one up" into two requests that can half-fail.
 */
export function putSlicers(req: TransportRequest): TransportResponse {
  const next = req.body as Slicer[] | undefined;
  if (!Array.isArray(next)) return err(422, "a list of slicers is required", { field: "slicers" });
  const state = db.get();
  // a `fixed` slicer cannot be removed (TF-06). The server enforces it rather
  // than the dialog, because the dialog is not the only thing that can PUT.
  const missing = state.slicers.filter((s) => s.fixed === true && !next.some((n) => n.id === s.id));
  if (missing.length > 0) return err(422, `${missing[0].name} cannot be removed`, { field: "slicers" });
  for (const s of next) {
    if (typeof s?.id !== "string" || typeof s?.name !== "string" || s.name.trim() === "") return err(422, "every slicer needs an id and a name", { field: "slicers" });
    if (!PREDICATE_KIND_NAMES.includes(s.predicate?.kind)) return err(422, "no such predicate", { field: "predicate" });
  }
  state.slicers = next;
  return ok([...state.slicers]);
}

export function getTask(_req: TransportRequest, id: string): TransportResponse {
  if (id === T1_SENSITIVE_TASK_ID) return err(403, "t1 sensitivity — never served");
  const task = db.get().tasks.find((t) => t.id === id);
  return task ? ok(task) : err(404, "not found");
}

/**
 * A4R5-04: the next free number after `prefix`, over every id in `taken`.
 *
 * An id minted from a COUNT (`length + 1`) is reused the moment anything but
 * the last is deleted: a new subtask took the id of one still on the list, so a
 * tick on it ticked the other, its menu edited the other, and a delete removed
 * both while the undo brought back one. `taken` includes what an undo may
 * still restore, so a restored record cannot collide with a new one either.
 */
function nextNumbered(prefix: string, taken: Iterable<string>): string {
  let max = 0;
  for (const id of taken) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

export function postTask(req: TransportRequest): TransportResponse {
  const state = db.get();
  const body = req.body as Omit<Task, "id" | "activity" | "subtasks">;
  const task: Task = { ...body, id: nextNumbered("t", state.tasks.map((t) => t.id)), activity: [], subtasks: [] };
  state.tasks = [task, ...state.tasks];
  return ok(task);
}

export function patchTask(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return err(404, "not found");
  const patch = req.body as Partial<Task>;
  const next = { ...state.tasks[idx], ...patch };

  // TK-03: an end before its start is refused, and the field is named so the
  // card can put the line under the control that caused it. Checked on the
  // MERGED task rather than on the patch: moving only the start is exactly how
  // a pair goes backwards, and a patch carrying one field would slip past a
  // check that only looked at the body.
  if (next.startsAt != null && next.endsAt != null && new Date(next.endsAt).getTime() < new Date(next.startsAt).getTime()) {
    return err(422, "the end is before the start", { field: patch.endsAt != null ? "endsAt" : "startsAt" });
  }
  if (patch.title != null && patch.title.trim() === "") {
    return err(422, "a task needs a title", { field: "title" });
  }

  state.tasks[idx] = next;
  return ok(state.tasks[idx]);
}

export function putTask(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return err(404, "not found");
  const full = req.body as Task;
  // `at` is a timestamp on the wire, like every `at` (CONTRACT_v21.md §1.11);
  // the task card formats it (`lib/time.ts` proseDate, ux-review R3-02)
  state.tasks[idx] = { ...full, activity: [...state.tasks[idx].activity, { at: db.now().toISOString(), actor: "josh", text: "Saved" }] };
  return ok(state.tasks[idx]);
}

export function postSubtask(req: TransportRequest, taskId: string): TransportResponse {
  const state = db.get();
  const idx = state.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return err(404, "not found");
  const body = (req.body ?? {}) as SubtaskBody;
  // TK-09's undo: a POST naming a tombstone restores that subtask as it was,
  // id and all, rather than adding a lookalike.
  const tomb = body.restoreId != null ? state.subtaskTombstones.find((s) => s.subtask.id === body.restoreId) : undefined;
  // A4R9-04: a restore that has already landed — the retry of one whose answer was
  // lost — is answered as it stands, never a lookalike beside the restored subtask
  if (body.restoreId != null && tomb == null && state.tasks[idx].subtasks.some((s) => s.id === body.restoreId)) return ok(state.tasks[idx]);
  if (tomb != null) state.subtaskTombstones = state.subtaskTombstones.filter((s) => s.subtask.id !== body.restoreId);
  const taken = [...state.tasks[idx].subtasks, ...state.subtaskTombstones.filter((s) => s.taskId === taskId).map((s) => s.subtask)].map((s) => s.id);
  const sub: Subtask = tomb?.subtask ?? { id: nextNumbered(`${taskId}-`, taken), title: body.title, owner: body.owner, done: false };
  // A4R6-08: an undone delete puts the subtask back WHERE IT STOOD, not at the foot
  const list = [...state.tasks[idx].subtasks];
  list.splice(tomb?.index ?? list.length, 0, sub);
  state.tasks[idx] = { ...state.tasks[idx], subtasks: list };
  return ok(state.tasks[idx]);
}

/**
 * TK-06 — delegation is the WHOLE task, and it writes what the marker reads.
 *
 * This used to set `delegated` alone, which is why nothing visible changed: the
 * row, the board card and the Gantt bar all read `owner` and `work`, and both
 * stayed exactly as they were. Now one call sets all four, so the marker
 * appears everywhere in the same render (ADR-42).
 */
export function postTaskDelegate(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return err(404, "not found");
  const body = (req.body ?? {}) as DelegateBody;
  const to = body.to ?? "ea";
  const roster = agentRoster();
  const delegatee = roster.find((a) => a.id === to);
  if (delegatee == null || !delegatee.canTakeTasks) return err(422, "that one does not take tasks", { field: "to" });

  const at = db.now().toISOString();
  state.tasks[idx] = {
    ...state.tasks[idx],
    owner: to,
    delegatedAt: at,
    // `delegated.to` is still the literal "ea" in the contract's own shape;
    // the delegatee is `owner`, which is the field every surface reads.
    delegated: { to: "ea", state: "acknowledged", progressPct: 0 },
    work: { agentId: to, state: "queued", since: at },
    activity: [...state.tasks[idx].activity, { at, actor: to, text: "Acknowledged — on it." }],
  };
  return ok(state.tasks[idx]);
}

/**
 * TK-08 — a subtask's checkbox is a control now.
 *
 * It was a status MARK: §4.5 had no endpoint to toggle one, and the component's
 * own comment said so rather than promising an action it could not perform.
 */
export function patchSubtask(req: TransportRequest, id: string, sid: string): TransportResponse {
  const state = db.get();
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return err(404, "not found");
  const subIdx = state.tasks[idx].subtasks.findIndex((s) => s.id === sid);
  if (subIdx === -1) return err(404, "no such subtask");
  const patch = (req.body ?? {}) as SubtaskPatch;
  if (patch.title != null && patch.title.trim() === "") return err(422, "a subtask needs a title", { field: "title" });

  const subtasks = [...state.tasks[idx].subtasks];
  const before = subtasks[subIdx];
  subtasks[subIdx] = {
    ...before,
    ...patch,
    // ticking one stamps WHEN, and un-ticking clears it — a completedAt left
    // behind on a re-opened subtask is a date that means nothing
    completedAt: patch.done === true ? db.now().toISOString() : patch.done === false ? undefined : before.completedAt,
  };
  state.tasks[idx] = { ...state.tasks[idx], subtasks };
  return ok(state.tasks[idx]);
}

/**
 * TK-09 — removing one, reversibly.
 *
 * The subtask is kept in a tombstone rather than dropped, so the undo can put
 * it back with its OWN id, its `done` and its meta. Re-adding a lookalike
 * through `POST /subtasks` would give it a new id and lose both, which is
 * exactly the difference a person notices.
 */
export function deleteSubtask(_req: TransportRequest, id: string, sid: string): TransportResponse {
  const state = db.get();
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return err(404, "not found");
  const removed = state.tasks[idx].subtasks.find((s) => s.id === sid);
  if (removed == null) return err(404, "no such subtask");
  state.subtaskTombstones = [...state.subtaskTombstones.filter((s) => s.subtask.id !== sid), { taskId: id, subtask: removed, index: state.tasks[idx].subtasks.indexOf(removed) }];
  state.tasks[idx] = { ...state.tasks[idx], subtasks: state.tasks[idx].subtasks.filter((s) => s.id !== sid) };
  return ok(state.tasks[idx]);
}

export function postTaskReport(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1 || state.tasks[idx].report == null) return err(404, "not found");
  const body = (req.body ?? {}) as { verb: "accept" | "revise" | "teach"; note?: string };
  const report = { ...state.tasks[idx].report!, state: body.verb === "accept" ? ("accepted" as const) : ("revise" as const) };
  state.tasks[idx] = { ...state.tasks[idx], report };
  return ok(report);
}

/**
 * TK-10/TK-11 — finishing a task, and what "finished" means for the parts of
 * it that are not done.
 *
 * One endpoint rather than a PATCH per subtask: the completion is one decision
 * a person made, so it is one activity entry, one undo, and one instant on
 * every record it touches. A cascade assembled client-side would write six
 * timestamps a fraction apart and leave a half-completed task if the third
 * request failed.
 *
 * `includeSubtasks` is on the REQUEST because the server must not guess. The
 * app asked the question (TK-10's confirm) and the answer belongs to whoever
 * answered it.
 */
export function postTaskComplete(req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return err(404, "not found");
  const { includeSubtasks } = (req.body ?? {}) as CompleteBody;
  const task = state.tasks[idx];
  // A4R7-06: a task already done is answered as it is — a second completion
  // (a second offline tick, queued under its own offlineId) writes nothing twice
  if (task.status === "done") return ok(task);
  const open = task.subtasks.filter((s) => !s.done);
  if (open.length > 0 && !includeSubtasks) {
    return err(422, `${open.length} subtask${open.length === 1 ? " is" : "s are"} not done`, { field: "includeSubtasks" });
  }

  const at = db.now().toISOString();
  const by = state.currentUser.id as Task["completedBy"];
  state.tasks[idx] = {
    ...task,
    status: "done",
    completedAt: at,
    completedBy: by,
    subtasks: includeSubtasks ? task.subtasks.map((s) => (s.done ? s : { ...s, done: true, completedAt: at })) : task.subtasks,
    // ONE entry. The card reads it as "Completed · Josh · Thu 11 Sep, 2:14pm"
    // through `formatWhen`; the server composes no clock (ADR-47).
    activity: [...task.activity, { at, actor: by ?? "josh", text: "Completed" }],
  };
  return ok(state.tasks[idx]);
}

export function postTaskAccept(_req: TransportRequest, id: string): TransportResponse {
  const state = db.get();
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return err(404, "not found");
  // TK-12: "accept → POST /tasks/{id}/accept → owner Josh".
  state.tasks[idx] = { ...state.tasks[idx], status: "open", owner: "josh" };
  return ok(state.tasks[idx]);
}

export function getTasksWaiting(req: TransportRequest): TransportResponse {
  const state = db.get();
  const rows = inFocus(state.tasks, req.query?.focus)
    .filter((t) => t.waitingOn != null)
    .map((t) => ({ ...t.waitingOn!, taskId: t.id }));
  return ok(rows);
}

export function postTaskNudge(_req: TransportRequest, id: string): TransportResponse {
  return ok({ draftRef: `gmail-draft-${id}` });
}

export function postUndo(_req: TransportRequest): TransportResponse {
  return ok({ undone: null });
}

export function putLabels(_req: TransportRequest, _noun: string, _id: string): TransportResponse {
  return ok(null);
}
