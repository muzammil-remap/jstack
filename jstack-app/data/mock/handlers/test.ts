/**
 * Rig routes (T-5) — mock-only, deliberately NOT in `data/routes.ts`, so they
 * can never reach `openapi.yaml` (hard rule 5) and no `ApiAdapter` method can
 * call one by accident.
 *
 * Its own module rather than a corner of a real handler file, because that is
 * the boundary worth keeping visible: everything in `handlers/tasks.ts` is a
 * route a backend has to implement, and nothing in here is. `server.ts`'s
 * `TEST_ROUTES` is the only importer.
 *
 * `POST /__test__/work` exists because WK-03's claim is that the marker follows
 * the SERVER — flip a state on the server and three surfaces change without a
 * reload. A test that reached into the store to set `work` itself would be
 * asserting that React re-renders when state changes, which nobody doubts.
 */
import * as db from "@/data/mock/db";
import { emitServerEvent } from "@/data/mock/events";
import { agentRoster } from "@/data/mock/handlers/agents";
import { armRefreshReuse, markRevoked } from "@/data/mock/handlers/session";
import { err, ok } from "@/data/mock/util";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";
import { ingestShare } from "@/data/mock/ingest";
import { kindForFile } from "@/data/files";
import { dayKey } from "@/lib/time";
import type { Attachment, TaskOwner, WorkState } from "@/data/types";

const STATES: WorkState[] = ["queued", "running", "blocked", "done"];

export function setTestWork(req: TransportRequest): TransportResponse {
  const body = (req.body ?? {}) as { taskId?: string; state?: string; step?: string; agentId?: TaskOwner };
  if (!body.taskId) return err(422, "a task id is required", { field: "taskId" });
  if (!STATES.includes(body.state as WorkState)) return err(422, `state must be one of ${STATES.join(", ")}`, { field: "state" });

  const state = db.get();
  const idx = state.tasks.findIndex((t) => t.id === body.taskId);
  if (idx === -1) return err(404, "not found");

  const task = state.tasks[idx];
  // `done` CLEARS it. A marker is a statement about now, and "done" is not one
  // — the finished run is in the activity list with its usage line (WK-04).
  const work =
    body.state === "done"
      ? undefined
      : {
          // whoever is already on it, else the task's owner when that owner is
          // an agent that takes work, else the EA. A rig that stamped
          // `agentId: "josh"` would draw a marker saying a person is running.
          agentId: body.agentId ?? task.work?.agentId ?? (agentRoster().find((a) => a.id === task.owner && a.canTakeTasks)?.id ?? "ea"),
          state: body.state as WorkState,
          // `since` survives a state change: a run that was queued and is now
          // running did not start again, and the marker says how long it has
          // been going.
          since: task.work?.since ?? db.now().toISOString(),
          ...(body.step != null ? { step: body.step } : {}),
        };
  state.tasks[idx] = { ...task, work };

  emitServerEvent({ kind: "tasks", ids: [task.id], at: db.now().toISOString() });
  return ok(state.tasks[idx]);
}

/**
 * §4.23 (W-1, UP-06) — a file arriving in the Dropbox inbox from the iOS
 * Shortcut.
 *
 * The Shortcut saves images and files to `/JSTACK/Inbox/` rather than opening
 * the app, because the iOS share sheet's icon row is native apps only and a
 * web app cannot sit there (contract §8 Q22). A backend watching that folder
 * turns each arrival into a capture; this is that, driven.
 *
 * Three records, and all three matter: the capture (so it appears in Latest
 * in), the `Attachment` (so it appears in Files and the archive), and the
 * triage card when the filing is provisional. A rig route that made only the
 * first would let the app look right while the file was nowhere.
 */
export function setTestInbox(req: TransportRequest): TransportResponse {
  const body = (req.body ?? {}) as { name?: string; kind?: string; dataUrl?: string };
  if (!body.name) return err(422, "a file name is required", { field: "name" });

  const state = db.get();
  const now = db.now();
  const at = now.toISOString();
  const id = `dump-inbox-${now.getTime()}`;

  const { item, card } = ingestShare({ text: `${body.name} — from the Dropbox inbox`, id, at });

  const file: Attachment = {
    id: `f-inbox-${now.getTime()}`,
    name: body.name,
    kind: kindForFile(body.name, body.kind),
    size: body.dataUrl?.length,
    storage: "dropbox",
    folder: "/JSTACK/Inbox",
    dropboxUrl: `https://www.dropbox.com/home/JSTACK/Inbox/${encodeURIComponent(body.name)}`,
    captureId: item.id,
    brainId: item.id,
    addedBy: "josh",
    at,
    labels: item.labels,
    setAt: dayKey(now),
    focus: item.focus,
  };
  state.files = [...state.files, file];

  emitServerEvent({ kind: "brain", ids: [item.id], at });
  return ok({ item, file, card });
}

/**
 * Mock-only (rig, MU-01): reseed the session as somebody else. Never in
 * `data/routes.ts` and therefore never in `openapi.yaml` — hard rule 5, and
 * `tools/validate-openapi.mjs` refuses any `/__` path in the published
 * contract, so this cannot leak into the document a backend is built from.
 * Here rather than in `handlers/session.ts` since P-11 (F-07): a rig route in
 * a contract handler was the boundary this file exists to keep visible.
 */
export function setTestUser(req: TransportRequest): TransportResponse {
  const body = (req.body ?? {}) as { id?: string };
  if (!body.id) return err(422, "a user id is required", { field: "id" });
  try {
    return ok(db.asUser(body.id));
  } catch {
    return err(404, `no such user "${body.id}"`);
  }
}

/**
 * SH-09 (rig): the server revoking this device. A real backend does this when
 * Josh revokes a device from another one, or when its own watchdog decides a
 * session is compromised — either way the app finds out by being TOLD, not by
 * a failed request, because a failed request is indistinguishable from a flat
 * network and the two need opposite responses.
 */
export function setTestRevoke(_req: TransportRequest): TransportResponse {
  markRevoked();
  emitServerEvent({ kind: "session", ids: ["revoked"], at: db.now().toISOString() });
  return ok({ revoked: true });
}

export function setTestRefreshReuse(_req: TransportRequest): TransportResponse {
  armRefreshReuse();
  return ok({ armed: true });
}
