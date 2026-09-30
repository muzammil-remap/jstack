/**
 * The file lists, through the `files` webhook (JSTACK-DASH-files-list): Dropbox under `/JSTACK`,
 * metadata only — never a file's bytes, so `capabilities.fileStore` stays off and a file opens as
 * its Dropbox link.
 *
 *  - `GET /files` is every file under `/JSTACK` (every page, 5 at most), newest first, narrowed on
 *    the device by the mock's own filter (`data/files.ts` `matchesFileFilter`, shared);
 *  - `GET /tasks/{id}/files` is the files in a folder named for the task — the contract's own
 *    example path is `/JSTACK/Deliverables/2026/<taskId>`;
 *  - `GET /files/{id}` is one of them, else 404;
 *  - `/JSTACK` not existing yet is the workflow's empty list: nothing has been filed there.
 *
 * Who added a file is not in Dropbox's listing: a file in an `Inbox` folder is Josh's (what he
 * shares in lands there), anything else the EA's. Anything else in a reply is this section's 502.
 */
import { dayKey, now } from "@/lib/time";
import { kindForFile, matchesFileFilter } from "@/data/files";
import type { Attachment, AttachmentList } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { callWebhook } from "@/data/n8n/client";
import { inFocus } from "@/data/n8n/focus";
import type { Asked } from "@/data/n8n/registry";

const MAX_PAGES = 5;

type RawFile = { id: string; name: string; path: string; folder: string; size: number | null; modified: string | null; web_url: string };

class UnexpectedReply extends Error {}

const isString = (v: unknown): v is string => typeof v === "string";
const isRawFile = (f: unknown): f is RawFile => {
  if (f == null || typeof f !== "object") return false;
  const r = f as Record<string, unknown>;
  return isString(r.id) && isString(r.name) && isString(r.folder) && isString(r.web_url) && (r.size == null || typeof r.size === "number") && (r.modified == null || isString(r.modified));
};

function toAttachment(r: RawFile): Attachment {
  const at = r.modified != null && !Number.isNaN(Date.parse(r.modified)) ? new Date(r.modified).toISOString() : now().toISOString();
  const folderName = r.folder.split("/").pop() ?? "";
  return {
    id: r.id,
    name: r.name,
    kind: kindForFile(r.name),
    ...(r.size != null ? { size: r.size } : {}),
    storage: "dropbox",
    dropboxUrl: r.web_url,
    folder: r.folder,
    ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folderName) ? { taskId: folderName } : {}),
    addedBy: /\/inbox(\/|$)/i.test(r.folder) ? "josh" : "ea",
    at,
    labels: { silo: "personal:josh", types: [], setBy: "source" },
    setAt: at,
    focus: "personal",
  };
}

/** Every file under /JSTACK, following the cursor. */
async function loadFiles(): Promise<Attachment[]> {
  const all: RawFile[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = (await callWebhook("files", cursor == null ? {} : { cursor })) as { files?: unknown; has_more?: unknown; cursor?: unknown } | null;
    if (!Array.isArray(data?.files)) throw new UnexpectedReply("no files list");
    if (!data.files.every(isRawFile)) throw new UnexpectedReply("a file is not a file");
    all.push(...(data.files as RawFile[]));
    if (data.has_more !== true || !isString(data.cursor)) break;
    cursor = data.cursor;
    if (page === MAX_PAGES - 1) console.warn(`n8n files: stopped after ${MAX_PAGES} pages; /JSTACK holds more`);
  }
  return all.map(toAttachment).sort((a, b) => b.at.localeCompare(a.at));
}

async function answering(make: (files: Attachment[]) => TransportResponse): Promise<TransportResponse> {
  try {
    return make(await loadFiles());
  } catch (error) {
    if (error instanceof UnexpectedReply) return { status: 502, json: { reason: `Dropbox's file list answered in an unexpected shape: ${error.message}` } };
    throw error;
  }
}

export const filesAnswers = {
  list: (asked: Asked) =>
    answering((files) => {
      const q = asked.req.query ?? {};
      const today = dayKey(now());
      return { status: 200, json: { attachments: inFocus(files.filter((f) => matchesFileFilter(f, q, today)), q.focus) } satisfies AttachmentList };
    }),
  forTask: (asked: Asked) => answering((files) => ({ status: 200, json: { attachments: files.filter((f) => f.taskId === asked.params[0]) } satisfies AttachmentList })),
  byId: (asked: Asked) =>
    answering((files) => {
      const file = files.find((f) => f.id === asked.params[0]);
      return file != null ? { status: 200, json: file } : { status: 404, json: { reason: "not found" } };
    }),
};
