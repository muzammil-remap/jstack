/**
 * §4.17 Files and deliverables (X-1) — the backend's INDEX of Dropbox.
 *
 * Q16 closed on 7 Sep: Dropbox is the store of record for every file, Josh's
 * uploads and the EA's deliverables alike. So these routes never serve bytes.
 * They serve what a backend that watches the folder would hold — name, kind,
 * size, who added it, what it belongs to, the extracted first words — plus a
 * `dropboxUrl` to go and look at the thing itself.
 *
 * `url` is the exception and it is deliberately awkward to hold on to: a
 * short-lived signed link, minted per `GET /files/{id}`, never listed. FL-05
 * turns that into a rule the device cache enforces (`lib/recentFiles.ts`
 * stores metadata, `previewText` and `dropboxUrl`, and never `url`), because a
 * signed URL written to disk is a credential written to disk. The mock mints
 * one only for `storage: "store"`, which no V2.2 fixture uses — the shape is
 * proven by the upload path, where the mock does hold the bytes.
 *
 * The silo gate is `inFocus`, the same one every other list read passes
 * through (MU-02/MU-04). Files are the surface where that matters most after
 * search: a folder listing is exactly the shape that leaks everything at once
 * if the gate is missed, and `previewText` carries CONTENT, not just a name.
 */
import * as db from "@/data/mock/db";
import { err, inFocus, nextId, ok } from "@/data/mock/util";
import { MAX_UPLOAD_BYTES, kindForFile, matchesFileFilter } from "@/data/files";
import { dayKey } from "@/lib/time";
import type { Attachment, AttachmentList } from "@/data/types";
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

/** newest first, everywhere. A file list is read down from what just arrived. */
const newestFirst = (rows: Attachment[]): Attachment[] => [...rows].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

/** The gate, then the sort. Never the other way round, and never optional. */
function visible(rows: Attachment[], focus?: string): Attachment[] {
  return newestFirst(inFocus(rows, focus));
}

/**
 * The signed URL a real backend would mint for a working copy it holds.
 * Minutes, not hours: the app opens it immediately and is forbidden from
 * keeping it, so a long life would buy nothing and cost something.
 */
function withSignedUrl(file: Attachment): Attachment {
  if (file.storage !== "store") return file;
  const expires = new Date(db.now().getTime() + 10 * 60 * 1000);
  return { ...file, url: `${BLOB_PATH}/${file.id}`, urlExpiresAt: expires.toISOString() };
}

/** the test build's blob route (`server.ts` `TEST_PATTERNS`) — mock-only, and
 * never in `data/routes.ts` so it can never reach `openapi.yaml` (hard rule 5) */
const BLOB_PATH = "/__test__/files";

/**
 * FL-01: the task's files AND every subtask's, in one answer. The row names
 * its subtask when it has one, which is why the join happens here rather than
 * in the component — the component would have to hold the subtask list to say
 * "from: Draft the memo", and the server already knows.
 */
export function getTaskFiles(req: TransportRequest, id: string): TransportResponse {
  const task = db.get().tasks.find((t) => t.id === id);
  if (task == null) return err(404, "not found");
  const subtaskIds = new Set(task.subtasks.map((s) => s.id));
  const rows = db.get().files.filter((f) => f.taskId === id || (f.subtaskId != null && subtaskIds.has(f.subtaskId)));
  return ok<AttachmentList>({ attachments: visible(rows, req.query?.focus) });
}

/**
 * FL-03/FL-04: the archive. `q` matches the name AND the extracted text,
 * which is the half that makes it worth having — "reconciliation" finds the
 * notes file whose NAME says nothing about reconciliation.
 */
export function getFiles(req: TransportRequest): TransportResponse {
  const { q, addedBy, kind, range, taskId } = req.query ?? {};
  // one predicate with the offline cache (F-19, P-10); the range counts back from the server's day
  const today = dayKey(db.now());
  const rows = db.get().files.filter((f) => matchesFileFilter(f, { q, addedBy, kind, range, taskId }, today));
  return ok<AttachmentList>({ attachments: visible(rows, req.query?.focus) });
}

/** FL-02: one file, with a fresh `url` when the store holds a working copy. */
export function getFile(_req: TransportRequest, id: string): TransportResponse {
  const file = db.get().files.find((f) => f.id === id);
  if (file == null) return err(404, "not found");
  if (!db.currentSilos().includes(file.labels.silo)) return err(404, "not found");
  return ok(withSignedUrl(file));
}

/**
 * UP-02: the upload. The mock keeps the bytes in memory and serves them back
 * through the rig's blob route, so an e2e can attach a file, send it, and open
 * what it attached — the round trip, not just the request.
 *
 * `413` over the server's ceiling, which is the honest refusal a real backend
 * gives (contract §8 Q23). The queue's smaller 10 MB ceiling is NOT applied
 * here: that one belongs to the outbox, because it is a fact about how much of
 * a device's storage the app will hold while offline, not about what the
 * server accepts.
 */
export function postFile(req: TransportRequest): TransportResponse {
  const part = req.multipart;
  // one `reason`, not a positional one shadowed by an extra: `err` spreads the
  // extras over its own, so passing both means the second silently wins.
  if (part == null) return err(422, "a file part is required", { field: "file" });
  const { file, fields } = part;
  if (file.size > MAX_UPLOAD_BYTES) return err(413, `${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB is the limit`, { field: "file" });

  const taskId = fields?.taskId;
  const subtaskId = fields?.subtaskId;
  const captureId = fields?.captureId;
  const at = db.now().toISOString();

  // Where it lands in Dropbox. A file that belongs to a task goes under that
  // task's deliverables folder and everything else goes to the inbox, which is
  // the same rule the iOS Shortcut follows (contract §6) — one filing scheme,
  // not one per entry point.
  const folder = taskId != null ? `/JSTACK/Deliverables/${dayKey(db.now()).slice(0, 4)}/${taskId}` : "/JSTACK/Inbox";

  const stored: Attachment = {
    id: nextId("f-"),
    name: file.filename,
    kind: kindForFile(file.filename, file.contentType),
    size: file.size,
    storage: "store",
    folder,
    dropboxUrl: `https://www.dropbox.com/home${folder}/${encodeURIComponent(file.filename)}`,
    taskId,
    subtaskId,
    captureId,
    addedBy: "josh",
    at,
    // An upload inherits the silo of the task it joins, and the session's
    // default otherwise. It is never `unlabelled` in a way that would make it
    // visible to everyone: the gate above reads `labels.silo`, so a wrong
    // default here would be a leak rather than a cosmetic mistake.
    labels: db.get().tasks.find((t) => t.id === taskId)?.labels ?? { silo: db.currentSilos()[0] ?? "personal:josh", types: ["open"], setBy: "source" },
    setAt: dayKey(db.now()),
    focus: db.get().tasks.find((t) => t.id === taskId)?.focus ?? "all",
  };

  // A4R7-04: a capture queued offline names this file by the upload's offlineId —
  // the only name it has before the upload has replayed
  const offlineId = typeof fields?.offlineId === "string" && fields.offlineId !== "" ? fields.offlineId : null;
  // A4R8-03: a capture that went straight through while this upload waited in
  // the queue named it the same way, and the upload is filed with that capture
  // now — as if it had arrived first, the capture's silo and focus with it
  const waiting = offlineId == null ? undefined : db.get().brainItems.find((b) => b.id === db.get().captureByPendingUpload[offlineId]);
  const filed: Attachment = waiting == null ? stored : { ...stored, brainId: waiting.id, captureId: waiting.id, labels: waiting.labels, focus: waiting.focus };
  db.putBlob(filed.id, file);
  db.get().files = [...db.get().files, filed];
  if (offlineId != null) {
    db.get().fileByOfflineId[offlineId] = filed.id;
    delete db.get().captureByPendingUpload[offlineId];
  }
  return ok(withSignedUrl(filed));
}

/**
 * The rig's blob route: hand back what was uploaded. Test build only — this is
 * the one place the mock pretends to be a file server, and it exists so an
 * upload can be proven to have arrived intact rather than merely accepted.
 */
export function getFileBlob(_req: TransportRequest, id: string): TransportResponse {
  const blob = db.getBlob(id);
  if (blob == null) return err(404, "not found");
  return ok({ name: blob.filename, contentType: blob.contentType, size: blob.size });
}
