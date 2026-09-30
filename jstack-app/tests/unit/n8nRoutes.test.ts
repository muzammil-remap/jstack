/**
 * ADR-76 — the n8n transport answers every route in the table, and every answer is the contract's.
 *
 * The schema is read from `openapi.yaml` by the real YAML reader in a child process (the way
 * `openapi.test.ts` does, because the tools are ESM), and each response is checked with the mock's
 * own validator (`data/mock/schemaValidate.ts`) — a schema derived from a different file than the
 * one that wrote the answer (CODEMAP §6, B-16).
 *
 * `callWebhook` is stubbed: a unit test never makes an outbound call (B-17). A wired key answers with
 * its redacted real reply (`tests/fixtures/n8n/<key>.json`); every other key refuses, and the tests
 * assert that only a wired route with an adapter reached one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPath, ROUTES } from "@/data/routes";
import { validate } from "@/data/mock/schemaValidate";
import { READS, WRITES } from "@/data/n8n/registry";
import { openapi, responseSchema } from "./n8nContract";
import { n8nTransport } from "@/data/transport/n8n";
import type { TransportRequest } from "@/data/transport/Transport";

jest.mock("@/data/n8n/client", () => {
  const actual = jest.requireActual("@/data/n8n/client");
  const { sample: fixture } = jest.requireActual("./n8nContract");
  const SAMPLES: Record<string, string> = { calendar: "calendar" };
  return {
    ...actual,
    callWebhook: jest.fn(async (key: string) => (SAMPLES[key] != null ? fixture(SAMPLES[key]).data : Promise.reject(new Error(`unit test: callWebhook("${key}") is not stubbed`)))),
  };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the jest.mock above replaces this module
const { callWebhook } = require("@/data/n8n/client") as { callWebhook: jest.Mock };

const root = join(__dirname, "..", "..");
const doc = openapi;

/** The queries the app sends on each route, so a query-reading answer is exercised as the app uses it. */
const QUERY: Record<string, Record<string, string>> = {
  getToday: { focus: "all" },
  getCalendar: { view: "today", anchor: "2026-09-29" },
  getTasks: { view: "list", focus: "all" },
  getActions: { state: "open" },
  getHabitStats: { period: "month", anchor: "2026-09-01" },
  getSearch: { q: "dentist" },
  getBrainSearch: { q: "dentist" },
  getSections: { tab: "life" },
  getAgentFeed: { hours: "24" },
};

/** A path parameter no source has produced — and a real tab where the route takes one. */
const PARAM: Record<string, string> = { tab: "today", noun: "tasks", step: "options" };
const pathFor = (template: string) => buildPath(template, (template.match(/\{[^}]+\}/g) ?? []).map((p) => PARAM[p.slice(1, -1)] ?? "no-such-id"));

/** Single records nothing has produced yet: honestly missing. */
const NOT_FOUND = ["getAction", "getEvent", "getTask", "getBrainItem", "getGoal", "getLearningItem", "getAgentIssue", "getFile", "getSection"];
/** No honest empty form, and nothing in the app asks for it (`data/n8n/empty.ts`); or an empty
 * form that would be a claim — "$0 this month · 0 tokens" (ADR-78, the registry's `unavailable`). */
const NOT_CONNECTED = ["getSectionCatalogue", "getUsage"];

const GETS = ROUTES.filter((r) => r.method === "GET");
/** every key the GET sweep reached, across its tests */
const reached = new Set<string>();
const WRITE_ROUTES = ROUTES.filter((r) => r.method !== "GET");

beforeEach(() => callWebhook.mockClear());

describe("ADR-76 · every GET the n8n transport answers is the contract's", () => {
  it("reads a real number of routes — a sweep over nothing is not a sweep", () => {
    expect(GETS.length).toBeGreaterThan(60);
    expect(WRITE_ROUTES.length).toBeGreaterThan(60);
  });

  it("the check can fail: a wrong answer is refused, and the nullable rewrite still refuses a non-object", () => {
    const schemas = doc().components.schemas;
    expect(validate([{ id: "t1" }], responseSchema("/tasks", "GET"), schemas).length).toBeGreaterThan(0);
    expect(validate({ events: [], gaps: "none" }, responseSchema("/calendar", "GET"), schemas).length).toBeGreaterThan(0);
    expect(validate({ answer: "not an answer", results: [] }, schemas.BrainSearchResult, schemas).length).toBeGreaterThan(0);
    expect(validate({ answer: null, results: [] }, schemas.BrainSearchResult, schemas)).toEqual([]);
  });

  it.each(GETS.map((r) => [r.name, r] as const))("GET %s", async (name, route) => {
    const res = await n8nTransport({ method: "GET", path: pathFor(route.path), query: QUERY[name] });
    // only a wired row with an adapter goes out, and only through its own key
    const row = READS[name];
    const keys = callWebhook.mock.calls.map(([key]) => key as string);
    expect({ name, keys }).toEqual({ name, keys: row?.kind === "wired" && row.adapter != null ? [row.key] : [] });
    for (const key of keys) reached.add(key);
    if (NOT_FOUND.includes(name)) {
      expect(res.status).toBe(404);
      return;
    }
    if (NOT_CONNECTED.includes(name)) {
      expect(res).toEqual({ status: 501, json: { reason: "not connected yet" } });
      return;
    }
    expect(res.status).toBe(200);
    const schema = responseSchema(route.path, route.method);
    expect(schema).toBeDefined();
    expect({ name, errors: validate(res.json, schema, doc().components.schemas) }).toEqual({ name, errors: [] });
  });

  it("every tab's layout and every default section is served, and an unknown one is 404", async () => {
    const schemas = doc().components.schemas;
    for (const tab of ["today", "tasks", "brain", "life", "agents"]) {
      const res = await n8nTransport({ method: "GET", path: `/layout/${tab}` });
      expect({ tab, status: res.status, errors: validate(res.json, schemas.Layout, schemas) }).toEqual({ tab, status: 200, errors: [] });
    }
    expect((await n8nTransport({ method: "GET", path: "/layout/nowhere" })).status).toBe(404);
    const all = (await n8nTransport({ method: "GET", path: "/sections" })).json as { id: string }[];
    expect(all.map((s) => s.id).sort()).toEqual(["files", "health", "learning", "money", "people", "replies", "usage"]);
    for (const { id } of all) {
      const res = await n8nTransport({ method: "GET", path: `/sections/${id}` });
      expect({ id, status: res.status, errors: validate(res.json, schemas.SectionConfig, schemas) }).toEqual({ id, status: 200, errors: [] });
    }
  });

  it("only a wired route with an adapter reached a webhook, each through its own key", () => {
    const live = Object.values(READS).flatMap((row) => (row?.kind === "wired" && row.adapter != null ? [row.key] : []));
    expect(live).toEqual(["calendar"]);
    expect([...reached]).toEqual(["calendar"]);
  });
});

describe("ADR-76 · a write with no key answers 501 and never leaves the device", () => {
  it.each(WRITE_ROUTES.filter((r) => WRITES[r.name] == null).map((r) => [`${r.method} ${r.path}`, r] as const))("%s", async (_label, route) => {
    const req: TransportRequest =
      route.multipart === true
        ? { method: route.method, path: pathFor(route.path), multipart: { file: { filename: "a.txt", contentType: "text/plain", size: 1, data: "file:///a.txt" } } }
        : { method: route.method, path: pathFor(route.path), body: { title: "anything", offlineId: "o-1" } };
    expect(await n8nTransport(req)).toEqual({ status: 501, json: { reason: "not connected yet" } });
    expect(callWebhook).not.toHaveBeenCalled();
  });

  it("a path in no route is 404, not a guess", async () => {
    expect((await n8nTransport({ method: "GET", path: "/nowhere" })).status).toBe(404);
    expect((await n8nTransport({ method: "POST", path: "/tasks/t1/send" })).status).toBe(404);
  });
});

describe("ADR-76 · the registry covers the route table, exactly", () => {
  it("every GET in data/routes.ts has a row, and no row names anything else", () => {
    const gets: string[] = GETS.map((r) => r.name).sort();
    const rows = Object.keys(READS).sort();
    expect({ missing: gets.filter((n) => !rows.includes(n)), extra: rows.filter((n) => !gets.includes(n)) }).toEqual({ missing: [], extra: [] });
  });

  it("every write key names a write route", () => {
    const writes: string[] = WRITE_ROUTES.map((r) => r.name);
    expect(Object.keys(WRITES).filter((n) => !writes.includes(n))).toEqual([]);
  });
});

/**
 * "Never put fixture text where it reads as something Josh wrote" (AGENTS.md). The defaults copy
 * the app's configuration from the fixtures; this proves the parts of those same fixtures that are
 * Josh's life did not come with it. The phrases are read from the fixture files, not typed here,
 * so a fixture edit cannot quietly make the check vacuous — and the count is asserted first.
 */
describe("ADR-76 · no default answer carries the fixtures' personal content", () => {
  const fixtures = join(root, "data", "mock", "fixtures");
  const read = (f: string) => JSON.parse(readFileSync(join(fixtures, f), "utf8"));
  const settings = read("settings.json") as { notificationGroups: { meta: string }[]; devices: { name: string }[] };
  const sections = read("sections.json") as { reason?: string }[];
  const life = read("life.json") as { sectionConfigs: { money: { categories: string[] } }; people: { name: string }[] };
  const rules = read("autonomy-rules.json") as { text: string }[];
  const personal = [
    ...settings.notificationGroups.map((g) => g.meta),
    ...settings.devices.map((d) => d.name),
    ...sections.map((s) => s.reason).filter((r): r is string => r != null),
    ...life.sectionConfigs.money.categories.filter((c) => c === "Bali"),
    ...life.people.map((p) => p.name),
    ...rules.map((r) => r.text),
    "skin check",
  ];

  it("reads the personal phrases off the fixtures", () => {
    expect(personal.length).toBeGreaterThan(20);
  });

  it("no GET answer contains one of them", async () => {
    const leaked: string[] = [];
    for (const route of GETS) {
      const res = await n8nTransport({ method: "GET", path: pathFor(route.path), query: QUERY[route.name] });
      const text = JSON.stringify(res.json);
      for (const phrase of personal) if (text.includes(phrase)) leaked.push(`${route.name}: ${phrase}`);
    }
    expect(leaked).toEqual([]);
  });
});
