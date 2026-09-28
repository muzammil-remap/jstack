/**
 * files.ts (X-1, §4.17) — what the app knows about files.
 *
 * Its own store for the reason `stores/replies.ts` is: files are read from
 * four surfaces with nothing else in common — the task card's Files section,
 * Brain › Files, the archive dialog and a `file` detail opened from Find —
 * and no one tab owns them. `stores/tasks.ts` holding the task's files would
 * make Brain reach into the Tasks store to render its own section.
 *
 * THREE SEPARATE LISTS, deliberately, rather than one filtered four ways:
 * `byTask` answers "what is on this task", `recent` answers "what arrived
 * lately" for Brain's section, and `archive` holds whatever the archive
 * dialog last asked for. They are different questions with different
 * lifetimes — the archive's filters must not disturb the section behind it —
 * and collapsing them would mean opening the archive silently re-filtered the
 * Brain section under the dialog.
 *
 * OFFLINE (FL-05): every list read falls back to `lib/recentFiles.ts`, the
 * device cache, and every successful read fills it. The cache holds metadata,
 * `previewText` and `dropboxUrl` and NEVER `url` or a body — `url` is a
 * short-lived signed credential and a body is the file itself, and neither
 * belongs in local storage. `lib/recentFiles.ts` enforces that on the way in
 * rather than trusting callers.
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import { isQueued } from "@/data/transport/outbox";
import { cacheFiles, cachedFiles } from "@/lib/recentFiles";
import { MAX_QUEUED_UPLOAD_BYTES, matchesFileFilter, type FileRange } from "@/data/files";
import { dayKey, now } from "@/lib/time";
import type { MultipartFile } from "@/data/transport/Transport";
import type { Attachment, AttachmentKind } from "@/data/types";

/**
 * The empty list, as ONE array.
 *
 * `useFilesStore((s) => s.byTask[id] ?? [])` looks harmless and is not: the
 * `?? []` mints a new array on every render, zustand's `useSyncExternalStore`
 * compares snapshots by reference, sees a change every time and re-renders
 * forever. React says so out loud — "The result of getSnapshot should be
 * cached to avoid an infinite loop" — and the native lane is what caught it
 * here. Any selector that could return "nothing" returns THIS.
 */
export const NO_FILES: readonly Attachment[] = [];

export type FileFilter = { q?: string; addedBy?: string; kind?: AttachmentKind | "all"; range?: FileRange; taskId?: string };

type FilesState = {
  byTask: Record<string, Attachment[]>;
  recent: Attachment[];
  archive: Attachment[];
  /** what the last upload refused to do, in the words a person reads (UP-03) */
  uploadError: string | null;
  loadTaskFiles: (taskId: string) => Promise<void>;
  loadRecent: () => Promise<void>;
  loadArchive: (filter: FileFilter) => Promise<void>;
  /** the stored file; `{ queued, ref }` when the outbox holds it; null when refused (`uploadError` says why) */
  upload: (file: MultipartFile, fields?: { taskId?: string; subtaskId?: string; captureId?: string }) => Promise<Attachment | { queued: true; ref: string } | null>;
  clearUploadError: () => void;
};

export const useFilesStore = create<FilesState>((set, get) => ({
  byTask: {},
  recent: [],
  archive: [],
  uploadError: null,

  loadTaskFiles: async (taskId) => {
    try {
      const { attachments } = await getAdapter().getTaskFiles(taskId);
      set({ byTask: { ...get().byTask, [taskId]: attachments } });
      await cacheFiles(attachments);
    } catch {
      // FL-05: the connection is down, so answer from the device. A task card
      // that shows nothing offline is indistinguishable from a task with no
      // files, which is the wrong thing to say.
      const cached = (await cachedFiles()).filter((f) => f.taskId === taskId);
      set({ byTask: { ...get().byTask, [taskId]: cached } });
    }
  },

  loadRecent: async () => {
    try {
      const { attachments } = await getAdapter().getFiles();
      set({ recent: attachments });
      await cacheFiles(attachments);
    } catch {
      set({ recent: await cachedFiles() });
    }
  },

  loadArchive: async (filter) => {
    try {
      const { attachments } = await getAdapter().getFiles(filter);
      set({ archive: attachments });
      await cacheFiles(attachments);
    } catch {
      set({ archive: filterCached(await cachedFiles(), filter) });
    }
  },

  /**
   * UP-02/UP-03. The size gate is in the OUTBOX, not here: how much of a
   * device the app will hold while offline is a property of the queue, and
   * putting it here would mean every future caller of `postFile` had to
   * remember it. What this owns is the SENTENCE — the outbox answers 507 and
   * this turns that into words a person can act on.
   *
   * A queued upload returns `null` with no error. That is not a failure: the
   * capture is safe and the file goes when the connection does.
   */
  upload: async (file, fields) => {
    set({ uploadError: null });
    try {
      const result = await getAdapter().postFile(file, fields);
      // A4R7-04: queued, the file has no id yet — a capture names it by the
      // upload's offlineId instead, which the server resolves when both replay
      if (isQueued(result)) return { queued: true, ref: `offline:${result.offlineId}` };
      const stored = result as Attachment;
      if (fields?.taskId != null) set({ byTask: { ...get().byTask, [fields.taskId]: [stored, ...(get().byTask[fields.taskId] ?? [])] } });
      set({ recent: [stored, ...get().recent] });
      return stored;
    } catch (e) {
      set({ uploadError: uploadMessage(e, file) });
      return null;
    }
  },

  clearUploadError: () => set({ uploadError: null }),
}));

/**
 * The honest lines (resolution #13). Three different refusals, three
 * different sentences — "something went wrong" would leave a person retrying
 * a 25 MB file forever.
 */
function uploadMessage(e: unknown, file: MultipartFile): string {
  const status = (e as { status?: number } | null)?.status;
  // 413 is the SERVER refusing the size; 507 is the OUTBOX refusing to hold it
  // offline. Two different refusals with two different remedies — wait for a
  // connection, or use a smaller file — so they get two different sentences
  // (resolution #13).
  if (status === 413) return "Too big · 25 MB is the limit";
  if (status === 507 || file.size > MAX_QUEUED_UPLOAD_BYTES) return "Needs a connection · files under 10 MB queue offline";
  return "That file did not go through · try again";
}

/** The same filters the server applies, over the cache, so an offline archive
 * narrows the way an online one does rather than ignoring the chips — the
 * ONE predicate (`matchesFileFilter`, F-19): this copy had lost `range`. */
function filterCached(rows: Attachment[], filter: FileFilter): Attachment[] {
  const today = dayKey(now());
  return rows.filter((f) => matchesFileFilter(f, filter, today));
}
