/**
 * Phase 6 · `files` — Dropbox under /JSTACK, metadata only (JSTACK-DASH-files-list).
 *
 * /JSTACK does not exist in Josh's Dropbox yet, so the one real listing is the workflow's empty one
 * (`tests/fixtures/n8n/files.root-missing.json`, with its refusal of a path outside /JSTACK). The
 * entries below are CONSTRUCTED to the workflow's own output (its Shape node: `id`, `name`, `path`,
 * `folder`, `size`, `modified`, `content_hash`, `web_url`), as the calendar's edge cases were.
 */
import type { Attachment, AttachmentList } from "@/data/types";
import { contractErrors, sample } from "./n8nContract";

type N8n = typeof import("@/data/transport/n8n");

const TASK = "68367f7f-fca7-47e7-9994-030332b958ff";
const entry = (name: string, folder: string, modified: string, size: number | null = 1200) => ({
  id: `id:${name}`,
  name,
  path: `${folder}/${name}`,
  folder,
  size,
  modified,
  content_hash: null,
  web_url: `https://www.dropbox.com/home${folder}?preview=${name}`,
});
const PAGE_1 = { count: 2, files: [entry("brief.pdf", `/JSTACK/Deliverables/2026/${TASK}`, "2026-09-29T01:00:00Z"), entry("notes.md", "/JSTACK/Inbox", "2026-09-30T01:00:00Z")], has_more: true, cursor: "c1" };
const PAGE_2 = { count: 1, files: [entry("budget.xlsx", "/JSTACK/Money", "2026-06-01T01:00:00Z", null)], has_more: false, cursor: null };

let pages: Record<string, unknown> = {};
let sent: Record<string, unknown>[] = [];
function load(): N8n["n8nTransport"] {
  let transport!: N8n["n8nTransport"];
  jest.isolateModules(() => {
    jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), DATA_SOURCE: "n8n", USE_API_ADAPTER: true, API_BASE_URL: null, N8N_BASE_URL: "http://127.0.0.1:9/n8n" }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its config mock
    transport = (require("@/data/transport/n8n") as N8n).n8nTransport;
  });
  return transport;
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-09-30T08:00:00.000Z"), advanceTimers: true });
  sent = [];
  pages = { first: PAGE_1, c1: PAGE_2 };
  globalThis.fetch = jest.fn(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as { cursor?: string };
    sent.push(Object.fromEntries(Object.entries(body).filter(([k]) => k !== "request_id")));
    return { status: 200, text: async () => JSON.stringify({ ok: true, data: pages[body.cursor ?? "first"] }) };
  }) as unknown as typeof fetch;
});
afterEach(() => jest.useRealTimers());

const list = async (query?: Record<string, string>) => ((await load()({ method: "GET", path: "/files", query })).json as AttachmentList).attachments;

describe("files · the listing", () => {
  it("every page, newest first, each a valid Attachment held in Dropbox", async () => {
    const res = await load()({ method: "GET", path: "/files" });
    expect(contractErrors(res.json, "/files")).toEqual([]);
    const files = (res.json as AttachmentList).attachments;
    expect(files.map((f) => [f.name, f.kind, f.storage, f.addedBy])).toEqual([
      ["notes.md", "text", "dropbox", "josh"],
      ["brief.pdf", "pdf", "dropbox", "ea"],
      ["budget.xlsx", "sheet", "dropbox", "ea"],
    ]);
    expect(sent).toEqual([{}, { cursor: "c1" }]);
    expect(files[1]).toMatchObject({ folder: `/JSTACK/Deliverables/2026/${TASK}`, taskId: TASK, dropboxUrl: `https://www.dropbox.com/home/JSTACK/Deliverables/2026/${TASK}?preview=brief.pdf`, size: 1200 });
    expect(files[2].size).toBeUndefined();
  });

  it("the mock's filter narrows it on the device: a word, a kind, who added it, a range", async () => {
    expect((await list({ q: "BRIEF" })).map((f) => f.name)).toEqual(["brief.pdf"]);
    expect((await list({ kind: "sheet" })).map((f) => f.name)).toEqual(["budget.xlsx"]);
    expect((await list({ addedBy: "josh" })).map((f) => f.name)).toEqual(["notes.md"]);
    expect((await list({ range: "week" })).map((f) => f.name).sort()).toEqual(["brief.pdf", "notes.md"]);
  });

  it("/JSTACK not made yet is the workflow's empty list — nothing filed, not an error", async () => {
    pages = { first: sample("files.root-missing").data };
    expect(await list()).toEqual([]);
  });

  it("a reply that is not a file list is this section's 502", async () => {
    pages = { first: { entries: [] } };
    expect((await load()({ method: "GET", path: "/files" })).status).toBe(502);
  });
});

describe("files · a task's files and one file", () => {
  it("a task's files are the ones in the folder named for it", async () => {
    const res = await load()({ method: "GET", path: `/tasks/${TASK}/files` });
    expect(contractErrors(res.json, "/tasks/{id}/files")).toEqual([]);
    expect((res.json as AttachmentList).attachments.map((f) => f.name)).toEqual(["brief.pdf"]);
  });

  it("one file by id, valid, and an unknown id 404", async () => {
    const t = load();
    const one = await t({ method: "GET", path: "/files/id:notes.md" });
    expect(contractErrors(one.json, "/files/{id}")).toEqual([]);
    expect((one.json as Attachment).name).toBe("notes.md");
    expect((await t({ method: "GET", path: "/files/id:nope" })).status).toBe(404);
  });
});
