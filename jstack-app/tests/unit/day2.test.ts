/**
 * D2-01..04, TM-01..03 — the morning after, and an answer that arrives from
 * somewhere else (row D-1).
 *
 * Both halves are about the same thing: the app has to be correct when the
 * world moved without it. A card expired overnight and its then-what was
 * applied; a Later came back; the EA finished something at 3am; Josh answered
 * a card from Telegram while this screen was open. None of that is a user
 * action, and none of it can be discovered by asking the user to reload.
 */
import { dayKey } from "@/lib/time";
import { clearServerEventListeners, onServerEvent } from "@/data/mock/events";
import { get as dbGet, reset } from "@/data/mock/db";
import { postTelegramMirror } from "@/data/mock/handlers/mirror";
import { handle } from "@/data/mock/server";
import type { ServerEvent } from "@/data/types";
import type { TransportRequest } from "@/data/transport/Transport";

const call = (method: TransportRequest["method"], path: string, body?: unknown) => handle({ method, path, body });

afterEach(() => clearServerEventListeners());

describe("D2-01 · reset(\"day2\") seeds the morning after", () => {
  beforeEach(() => reset(0, "day2"));

  it("D2-03: the expired card was answered by its own then-what, via expiry", () => {
    const card = dbGet().actions.find((a) => a.id === "c1");
    expect(card?.state).toBe("answered");
    const last = card!.history.at(-1);
    expect(last?.via).toBe("expiry");
    // the promise the card made in silence: the RECOMMENDED option, not any option
    expect(last?.option).toBe(card!.recommended);
  });

  it("every activity row's `at` is a timestamp on the wire — the fixture's, the overnight one and the live ones alike (ux-review R3-02)", async () => {
    // CONTRACT_v21.md §1.11: every timestamp on the wire is ISO 8601. The
    // day-1 fixture wrote `{{DATE-1}}` ("6 September") while the overnight
    // row and the two live writes (save-on-close, delegate) wrote
    // `toISOString()`, so the task card stacked "EA · 2026-09-07T03:00:00.000Z"
    // over "EA · 6 September" — one field in two shapes, and the delta line
    // counts `at` against `seenAt`, which prose cannot be. The wire is the
    // instant; `lib/time.ts` proseDate is where the card makes it a date.
    const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    const t1 = () => dbGet().tasks.find((t) => t.id === "t1")!;
    expect(t1().activity.length).toBeGreaterThanOrEqual(2);
    expect(t1().activity.map((a) => a.at).filter((at) => !instant.test(at))).toEqual([]);

    await handle({ method: "PUT", path: "/tasks/t1", query: {}, body: t1() });
    await handle({ method: "POST", path: "/tasks/t2/delegate", query: {}, body: {} });
    const appended = [t1().activity.at(-1)!, dbGet().tasks.find((t) => t.id === "t2")!.activity.at(-1)!];
    expect(appended.map((a) => a.text)).toEqual(["Saved", "Acknowledged — on it."]);
    expect(appended.map((a) => a.at).filter((at) => !instant.test(at))).toEqual([]);
  });

  it("D2-03: the Later card came back, open", () => {
    // a Later that never returns is a card quietly dropped
    const card = dbGet().actions.find((a) => a.id === "c3");
    expect(card?.state).toBe("open");
    expect(card?.laterUntil).toBeTruthy();
  });

  it("yesterday's habit logs are there, and dated yesterday", () => {
    // "Yesterday" is read from the server's own `seenAt`, not recomputed from
    // `new Date()` — recomputing it here would make this test pass in the
    // morning and fail after lunch.
    //
    // D-1: through `dayKey`, not `.slice(0, 10)`. `seenAt` is 9am LOCAL on the
    // previous day, which in Brisbane is 23:00Z the day before that — so the
    // slice named a day two back and found two logs instead of three. The
    // habit logs are stamped with a local day key; this has to read one.
    const stamp = dayKey(new Date(dbGet().seenAt));
    const logs = dbGet().habitLogs.filter((l) => l.date === stamp);
    expect(logs.length).toBe(3);
    expect(logs.filter((l) => l.done).length).toBe(2);
  });

  it("day 1 is untouched by day 2's existence", () => {
    // The diff is applied ON TOP of day 1 and must not have edited the
    // fixture modules themselves — those are imported singletons, so a diff
    // that mutated one would leak into every later reset in the same process
    // (the same trap layoutsFixture is cloned for).
    //
    // Day 1 legitimately HAS yesterday's habit logs of its own, so the check
    // is the three things day 2 changes, not the absence of history.
    reset();
    expect(dbGet().actions.find((a) => a.id === "c1")?.state).toBe("open");
    expect(dbGet().tasks.find((t) => t.id === "t1")?.subtasks.find((s) => s.id === "t1-3")?.done).toBe(false);
    expect(dbGet().tasks.find((t) => t.id === "t1")?.report).toBeUndefined();
  });
});

describe("D2-04 · the overnight subtask", () => {
  beforeEach(() => reset(0, "day2"));

  it("is done, with the cost and the EA's report", () => {
    const task = dbGet().tasks.find((t) => t.id === "t1");
    expect(task?.subtasks.find((s) => s.id === "t1-3")?.done).toBe(true);
    expect(task?.delegated).toMatchObject({ to: "ea", state: "done", cost: 0.42 });
    expect(task?.report?.summary).toBe("Bundaberg memo drafted");
    // T-3: `"ea"`, lower case — the wire's `TaskOwner`. `Activity.tsx` maps it
    // to the proper noun on screen (that map is why "ea" never reaches a
    // reader), and this was the one fixture that bypassed it.
    expect(task?.activity.at(-1)?.actor).toBe("ea");
    // TK-12: and the card can say WHO finished it
    expect(task?.completedBy).toBe("ea");
  });

  it("nothing was sent — the report is a draft to read", () => {
    // SEC-15: the EA produces work, it does not act outward
    const task = dbGet().tasks.find((t) => t.id === "t1");
    expect(task?.report?.state).toBe("open");
    expect(JSON.stringify(task?.report)).toContain("nothing sent");
  });
});

describe("TM-01 · the Telegram mirror answers a card and says so", () => {
  beforeEach(() => reset());

  it("answers with via: \"telegram\" and emits a server event", async () => {
    const seen: ServerEvent[] = [];
    onServerEvent((e) => seen.push(e));

    const res = await call("POST", "/__mirror__/telegram", { actionId: "c2", verb: "approve" });
    expect(res.status).toBe(200);

    const card = dbGet().actions.find((a) => a.id === "c2");
    expect(card?.state).toBe("answered");
    expect(card?.history.at(-1)?.via).toBe("telegram");

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: "actions", ids: ["c2"] });
  });

  it("refuses a card that is already answered rather than answering it twice", async () => {
    await call("POST", "/__mirror__/telegram", { actionId: "c2", verb: "approve" });
    const second = await call("POST", "/__mirror__/telegram", { actionId: "c2", verb: "never" });
    expect(second.status).toBe(409);
  });

  it("refuses an unknown card and an unknown verb, naming the field", async () => {
    expect((await call("POST", "/__mirror__/telegram", { actionId: "nope", verb: "approve" })).status).toBe(404);
    const bad = await call("POST", "/__mirror__/telegram", { actionId: "c2", verb: "detonate" });
    expect(bad.status).toBe(422);
    expect(bad.json).toMatchObject({ field: "verb" });
  });

  it("is mock-only — it is not in the route table, so it cannot reach openapi.yaml", () => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { ROUTES } = require("@/data/routes") as typeof import("@/data/routes");
    expect(ROUTES.some((r) => r.path.includes("__mirror__"))).toBe(false);
  });
});

describe("TM-03 · an answer from Telegram is not undoable here", () => {
  beforeEach(() => reset());

  it("the app's undo refuses a card it did not answer", async () => {
    await call("POST", "/__mirror__/telegram", { actionId: "c2", verb: "approve" });
    // the ten-second window belongs to the surface that took the action;
    // offering undo here offers to reverse something done somewhere else
    const undo = await call("POST", "/actions/c2/undo");
    expect(undo.status).toBe(409);
  });
});

describe("D-1 · an expiry is a server change nobody asked for, so it is announced", () => {
  beforeEach(() => reset());

  it("reading the list past a card's expiry emits one actions event", async () => {
    const seen: ServerEvent[] = [];
    onServerEvent((e) => seen.push(e));

    // move the server's clock past c1's expiry
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { setClockOffsetMs } = require("@/data/mock/db") as typeof import("@/data/mock/db");
    const card = dbGet().actions.find((a) => a.id === "c1");
    setClockOffsetMs(new Date(card!.expiresAt).getTime() - Date.now() + 60_000);

    await call("GET", "/actions");
    expect(seen.filter((e) => e.kind === "actions").length).toBe(1);
    expect(seen[0].ids).toContain("c1");
  });

  it("a read that expires nothing announces nothing — otherwise it is a refetch loop", async () => {
    const seen: ServerEvent[] = [];
    onServerEvent((e) => seen.push(e));
    await call("GET", "/actions");
    await call("GET", "/actions");
    expect(seen).toEqual([]);
  });
});

describe("D2-02 · the delta line counts what actually changed", () => {
  const sinceOf = async () => ((await call("GET", "/today")).json as { since: string }).since;

  it("day 1 says 'Since 9pm' and counts nothing landed overnight", async () => {
    reset();
    const since = await sinceOf();
    expect(since).toMatch(/^Since 9pm: /);
    // the fixture's own overnight is empty; the line must not claim otherwise
    expect(since).toContain("0 things landed");
  });

  it("day 2 says 'Since yesterday' and counts the diff", async () => {
    reset(0, "day2");
    const since = await sinceOf();
    expect(since).toMatch(/^Since yesterday: /);
    // the expired card, the returned Later and the finished delegation
    expect(since).toContain("3 things landed");
  });

  it("the number is counted, not written — removing a change removes it from the line", async () => {
    reset(0, "day2");
    const before = await sinceOf();
    expect(before).toContain("3 things landed");

    // take the finished delegation away and the sentence must follow
    const task = dbGet().tasks.find((t) => t.id === "t1");
    task!.delegated = undefined;
    expect(await sinceOf()).toContain("2 things landed");
  });

  it("one thing reads as one thing", async () => {
    reset(0, "day2");
    const state = dbGet();
    state.tasks.find((t) => t.id === "t1")!.delegated = undefined;
    state.actions.find((a) => a.id === "c3")!.laterUntil = undefined;
    expect(await sinceOf()).toContain("1 thing landed");
  });
});
