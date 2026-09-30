/**
 * `brain` — the brain store (JSTACK-DASH-brain): captures, journal lines and Dictate-to-EA chat from
 * Josh; replies and insights from the EA.
 *
 * The EA's test reply and insight are real replies (`tests/fixtures/n8n/brain.*`, REMAP's
 * `dashtest-p6-` items); Josh's items are built to the store's own item shape (its Decide node's
 * `toItem`: id, kind, text, source, by, state, offlineId, data, createdAt, updatedAt).
 */
import type { BrainItem, ChatThread, DumpResult, Insight, Reply, TodayComposite } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { contractErrors, emptyRecordsReply, sample } from "./n8nContract";

type N8n = typeof import("@/data/transport/n8n");
type Sent = { key: string; body: Record<string, unknown> };

const insight = (sample("brain.put-insight").data as { item: Record<string, unknown> }).item;
const reply = (sample("brain.put-reply").data as { item: Record<string, unknown> }).item;
const item = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({ id, kind, text: `${kind} ${id}`, source: "typed", by: "josh", state: "new", offlineId: null, data: {}, createdAt: "2026-09-30T08:00:00.000Z", updatedAt: "2026-09-30T08:00:00.000Z", ...extra });

let items: Record<string, unknown>[] = [];
let sent: Sent[] = [];
let calendarReply: { status: number; body: unknown } = { status: 200, body: { ok: true, data: { event: { id: "evt-dashtest-1" } } } };

function load(): N8n["n8nTransport"] {
  let transport!: N8n["n8nTransport"];
  jest.isolateModules(() => {
    jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), DATA_SOURCE: "n8n", USE_API_ADAPTER: true, API_BASE_URL: null, N8N_BASE_URL: "http://127.0.0.1:9/n8n" }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its config mock
    transport = (require("@/data/transport/n8n") as N8n).n8nTransport;
  });
  return transport;
}

/** the store: `list` filters kinds and states as the workflow does; `put` echoes the item; `update` merges */
function brain(body: Record<string, unknown>): { status: number; body: unknown } {
  const ok = (data: unknown) => ({ status: 200, body: { ok: true, data } });
  if (body.op === "list") {
    const kinds = body.kinds as string[] | undefined;
    const states = body.states as string[] | undefined;
    return ok({ items: items.filter((i) => (kinds == null || kinds.includes(i.kind as string)) && (states == null || states.includes(i.state as string))), truncated: false });
  }
  if (body.op === "put") {
    const it = body.item as Record<string, unknown>;
    return ok({ item: item(`b-${String(it.offlineId ?? "x")}`, it.kind as string, { text: it.text, source: it.source ?? "typed", offlineId: it.offlineId ?? null, data: it.data ?? {} }) });
  }
  const found = items.find((i) => i.id === body.id);
  if (found == null) return { status: 404, body: sample("brain.error.404-not-found") };
  if (body.op === "get") return ok({ item: found });
  const patch = body.patch as { state?: string; data?: Record<string, unknown> };
  return ok({ item: { ...found, state: patch.state ?? found.state, data: { ...(found.data as object), ...(patch.data ?? {}) } } });
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-09-30T08:00:00.000Z"), advanceTimers: true });
  items = [];
  sent = [];
  calendarReply = { status: 200, body: { ok: true, data: { event: { id: "evt-dashtest-1" } } } };
  globalThis.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
    const key = String(url).split("/").pop() ?? "";
    const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
    sent.push({ key, body: Object.fromEntries(Object.entries(body).filter(([k]) => k !== "request_id")) });
    const r = key === "brain" ? brain(body) : key === "calendar-edit" ? calendarReply : key === "records" ? { status: 200, body: JSON.parse(emptyRecordsReply(init?.body)) } : { status: 200, body: sample(key === "calendar" ? "calendar.empty" : key === "tasks" ? "tasks.empty" : "actions.empty") };
    return { status: r.status, text: async () => JSON.stringify(r.body) };
  }) as unknown as typeof fetch;
});
afterEach(() => jest.useRealTimers());

const call = (t: N8n["n8nTransport"], method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<TransportResponse> => t({ method, path, body });
const brainBodies = () => sent.filter((s) => s.key === "brain").map((s) => s.body);

describe("brain · what Josh sends: a capture, a journal line, a chat line", () => {
  it("a capture goes by Josh with its offlineId, and shows at once as not yet filed — no routing made up", async () => {
    const res = await call(load(), "POST", "/brain/dump", { text: "buy milk", source: "typed", offlineId: "dashtest-p6-cap-0001", url: "https://example.com" });
    expect(contractErrors(res.json, "/brain/dump", "POST")).toEqual([]);
    const { item: made, routed } = res.json as DumpResult;
    expect({ routed, routing: made.routing, labels: made.labels.types }).toEqual({ routed: ["→ filing · Librarian"], routing: undefined, labels: ["unlabelled"] });
    expect(brainBodies()).toEqual([{ op: "put", by: "josh", item: { kind: "capture", text: "buy milk", source: "typed", offlineId: "dashtest-p6-cap-0001", data: { url: "https://example.com" } } }]);
  });

  it("a capture with no words is refused before anything is sent; an offlineId the store cannot take is left off", async () => {
    const t = load();
    expect(await call(t, "POST", "/brain/dump", { source: "voice", audioRef: "a" })).toEqual({ status: 422, json: { field: "text", reason: "a capture needs its words" } });
    expect(sent).toEqual([]);
    await call(t, "POST", "/brain/dump", { text: "x", source: "typed", offlineId: "has spaces" });
    expect((brainBodies()[0].item as Record<string, unknown>).offlineId).toBeUndefined();
  });

  it("a journal line is its own kind, meta '<source> · Close the day', valid", async () => {
    const res = await call(load(), "POST", "/journal", { text: "a good day", source: "typed", offlineId: "dashtest-p6-jrn-0001" });
    expect(contractErrors(res.json, "/journal", "POST")).toEqual([]);
    expect({ source: (res.json as BrainItem).source, meta: (res.json as BrainItem).meta }).toEqual({ source: "journal", meta: "typed · Close the day" });
    expect((brainBodies()[0].item as Record<string, unknown>).kind).toBe("journal");
  });

  it("a chat line is put for the EA, and the answer waits for the thread: no reply yet", async () => {
    const res = await call(load(), "POST", "/chat", { text: "what's on Friday?" });
    expect(res).toEqual({ status: 200, json: { reply: "", sources: [] } });
    expect((brainBodies()[0].item as Record<string, unknown>).kind).toBe("chat");
  });
});

describe("brain · what comes back", () => {
  it("Latest in: captures and journal lines; one the EA filed carries the EA's routing and labels", async () => {
    items = [
      item("c1", "capture"),
      item("c2", "capture", { state: "filed", data: { routing: { kind: "task", silos: ["work"], labels: ["deals", "not-a-type"], sensitivity: "normal", storage: "twenty" } } }),
      item("j1", "journal", { state: "filed" }),
      { ...reply },
    ];
    const res = await call(load(), "GET", "/brain/latest");
    expect(contractErrors(res.json, "/brain/latest")).toEqual([]);
    const rows = res.json as BrainItem[];
    expect(rows.map((r) => [r.id, r.routed, r.routing?.kind ?? null, r.labels.silo, r.labels.types, r.focus])).toEqual([
      ["c1", ["→ filing · Librarian"], null, "personal:josh", ["unlabelled"], "personal"],
      ["c2", [], "task", "work", ["deals"], "work"],
      ["j1", [], null, "personal:josh", ["unlabelled"], "personal"],
    ]);
  });

  it("the Dictate thread: Josh's chat and the EA's answers to it, oldest first; a note to nothing is not in it", async () => {
    items = [
      item("ch1", "chat", { createdAt: "2026-09-30T07:00:00.000Z" }),
      item("r1", "reply", { by: "ea", state: "open", createdAt: "2026-09-30T07:01:00.000Z", data: { inReplyTo: "ch1", sources: [{ label: "calendar", ref: "cal:1" }] } }),
      { ...reply },
    ];
    const res = await call(load(), "GET", "/chat/thread");
    expect(contractErrors(res.json, "/chat/thread")).toEqual([]);
    expect((res.json as ChatThread).turns).toEqual([
      { from: "josh", text: "chat ch1" },
      { from: "ea", text: "reply r1", sources: ["calendar"] },
    ]);
  });

  it("replies: the EA's open ones, valid; read is the reply dismissed", async () => {
    items = [{ ...reply }];
    const t = load();
    const list = await call(t, "GET", "/brain/replies");
    expect(contractErrors(list.json, "/brain/replies")).toEqual([]);
    expect((list.json as Reply[]).map((r) => [r.id, r.read])).toEqual([["dashtest-p6-reply-1", false]]);
    const read = await call(t, "PATCH", "/brain/replies/dashtest-p6-reply-1", { read: true });
    expect({ read: (read.json as Reply).read, sent: brainBodies().at(-1) }).toEqual({ read: true, sent: { op: "update", id: "dashtest-p6-reply-1", patch: { state: "dismissed" } } });
  });
});

describe("brain · the EA's insight on Today, and its two verbs", () => {
  it("Today's insight is the newest open one with a block, valid", async () => {
    items = [{ ...insight }];
    const today = (await call(load(), "GET", "/today")).json as TodayComposite;
    expect(contractErrors(today, "/today")).toEqual([]);
    expect({ id: today.insight?.id, primary: today.insight?.primary.action, why: today.insight?.why }).toEqual({ id: "dashtest-p6-insight-1", primary: "block", why: "a REMAP wiring test (dashtest) — not from the EA" });
  });

  it("Block it makes the event through calendar-edit, then answers the insight with it", async () => {
    items = [{ ...insight }];
    const res = await call(load(), "POST", "/insights/dashtest-p6-insight-1", { action: "block" });
    expect(contractErrors(res.json, "/insights/{id}", "POST")).toEqual([]);
    expect({ state: (res.json as Insight).state, result: (res.json as Insight).result }).toEqual({ state: "done", result: "Blocked · in your calendar" });
    const block = (insight.data as { block: Record<string, string> }).block;
    expect(sent.filter((s) => s.key === "calendar-edit").map((s) => s.body)).toEqual([{ op: "block", ...block, description: insight.text }]);
    expect(brainBodies().at(-1)).toEqual({ op: "update", id: "dashtest-p6-insight-1", patch: { state: "answered", data: { answer: { verb: "block", eventId: "evt-dashtest-1", at: "2026-09-30T08:00:00.000Z" } } } });
  });

  it("Leave it answers the insight and makes nothing; an insight with no block cannot be blocked", async () => {
    items = [{ ...insight }, { ...insight, id: "dashtest-p6-insight-2", data: { because: "x" } }];
    const t = load();
    expect(((await call(t, "POST", "/insights/dashtest-p6-insight-1", { action: "leave" })).json as Insight).result).toBe("Left open");
    expect(sent.some((s) => s.key === "calendar-edit")).toBe(false);
    expect(await call(t, "POST", "/insights/dashtest-p6-insight-2", { action: "block" })).toEqual({ status: 422, json: { field: "block", reason: "this insight holds no time to block" } });
  });

  it("a block Google refuses leaves the insight open: the refusal comes back, nothing is answered", async () => {
    items = [{ ...insight }];
    calendarReply = { status: 422, body: { ok: false, error: { code: "VALIDATION_ERROR", message: "Google refused the change" } } };
    const res = await call(load(), "POST", "/insights/dashtest-p6-insight-1", { action: "block" });
    expect(res.status).toBe(422);
    expect(brainBodies().some((b) => b.op === "update")).toBe(false);
  });

  it("the store's refusals: an unknown item 404, a bad body 422", async () => {
    const t = load();
    expect((await call(t, "GET", "/brain/items/nope")).status).toBe(404);
    expect((await call(t, "PATCH", "/brain/replies/nope", { read: true })).status).toBe(404);
  });
});
