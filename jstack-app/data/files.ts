/**
 * The files vocabulary (X-1, §4.17) — one declaration the archive's filters,
 * the mock's handler and the tests all read.
 *
 * The same reasoning as `data/taskFilters.ts` (S-2): the filter chips and the
 * handler that applies them are on opposite sides of the wire, and two lists
 * of "which kinds are there" is the shape hard rule 16 exists to stop. The
 * mock imports this, and so does the dialog.
 *
 * The ranges are BACKWARD ONLY, and that is a decision rather than an
 * omission: a file has already arrived. Offering "next 90 days" over a list of
 * things that happened would be the same defect resolution #3 fixed on Done,
 * where a forward window on completions could only ever return nothing.
 */
import { addDays, dayKey, formatWhen } from "@/lib/time";
import { personLabel } from "@/lib/taskMeta";
import type { Attachment, AttachmentKind } from "./types";

export type FileRange = "all" | "week" | "month";

/** `days` is the window measured back from now; `all` has none. */
export const FILE_RANGES: readonly { id: FileRange; label: string; days?: number }[] = [
  { id: "all", label: "Any time" },
  { id: "week", label: "Last 7 days", days: 7 },
  { id: "month", label: "Last 30 days", days: 30 },
];

/**
 * Every `AttachmentKind` has a label (hard rule 21: no wire enum on screen).
 * `tests/unit/files.test.ts` asserts the map covers the union, so a kind added
 * to the type without a label here is a red test rather than a row reading
 * `sheet` in the middle of a sentence.
 */
export const FILE_KIND_LABELS: Record<AttachmentKind, string> = {
  pdf: "PDF",
  doc: "Document",
  sheet: "Spreadsheet",
  image: "Image",
  text: "Text",
  link: "Link",
};

/**
 * Sizes, in the units a person reads. Deliberately one decimal above a
 * megabyte and none below it: "1.8 MB" is useful and "1843.2 KB" is not, and
 * the exact byte count is a number nobody has ever wanted from a file row.
 */
export function formatSize(bytes: number | undefined): string | undefined {
  if (bytes == null) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The server's ceiling (contract §8 Q23, assumed 25 MB) and the queue's
 * (10 MB). They are different numbers for different reasons and both are here
 * so neither is a literal in a component: the first is what the backend will
 * refuse with a `413`, the second is how much of a person's device the outbox
 * is willing to hold while the connection is down (UP-03).
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_QUEUED_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * The meta line under a file's name — ONE composer, one order, every surface
 * (ux X1-04, rule 16).
 *
 * The task card read `PDF · 217 KB · EA · Yesterday 11:40am` and Brain read
 * `EA · PDF · Yesterday 11:40am` for the SAME file, because each list composed
 * its own. Two surfaces showing one thing show it in one form (rule 19), and
 * the acceptance IDs' own wordings — FL-02 "kind · producer · when · subtask",
 * FL-03 "who, kind, when and what it belongs to" — disagreed about the order,
 * so the sentence is corrected rather than the code left to read both ways.
 *
 * `belongsTo` is what the file hangs off in the CALLER's frame: the subtask on
 * a task card, the task in Brain. Last, because it is the part most rows do
 * not have, and a line that ends the same way and sometimes carries more is
 * easier to scan than one that ends differently per row.
 */
export function fileMetaLine(file: Pick<Attachment, "kind" | "size" | "addedBy" | "at">, belongsTo?: string): string {
  return [FILE_KIND_LABELS[file.kind], formatSize(file.size), personLabel(file.addedBy), formatWhen(file.at), belongsTo].filter(Boolean).join(" · ");
}

/** The kind a filename implies, for a picker that hands back a name and a MIME
 * type. Unknown extensions are `doc` rather than a guess with more confidence
 * than it has earned. */
/**
 * The archive's filters, once (F-19, P-10): `GET /files` in the mock and the
 * offline cache in `stores/files.ts` apply this same predicate — the cache
 * used to re-implement it minus `range`, so an offline archive ignored one
 * chip. `today` is the day key the range counts back from: the server's
 * clock on the server, the device's in the cache.
 */
export function matchesFileFilter(
  file: Pick<Attachment, "name" | "kind" | "addedBy" | "at" | "taskId" | "previewText">,
  filter: { q?: string; addedBy?: string; kind?: string; range?: string; taskId?: string },
  today: string,
): boolean {
  if (filter.taskId != null && filter.taskId !== "" && file.taskId !== filter.taskId) return false;
  if (filter.addedBy != null && filter.addedBy !== "" && filter.addedBy !== "all" && file.addedBy !== filter.addedBy) return false;
  if (filter.kind != null && filter.kind !== "" && filter.kind !== "all" && file.kind !== filter.kind) return false;
  const days = FILE_RANGES.find((r) => r.id === filter.range)?.days;
  if (days != null && dayKey(new Date(file.at)) < addDays(today, -days)) return false;
  const needle = filter.q?.trim().toLowerCase();
  if (needle != null && needle !== "" && !file.name.toLowerCase().includes(needle) && !(file.previewText ?? "").toLowerCase().includes(needle)) return false;
  return true;
}

export function kindForFile(name: string, contentType?: string): AttachmentKind {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (contentType?.startsWith("image/") === true || ["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return "image";
  if (ext === "pdf" || contentType === "application/pdf") return "pdf";
  if (["csv", "xlsx", "xls", "tsv"].includes(ext)) return "sheet";
  if (["md", "txt", "log", "json"].includes(ext)) return "text";
  return "doc";
}

/**
 * What a file hangs off, when the wire says only WHICH KIND of thing it is
 * (ux S6-31; `BRAIN_PROPOSAL.md` row 7's last field). `Attachment` carries the
 * parent's id and never its title, so the archive and Brain's Files section
 * name the kind of parent rather than inventing a name — a caller that knows
 * the parent (the task card, which names the subtask) passes its own
 * `belongsTo`. A file with no parent gets no field, not a made-up one.
 */
export function fileBelongsTo(file: Pick<Attachment, "taskId" | "subtaskId" | "brainId" | "captureId">): string | undefined {
  if (file.subtaskId != null) return "on a subtask";
  if (file.taskId != null) return "on a task";
  if (file.captureId != null || file.brainId != null) return "with a capture";
  return undefined;
}
