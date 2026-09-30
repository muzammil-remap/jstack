/**
 * Phase 6 · `actions` — Needs you from the actions store (JSTACK-DASH-actions): the mock's rules
 * (`data/mock/handlers/decisions.ts`) and the contract's statuses, on the store's real replies.
 *
 * Driven through the real transport and the real client, `fetch` answering each `op` with its real
 * reply (B-17: no outbound call). The samples are the store's answers about REMAP's two test cards
 * (`dashtest-p6-curl`, `dashtest-p6-ui`) — nothing of Josh's; the error samples carry the HTTP status
 * the workflow answered in their names.
 */
import type { ActionItem, TodayComposite } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { contractErrors, sample } from "./n8nContract";

type N8n = typeof import("@/data/transport/n8n");

type Reply = { status: number; body: unknown };
type Sent = { key: string; body: Record<string, unknown> };

const data = <T>(name: string) => sample(name).data as T;
const open = data<{ items: Record<string, unknown>[]; totalOpen: number }>("actions.open");
const card = data<{ item: Record<string, unknown> }>("actions.get").item;
const errorReply = (name: string): Reply => ({ status: Number(/(\d{3})/.exec(name)![1]), body: sample(name) });
const okReply = (payload: unknown): Reply => ({ status: 200, body: { ok: true, data: payload } });

let sent: Sent[] = [];
let answer: (s: Sent) => Reply = () => ({ status: 500, body: {} });

function load(): N8n["n8nTransport"] {
  let transport!: N8n["n8nTransport"];
  jest.isolateModules(() => {
    jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), DATA_SOURCE: "n8n", USE_API_ADAPTER: true, API_BASE_URL: null, N8N_BASE_URL: "http://127.0.0.1:9/n8n" }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its config mock
    transport = (require("@/data/transport/n8n") as N8n).n8nTransport;
  });
  return transport;
}

/** the store as the workflow answers it: every `op` from its real reply, unless a case says otherwise */
function store(overrides: Partial<Record<string, (s: Sent) => Reply>> = {}): (s: Sent) => Reply {
  const real: Record<string, (s: Sent) => Reply> = {
    list: (s) => okReply(s.body.state === "history" ? data("actions.history") : open),
    get: (s) => (s.body.id === card.id ? okReply({ item: card }) : errorReply("actions.error.404-not-found")),
    answer: () => okReply(data("actions.answer")),
    undo: () => okReply(data("actions.undo")),
  };
  return (s) => ({ ...real, ...overrides })[String(s.body.op)]?.(s) ?? { status: 400, body: { ok: false, error: { code: "VALIDATION_ERROR", message: "unknown op" } } };
}

beforeEach(() => {
  sent = [];
  answer = store();
  globalThis.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
    const s: Sent = { key: String(url).split("/").pop() ?? "", body: JSON.parse(init?.body ?? "{}") };
    sent.push(s);
    if (s.key !== "actions") return Promise.reject(new TypeError("Failed to fetch"));
    const reply = answer(s);
    return { status: reply.status, text: async () => JSON.stringify(reply.body) };
  }) as unknown as typeof fetch;
});

const get = (t: N8n["n8nTransport"], path: string, query?: Record<string, string>) => t({ method: "GET", path, query });
const post = (t: N8n["n8nTransport"], path: string, body?: Record<string, unknown>) => t({ method: "POST", path, body });
const ops = () => sent.map((s) => s.body.op);
/** the request the workflow saw, without the client's own `request_id` */
const bodyOf = (s: Sent) => Object.fromEntries(Object.entries(s.body).filter(([k]) => k !== "request_id"));

describe("Phase 6 · actions · the lists", () => {
  it("the open list is a valid ActionList, by rank", async () => {
    const res = await get(load(), "/actions", { state: "open" });
    expect(res.status).toBe(200);
    expect(contractErrors(res.json, "/actions")).toEqual([]);
    expect((res.json as ActionItem[]).map((a) => [a.id, a.state, a.rank])).toEqual([
      ["dashtest-p6-curl", "open", 1],
      ["dashtest-p6-ui", "open", 2],
    ]);
    expect(bodyOf(sent[0])).toEqual({ op: "list", state: "open" });
  });

  it("five at most, lowest rank first — the mock's cap, applied after the focus", async () => {
    const seven = [7, 3, 5, 1, 6, 2, 4].map((rank) => ({ ...open.items[0], id: `dashtest-rank-${rank}`, rank }));
    answer = store({ list: () => okReply({ items: seven, totalOpen: 7 }) });
    const res = await get(load(), "/actions");
    expect((res.json as ActionItem[]).map((a) => a.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("a focus narrows by the card's silo: both test cards are personal, so Work is empty", async () => {
    const t = load();
    expect(((await get(t, "/actions", { focus: "personal" })).json as ActionItem[]).length).toBe(2);
    expect((await get(t, "/actions", { focus: "work" })).json).toEqual([]);
  });

  it("history is the answered cards, valid, each with the store's answer as its last history entry; ?q= narrows by title", async () => {
    const t = load();
    const res = await get(t, "/actions", { state: "history" });
    expect(contractErrors(res.json, "/actions")).toEqual([]);
    const [answered] = res.json as ActionItem[];
    expect({ id: answered.id, state: answered.state, last: answered.history.at(-1) }).toEqual({
      id: "dashtest-p6-curl",
      state: "answered",
      last: { verb: "never", at: expect.any(String), via: "app" },
    });
    expect(bodyOf(sent[0])).toEqual({ op: "list", state: "history", limit: 100 });
    expect(((await get(t, "/actions", { state: "history", q: "CURL" })).json as ActionItem[]).length).toBe(1);
    expect((await get(t, "/actions", { state: "history", q: "nothing like it" })).json).toEqual([]);
  });

  it("a card the contract cannot draw is left out, named once in the console; the rest still show", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { toast: _toast, ...noToast } = open.items[0];
    const twoOptions = { ...open.items[1], options: (open.items[1].options as unknown[]).slice(0, 2) };
    answer = store({ list: () => okReply({ items: [noToast, twoOptions, { ...open.items[0], id: "dashtest-fine" }], totalOpen: 3 }) });
    const t = load();
    expect(((await get(t, "/actions")).json as ActionItem[]).map((a) => a.id)).toEqual(["dashtest-fine"]);
    await get(t, "/actions", { focus: "personal" });
    expect(warn.mock.calls.map(([m]) => String(m))).toEqual([
      expect.stringContaining("dashtest-p6-curl is not shown — toast"),
      expect.stringContaining("dashtest-p6-ui is not shown — options"),
    ]);
    warn.mockRestore();
  });

  it("a reply with no list is this section's 502, never an empty Needs you", async () => {
    answer = store({ list: () => okReply({ cards: [] }) });
    expect((await get(load(), "/actions")).status).toBe(502);
  });
});

describe("Phase 6 · actions · one card", () => {
  it("GET /actions/{id} is the store's card as a valid ActionItem", async () => {
    const res = await get(load(), "/actions/dashtest-p6-curl");
    expect(res.status).toBe(200);
    expect(contractErrors(res.json, "/actions/{id}")).toEqual([]);
    expect(bodyOf(sent[0])).toEqual({ op: "get", id: "dashtest-p6-curl" });
  });

  it("a card the store does not hold is 404; one it holds but the contract cannot draw, 502", async () => {
    const t = load();
    expect((await get(t, "/actions/dashtest-p6-missing")).status).toBe(404);
    const { receipt: _receipt, ...noReceipt } = card;
    answer = store({ get: () => okReply({ item: noReceipt }) });
    expect((await get(t, "/actions/dashtest-p6-curl")).status).toBe(502);
  });
});

describe("Phase 6 · actions · answering and undo", () => {
  it("Never: the store is asked in its own words, and the answer is the card, answered, valid", async () => {
    const res = await post(load(), "/actions/dashtest-p6-curl", { verb: "never" });
    expect(res.status).toBe(200);
    expect(contractErrors(res.json, "/actions/{id}", "POST")).toEqual([]);
    expect({ state: (res.json as ActionItem).state, last: (res.json as ActionItem).history.at(-1)?.verb }).toEqual({ state: "answered", last: "never" });
    expect(sent.map(bodyOf)).toEqual([{ op: "answer", id: "dashtest-p6-curl", verb: "never" }]);
  });

  it("each verb sends only the fields it carries", async () => {
    const t = load();
    await post(t, "/actions/dashtest-p6-curl", { verb: "later", until: "2026-10-05T22:00:00.000Z" });
    await post(t, "/actions/dashtest-p6-curl", { verb: "revise", revision: "shorter" });
    await post(t, "/actions/dashtest-p6-curl", { verb: "teach", rule: "always ask" });
    expect(sent.map(bodyOf)).toEqual([
      { op: "answer", id: "dashtest-p6-curl", verb: "later", until: "2026-10-05T22:00:00.000Z" },
      { op: "answer", id: "dashtest-p6-curl", verb: "revise", revision: "shorter" },
      { op: "answer", id: "dashtest-p6-curl", verb: "teach", rule: "always ask" },
    ]);
  });

  it("Approve reads the card first: an opts card is answered with its option", async () => {
    await post(load(), "/actions/dashtest-p6-curl", { verb: "approve", option: 2 });
    expect(sent.map(bodyOf)).toEqual([
      { op: "get", id: "dashtest-p6-curl" },
      { op: "answer", id: "dashtest-p6-curl", verb: "approve", option: 2 },
    ]);
  });

  it("Approve on an email card is 501 and the card is never answered: its draft is gmail-draft's, not wired yet", async () => {
    answer = store({ get: () => okReply({ item: { ...card, kind: "quote", quote: "Hi —" } }) });
    expect(await post(load(), "/actions/dashtest-p6-curl", { verb: "approve" })).toEqual({ status: 501, json: { reason: "not connected yet" } });
    expect(ops()).toEqual(["get"]);
  });

  it("after an answer the next read asks the store again — the 30-second sharing does not keep the old list", async () => {
    const t = load();
    await get(t, "/actions");
    await get(t, "/actions");
    await post(t, "/actions/dashtest-p6-curl", { verb: "never" });
    await get(t, "/actions");
    expect(ops()).toEqual(["list", "answer", "list"]);
  });

  it("the contract's refusals: a second answer and a late undo are 409, nothing to undo is 409, a bad verb 422", async () => {
    const t = load();
    answer = store({ answer: () => errorReply("actions.error.409-conflict") });
    expect((await post(t, "/actions/dashtest-p6-curl", { verb: "never" })).status).toBe(409);
    answer = store({ undo: () => errorReply("actions.error.409-undo-expired") });
    expect((await post(t, "/actions/dashtest-p6-curl/undo")).status).toBe(409);
    answer = store({ undo: () => errorReply("actions.error.409-nothing-to-undo") });
    expect((await post(t, "/actions/dashtest-p6-ui/undo")).status).toBe(409);
    answer = store({ answer: () => errorReply("actions.error.400-validation") });
    expect((await post(t, "/actions/dashtest-p6-missing", { verb: "bogus" })).status).toBe(422);
  });

  it("undo in the window is the card, open again, valid", async () => {
    const res = await post(load(), "/actions/dashtest-p6-curl/undo");
    expect(res.status).toBe(200);
    expect(contractErrors(res.json, "/actions/{id}/undo", "POST")).toEqual([]);
    expect((res.json as ActionItem).state).toBe("open");
    expect(sent.map(bodyOf)).toEqual([{ op: "undo", id: "dashtest-p6-curl" }]);
  });

  it("reopening from the history and editing a draft are not connected yet: 501, nothing sent", async () => {
    const t = load();
    const refused: TransportResponse = { status: 501, json: { reason: "not connected yet" } };
    expect(await post(t, "/actions/dashtest-p6-curl/reopen")).toEqual(refused);
    expect(await t({ method: "PUT", path: "/actions/dashtest-p6-curl/draft", body: { body: "x" } })).toEqual(refused);
    expect(sent).toEqual([]);
  });
});

describe("Phase 6 · actions · Today's Needs you", () => {
  it("is exactly GET /actions's answer, and the two share one call", async () => {
    // Today's other sources: the calendar and the tasks, each its real empty reply
    const others: Record<string, unknown> = { calendar: sample("calendar.empty"), tasks: sample("tasks.empty") };
    const inner = globalThis.fetch as jest.Mock;
    globalThis.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
      const key = String(url).split("/").pop() ?? "";
      if (others[key] == null) return inner(url, init);
      sent.push({ key, body: JSON.parse(init?.body ?? "{}") });
      return { status: 200, text: async () => JSON.stringify(others[key]) };
    }) as unknown as typeof fetch;
    const t = load();
    const today = (await get(t, "/today")).json as TodayComposite;
    expect(today.needsYou).toEqual((await get(t, "/actions")).json);
    expect(today.needsYou.map((a) => a.id)).toEqual(["dashtest-p6-curl", "dashtest-p6-ui"]);
    expect(sent.filter((s) => s.key === "actions")).toHaveLength(1);
  });
});
