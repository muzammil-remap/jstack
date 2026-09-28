/**
 * LK-02..LK-05 — the parameter registry (ADR-41, L-1).
 *
 * Six numbers and booleans that used to be constants buried in the files
 * that read them. The point of the table is not tidiness: it is that Josh
 * can change them, the EA can PROPOSE changing them through the card flow it
 * already knows, and `PARAMETERS.md` tells both of them what exists without
 * anyone reading the source.
 *
 * So the cases below are about the three ways a parameter can lie: a table
 * row whose `usedBy` names a file that does not read it, a server that takes
 * a value outside the range it published, and a proposal that changes
 * something before Josh has answered the card.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PARAMETERS, defaultParameters, parameterDef } from "@/data/parameters";
import { ROUTES } from "@/data/routes";
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import type { ActionItem, Parameter } from "@/data/types";

const APP_ROOT = join(__dirname, "..", "..");

const get = async (): Promise<Parameter[]> => (await handle({ method: "GET", path: "/parameters" })).json as Parameter[];
const valueOf = async (key: string): Promise<number | boolean> => (await get()).find((p) => p.key === key)!.value;

describe("LK-02 · the table is the registry", () => {
  it("is exactly the six ADR-41 names, once each", () => {
    expect(PARAMETERS.map((p) => p.key)).toEqual([
      "lock.afterMinutes",
      "lock.lockOnHideTouch",
      "tasks.rangeDays",
      "files.recentDays",
      "mic.autoStopSeconds",
      "search.maxResults",
    ]);
  });

  it("every row carries the defaults ADR-41 names", () => {
    const seen = Object.fromEntries(PARAMETERS.map((p) => [p.key, [p.default, p.min, p.max]]));
    expect(seen).toEqual({
      "lock.afterMinutes": [10, 1, 60],
      "lock.lockOnHideTouch": [true, undefined, undefined],
      "tasks.rangeDays": [90, 7, 365],
      "files.recentDays": [14, 1, 90],
      "mic.autoStopSeconds": [60, 15, 300],
      "search.maxResults": [50, 10, 200],
    });
  });

  it("a number has a range it sits inside; a boolean has no range at all", () => {
    for (const p of PARAMETERS) {
      if (p.unit === "boolean") {
        expect({ key: p.key, type: typeof p.default, min: p.min, max: p.max }).toEqual({ key: p.key, type: "boolean", min: undefined, max: undefined });
      } else {
        expect(typeof p.default).toBe("number");
        expect(p.min).toBeLessThanOrEqual(p.default as number);
        expect(p.max).toBeGreaterThanOrEqual(p.default as number);
        expect(p.min).toBeLessThan(p.max!);
      }
    }
  });

  /**
   * The one that stops the table becoming decoration. `usedBy` is what
   * `PARAMETERS.md` prints as "where it is used", and a row pointing at a
   * file that never mentions the key is a document telling Josh something
   * that is not true.
   */
  it("every `usedBy` file exists and actually names its key", () => {
    for (const p of PARAMETERS) {
      // an empty `usedBy` is allowed and must say which row will read it —
      // four of the six are read by F-1, X-1, V-1 and K-1, and a registry
      // that claimed a consumer it does not have would be worse than one
      // that admits the gap
      if (p.usedBy.length === 0) {
        expect({ key: p.key, plannedFor: p.plannedFor }).toEqual({ key: p.key, plannedFor: expect.stringMatching(/^[A-Z]+-\d$/) });
        continue;
      }
      expect(p.plannedFor).toBeUndefined();
      for (const rel of p.usedBy) {
        const full = join(APP_ROOT, rel);
        expect({ key: p.key, file: rel, exists: existsSync(full) }).toEqual({ key: p.key, file: rel, exists: true });
        expect({ key: p.key, file: rel, names: readFileSync(full, "utf8").includes(p.key) }).toEqual({ key: p.key, file: rel, names: true });
      }
    }
  });

  it("labels and help are written for a person, not derived from the key", () => {
    for (const p of PARAMETERS) {
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.help.length).toBeGreaterThan(10);
      expect(p.label).not.toBe(p.key);
    }
  });

  it("`defaultParameters` is the table with its defaults as values", () => {
    expect(defaultParameters().map((p) => [p.key, p.value])).toEqual(PARAMETERS.map((p) => [p.key, p.default]));
  });

  it("`parameterDef` is the lookup, and an unknown key is undefined rather than a throw", () => {
    expect(parameterDef("lock.afterMinutes")?.max).toBe(60);
    expect(parameterDef("nope.nope")).toBeUndefined();
  });

  it("the three routes are in the one table, in the settings group (§4.14)", () => {
    const rows = ROUTES.filter((r) => r.path.startsWith("/parameters"));
    expect(rows.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /parameters", "POST /parameters/propose", "PUT /parameters/{key}"]);
    // propose comes BEFORE `{key}` or the router matches "propose" as a key
    expect(rows.findIndex((r) => r.path === "/parameters/propose")).toBeLessThan(rows.findIndex((r) => r.path === "/parameters/{key}"));
    for (const r of rows) expect(r.marker).toBe("§4.14");
  });
});

describe("LK-03 · the server refuses what it says it will refuse", () => {
  beforeEach(() => db.reset());

  it("GET serves the six with their defaults", async () => {
    const list = await get();
    expect(list.map((p) => p.key)).toEqual(PARAMETERS.map((p) => p.key));
    expect(list.find((p) => p.key === "lock.afterMinutes")?.value).toBe(10);
    expect(list.find((p) => p.key === "lock.lockOnHideTouch")?.value).toBe(true);
  });

  it("PUT sets a value inside the range, and the record carries its definition", async () => {
    const res = await handle({ method: "PUT", path: "/parameters/lock.afterMinutes", body: { value: 30 } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ key: "lock.afterMinutes", value: 30, min: 1, max: 60, unit: "minutes" });
    expect(await valueOf("lock.afterMinutes")).toBe(30);
  });

  it("a value outside the range is a 422 naming the field, and nothing moves", async () => {
    for (const bad of [0, 61, -5]) {
      const res = await handle({ method: "PUT", path: "/parameters/lock.afterMinutes", body: { value: bad } });
      expect({ bad, status: res.status }).toEqual({ bad, status: 422 });
      expect(res.json).toMatchObject({ field: "value" });
      expect((res.json as { reason: string }).reason).toContain("1");
    }
    expect(await valueOf("lock.afterMinutes")).toBe(10);
  });

  it("the wrong TYPE is refused too — a boolean parameter does not take 5", async () => {
    const res = await handle({ method: "PUT", path: "/parameters/lock.lockOnHideTouch", body: { value: 5 } });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "value" });
    expect(await valueOf("lock.lockOnHideTouch")).toBe(true);

    const num = await handle({ method: "PUT", path: "/parameters/lock.afterMinutes", body: { value: true } });
    expect(num.status).toBe(422);
  });

  it("a boolean parameter takes a boolean", async () => {
    expect((await handle({ method: "PUT", path: "/parameters/lock.lockOnHideTouch", body: { value: false } })).status).toBe(200);
    expect(await valueOf("lock.lockOnHideTouch")).toBe(false);
  });

  it("an unknown key is a 404, not a new parameter", async () => {
    expect((await handle({ method: "PUT", path: "/parameters/lock.whatever", body: { value: 1 } })).status).toBe(404);
    expect((await get()).length).toBe(6);
  });
});

describe("LK-04 · the EA proposes, Josh decides", () => {
  beforeEach(() => db.reset());

  const propose = (over: Record<string, unknown> = {}) =>
    handle({
      method: "POST",
      path: "/parameters/propose",
      body: { key: "lock.afterMinutes", value: 20, reason: "You unlock four times an hour on Tuesdays.", ...over },
    });

  it("a proposal is a CARD and changes nothing yet (the whole point)", async () => {
    const res = await propose();
    expect(res.status).toBe(201);
    const card = res.json as ActionItem;
    expect(card.kind).toBe("parameter");
    expect(card.parameter).toEqual({
      key: "lock.afterMinutes",
      label: parameterDef("lock.afterMinutes")!.label,
      current: 10,
      proposed: 20,
      reason: "You unlock four times an hour on Tuesdays.",
    });
    // the same furniture every other card carries, so it renders like one
    expect(card.expiresAt).toBeTruthy();
    expect(card.thenWhat).toBeTruthy();
    expect(card.receipt).toBeTruthy();
    expect(card.verb).toBe("Approve");
    expect(await valueOf("lock.afterMinutes")).toBe(10);
  });

  it("Approve applies it", async () => {
    const card = (await propose()).json as ActionItem;
    expect((await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "approve" } })).status).toBe(200);
    expect(await valueOf("lock.afterMinutes")).toBe(20);
  });

  it("undo within the window puts the old value back", async () => {
    const card = (await propose()).json as ActionItem;
    await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "approve" } });
    expect((await handle({ method: "POST", path: `/actions/${card.id}/undo` })).status).toBe(200);
    expect(await valueOf("lock.afterMinutes")).toBe(10);
  });

  it("Never records the refusal the EA can read, and does not apply it", async () => {
    const card = (await propose()).json as ActionItem;
    await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "never" } });
    expect(await valueOf("lock.afterMinutes")).toBe(10);
    const refused = (await get()).find((p) => p.key === "lock.afterMinutes");
    expect(refused?.refused).toMatchObject({ value: 20 });
    expect(refused?.refused?.at).toBeTruthy();
  });

  it("Later leaves the value alone and the card open for the EA to see", async () => {
    const card = (await propose()).json as ActionItem;
    await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "later" } });
    expect(await valueOf("lock.afterMinutes")).toBe(10);
    expect((await get()).find((p) => p.key === "lock.afterMinutes")?.refused).toBeUndefined();
  });

  it("a proposal with no reason is refused — an EA that cannot say why has not thought about it", async () => {
    const res = await propose({ reason: "   " });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "reason" });
  });

  it("a proposal outside the range is refused at the door, not at approval", async () => {
    const res = await propose({ value: 90 });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "value" });
  });

  it("a proposal for a key that does not exist is a 404", async () => {
    expect((await propose({ key: "lock.nope" })).status).toBe(404);
  });
});
