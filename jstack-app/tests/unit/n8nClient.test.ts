/**
 * ADR-76 — `callWebhook`, the one way the app reaches n8n: what it sends, what it makes of each kind
 * of answer, when it tries again, and when two asks share one request.
 *
 * `fetch` is stubbed throughout — a unit test never makes an outbound call (B-17) — and the module
 * is loaded fresh per test, so the 30-second sharing of one test cannot answer the next.
 */
import type { N8nError } from "@/data/n8n/client";

type Client = typeof import("@/data/n8n/client");
type Call = { url: string; init: RequestInit & { headers: Record<string, string> } };

const BASE = "http://127.0.0.1:8787/n8n";
const reply = (status: number, body: unknown) => ({ status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });

let calls: Call[] = [];
let answers: (() => Promise<unknown>)[] = [];

function load(config: Record<string, unknown> = {}): Client {
  let client!: Client;
  jest.isolateModules(() => {
    jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), N8N_BASE_URL: BASE, API_TIMEOUT_MS: 15_000, ...config }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its config mock
    client = require("@/data/n8n/client") as Client;
  });
  return client;
}

beforeEach(() => {
  calls = [];
  answers = [];
  globalThis.fetch = jest.fn(async (url: string, init: Call["init"]) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (next == null) throw new Error("unit test: no answer queued for fetch");
    return next();
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
  delete (globalThis as { location?: unknown }).location;
});

const answer = (status: number, body: unknown) => answers.push(async () => reply(status, body));
const dropped = () => answers.push(async () => Promise.reject(new TypeError("Failed to fetch")));

describe("ADR-76 · what callWebhook sends", () => {
  it("POSTs JSON to <base>/<key> with a request id, and no header but the content type", async () => {
    const { callWebhook } = load();
    answer(200, { ok: true, request_id: "x", data: { events: [] } });
    await expect(callWebhook("calendar", { timeMin: "a", timeMax: "b" })).resolves.toEqual({ events: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/calendar`);
    expect(calls[0].init.method).toBe("POST");
    expect(Object.keys(calls[0].init.headers)).toEqual(["content-type"]);
    const sent = JSON.parse(String(calls[0].init.body)) as Record<string, string>;
    expect(sent.timeMin).toBe("a");
    expect(sent.request_id).toMatch(/^dash-/);
  });

  it("resolves a relative base against the page, the production same-origin form", async () => {
    (globalThis as { location?: unknown }).location = { href: "https://jstack.example/today", protocol: "https:", hostname: "jstack.example" };
    const { callWebhook } = load({ N8N_BASE_URL: "/n8n" });
    answer(200, { ok: true, data: [] });
    await callWebhook("tasks", { limit: 60 });
    expect(calls[0].url).toBe("https://jstack.example/n8n/tasks");
  });

  it("refuses to run on a cleartext page that is not loopback, before anything is sent", async () => {
    (globalThis as { location?: unknown }).location = { href: "http://jstack.example/", protocol: "http:", hostname: "jstack.example" };
    const { callWebhook } = load({ N8N_BASE_URL: "/n8n" });
    await expect(callWebhook("tasks", {})).rejects.toThrow(/insecure origin/);
    expect(calls).toHaveLength(0);
  });
});

describe("ADR-76 · what callWebhook makes of an answer", () => {
  it("a DASH refusal is the contract's status: VALIDATION_ERROR is a 422, and a 4xx is not tried again", async () => {
    const { callWebhook } = load();
    answer(400, { ok: false, request_id: "x", error: { code: "VALIDATION_ERROR", message: "timeMin is required" } });
    const error = (await callWebhook("calendar", {}).catch((e: unknown) => e)) as N8nError;
    expect({ status: error.status, code: error.code, message: error.message }).toEqual({ status: 422, code: "VALIDATION_ERROR", message: "timeMin is required" });
    expect(calls).toHaveLength(1);
  });

  it("UNDO_EXPIRED is a 409 and NOT_FOUND a 404", async () => {
    const { callWebhook } = load();
    answer(409, { ok: false, error: { code: "UNDO_EXPIRED", message: "too late" } });
    answer(404, { ok: false, error: { code: "NOT_FOUND", message: "no such card" } });
    expect(((await callWebhook("actions", { op: "undo", id: "a" }, { write: true }).catch((e: unknown) => e)) as N8nError).status).toBe(409);
    expect(((await callWebhook("actions", { op: "get", id: "b" }).catch((e: unknown) => e)) as N8nError).status).toBe(404);
  });

  it("a 2xx that is not the envelope is the workflow's fault — a 502, never data", async () => {
    const { callWebhook } = load();
    answer(200, { message: "Workflow was started" });
    const error = (await callWebhook("tasks", {}).catch((e: unknown) => e)) as N8nError;
    expect({ status: error.status, code: error.code }).toEqual({ status: 502, code: "BAD_REPLY" });
  });

  it("a 5xx is tried once more, then surfaces with its status", async () => {
    const { callWebhook } = load();
    answer(502, { ok: false, error: { code: "UPSTREAM_UNREACHABLE", message: "n8n did not answer" } });
    answer(502, { ok: false, error: { code: "UPSTREAM_UNREACHABLE", message: "n8n did not answer" } });
    const error = (await callWebhook("tasks", {}).catch((e: unknown) => e)) as N8nError;
    expect(error.status).toBe(502);
    expect(calls).toHaveLength(2);
  });

  it("a 5xx followed by an answer is the answer", async () => {
    const { callWebhook } = load();
    answer(500, "<html>bad gateway</html>");
    answer(200, { ok: true, data: { n: 1 } });
    await expect(callWebhook("tasks", {})).resolves.toEqual({ n: 1 });
  });

  it("a dropped connection is tried once more, then thrown as the network's own error", async () => {
    const { callWebhook } = load();
    dropped();
    dropped();
    await expect(callWebhook("tasks", {})).rejects.toThrow("Failed to fetch");
    expect(calls).toHaveLength(2);
  });

  it("a request nothing answers is abandoned at the timeout, as a network failure the outbox recognises", async () => {
    jest.useFakeTimers();
    const { callWebhook } = load({ API_TIMEOUT_MS: 1000 });
    const hang = () =>
      answers.push(
        () =>
          new Promise((_resolve, reject) => {
            const signal = calls[calls.length - 1].init.signal as AbortSignal;
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
    hang();
    hang();
    const pending = callWebhook("calendar", {}).catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);
    const error = (await pending) as Error;
    expect(error.message).toMatch(/^network timeout: calendar did not answer/);
    expect(calls).toHaveLength(2);
  });
});

describe("ADR-76 · one request per page load", () => {
  it("the same key and body within 30 s share one request, whatever order the body's keys were written in", async () => {
    const { callWebhook } = load();
    answer(200, { ok: true, data: { events: ["e1"] } });
    const [a, b] = await Promise.all([callWebhook("calendar", { timeMin: "a", timeMax: "b" }), callWebhook("calendar", { timeMax: "b", timeMin: "a" })]);
    expect(a).toEqual({ events: ["e1"] });
    expect(b).toBe(a);
    expect(calls).toHaveLength(1);
  });

  it("a different body, or a different key, is its own request", async () => {
    const { callWebhook } = load();
    answer(200, { ok: true, data: 1 });
    answer(200, { ok: true, data: 2 });
    answer(200, { ok: true, data: 3 });
    await callWebhook("calendar", { timeMin: "a" });
    await callWebhook("calendar", { timeMin: "b" });
    await callWebhook("tasks", { timeMin: "a" });
    expect(calls).toHaveLength(3);
  });

  it("after 30 s the next ask goes out again", async () => {
    jest.useFakeTimers();
    const { callWebhook } = load();
    answer(200, { ok: true, data: 1 });
    answer(200, { ok: true, data: 2 });
    await expect(callWebhook("tasks", {})).resolves.toBe(1);
    jest.setSystemTime(Date.now() + 30_000);
    await expect(callWebhook("tasks", {})).resolves.toBe(2);
    expect(calls).toHaveLength(2);
  });

  it("a failure is not shared: the next ask tries again", async () => {
    const { callWebhook } = load();
    answer(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "no" } });
    answer(200, { ok: true, data: "yes" });
    await expect(callWebhook("tasks", {})).rejects.toMatchObject({ status: 422 });
    await expect(callWebhook("tasks", {})).resolves.toBe("yes");
  });

  it("a write is never shared, and is tried again only when it carries an offlineId", async () => {
    const { callWebhook } = load();
    answer(200, { ok: true, data: "one" });
    answer(200, { ok: true, data: "two" });
    await callWebhook("tasks-write", { op: "create", fields: { title: "x" } }, { write: true });
    await callWebhook("tasks-write", { op: "create", fields: { title: "x" } }, { write: true });
    expect(calls).toHaveLength(2);

    answer(503, { ok: false, error: { code: "UPSTREAM_ERROR", message: "busy" } });
    await expect(callWebhook("gmail-draft", { to: "a" }, { write: true })).rejects.toMatchObject({ status: 502 });
    expect(calls).toHaveLength(3);

    answer(503, { ok: false, error: { code: "UPSTREAM_ERROR", message: "busy" } });
    answer(200, { ok: true, data: { duplicate: true } });
    await expect(callWebhook("tasks-write", { op: "create", offlineId: "o-1" }, { write: true })).resolves.toEqual({ duplicate: true });
    expect(calls).toHaveLength(5);
  });
});
