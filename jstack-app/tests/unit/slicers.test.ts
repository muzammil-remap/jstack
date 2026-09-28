/**
 * TF-06/TF-08 — the slicers are a stored list, and one query serves four views
 * (F-1, ADR-44).
 *
 * `tests/unit/predicates.test.ts` proves each predicate KIND answers its own
 * question. This is the other half: the server serves the list, takes a whole
 * new one at once, refuses the two things that would break it, and applies the
 * chosen slicer to `GET /tasks` for every view — which is what makes "the same
 * task set on List, Board and Gantt" a fact rather than a hope.
 */
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import type { Slicer, Task } from "@/data/types";

const slicers = async (): Promise<Slicer[]> => (await handle({ method: "GET", path: "/slicers" })).json as Slicer[];
const put = (next: unknown) => handle({ method: "PUT", path: "/slicers", body: next });
const ids = async (query: Record<string, string>): Promise<string[]> => ((await handle({ method: "GET", path: "/tasks", query })).json as Task[]).map((t) => t.id);

describe("TF-06 · GET /slicers", () => {
  beforeEach(() => db.reset());

  it("serves the five that shipped, in order, with their predicates", async () => {
    const list = await slicers();
    expect(list.map((s) => s.id)).toEqual(["week", "waiting", "delegated", "agent", "recurring"]);
    expect(list.find((s) => s.id === "week")?.predicate).toEqual({ kind: "dueWithin", days: 7 });
  });
});

describe("TF-06 · PUT /slicers takes the whole set", () => {
  beforeEach(() => db.reset());

  it("adds one, and the new slicer filters `GET /tasks` straight away", async () => {
    const next = [...(await slicers()), { id: "fortnight", name: "Next fortnight", predicate: { kind: "dueWithin", days: 14 } }];
    const res = await put(next);
    expect(res.status).toBe(200);

    // t3 is due in three days and t5 in six — both inside a fortnight; t2 has
    // no due date at all and is not "due within" anything
    const shown = await ids({ slice: "fortnight" });
    expect(shown).toContain("t3");
    expect(shown).toContain("t5");
    expect(shown).not.toContain("t2");
  });

  it("B-28: an ARRAY body reaches the handler — the validator used to spread it into an object", async () => {
    // `{ ...[a, b] }` is `{ 0: a, 1: b }`, so `PUT /slicers` — the first route
    // in this app to declare an array body — was refused by the very validator
    // that was supposed to be checking it, with "expected array, got object".
    const res = await put(await slicers());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json)).toBe(true);
  });

  it("refuses to lose a `fixed` slicer, and says which one", async () => {
    const res = await put((await slicers()).filter((s) => s.id !== "week"));
    expect(res.status).toBe(422);
    expect((res.json as { reason: string }).reason).toContain("This week");
    // and nothing changed
    expect((await slicers()).map((s) => s.id)).toContain("week");
  });

  it("removes one that is not fixed", async () => {
    const res = await put((await slicers()).filter((s) => s.id !== "agent"));
    expect(res.status).toBe(200);
    expect((await slicers()).map((s) => s.id)).not.toContain("agent");
  });

  it("refuses a predicate kind nobody implements, and a slicer with no name", async () => {
    const base = await slicers();
    expect((await put([...base, { id: "x", name: "Orbital", predicate: { kind: "orbital" } }])).status).toBe(422);
    expect((await put([...base, { id: "x", name: "  ", predicate: { kind: "repeat" } }])).status).toBe(422);
    expect((await put("not a list")).status).toBe(422);
  });
});

describe("TF-08 · one query, four views", () => {
  beforeEach(() => db.reset());

  it("the same slicer narrows every view the same way", async () => {
    const list = await ids({ view: "list", slice: "waiting" });
    expect(list.length).toBeGreaterThan(0);
    expect(await ids({ view: "board", slice: "waiting" })).toEqual(list);
    expect(await ids({ view: "gantt", slice: "waiting" })).toEqual(list);
  });

  it("`view=gantt` is a real view — it used to be a route of its own that ignored the slicer", async () => {
    const all = await ids({ view: "gantt" });
    const sliced = await ids({ view: "gantt", slice: "waiting" });
    expect(all.length).toBeGreaterThan(sliced.length);
  });

  it("only the LIST hides what is finished; board, gantt and done each answer their own question", async () => {
    expect(await ids({ view: "list" })).not.toContain("t9");
    expect(await ids({ view: "board" })).toContain("t9");
    expect(await ids({ view: "gantt" })).toContain("t9");
    expect(await ids({ view: "done" })).toEqual(expect.arrayContaining(["t9", "t10"]));
  });

  it("the focus narrows every view too, and composes with the slicer", async () => {
    const work = await ids({ view: "list", focus: "work" });
    const all = await ids({ view: "list" });
    expect(work.length).toBeLessThan(all.length);
    for (const id of await ids({ view: "gantt", focus: "work" })) expect(work.concat(["t9"])).toContain(id);
  });
});

describe("TF-01 · the range is applied whether or not filters were sent", () => {
  beforeEach(() => db.reset());

  it("a request with no filters gets the DEFAULT window, not everything", async () => {
    // every fixture task is inside the default 90 days, so the proof is the
    // other way round: push one outside it and watch it disappear
    const far = db.get().tasks.find((t) => t.id === "t3")!;
    far.due = "2099-01-01";
    expect(await ids({ view: "list" })).not.toContain("t3");
    expect(await ids({ view: "list", filters: JSON.stringify({ range: { preset: "all" } }) })).toContain("t3");
  });

  it("Done ignores the forward window by default and shows every completed task", async () => {
    expect(await ids({ view: "done" })).toEqual(expect.arrayContaining(["t9", "t10"]));
  });
});
