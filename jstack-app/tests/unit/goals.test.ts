/**
 * LG-01..LG-04 — the goal set, its detail, and what archiving one does.
 *
 * Driven through the ROUTE (`handle`) rather than by calling the handlers, for
 * the reason `files.test.ts` and `search.test.ts` give: every claim here is
 * about what the SERVER returns, and calling the handler directly would assert
 * the same function twice.
 *
 * The negative assertions are each paired with a positive one that proves the
 * request would otherwise have matched — a "does not come back" that passes
 * against a server returning nothing at all is not a guard (hard rule 14).
 */
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import type { BrainItem, Goal, GoalComposite } from "@/data/types";

async function goals(query: Record<string, string> = {}): Promise<Goal[]> {
  const res = await handle({ method: "GET", path: "/goals", query });
  expect(res.status).toBe(200);
  return res.json as Goal[];
}

async function history(): Promise<Goal[]> {
  const res = await handle({ method: "GET", path: "/goals/history" });
  expect(res.status).toBe(200);
  return res.json as Goal[];
}

const ids = (rows: Goal[]) => rows.map((g) => g.id);

beforeEach(() => {
  db.reset();
  db.asUser("josh");
});

describe("LG-01 · the active set, and the archive behind it", () => {
  it("GET /goals answers with the active ones only, and the archived one is really there", async () => {
    const active = await goals();
    // the positive half: g4 exists in the fixture and comes back from the
    // history route, so its absence above is a filter and not an empty table
    expect(ids(active)).not.toContain("g4");
    expect(ids(await history())).toContain("g4");
    expect(active.length).toBeGreaterThan(0);
  });

  it("every goal carries the fields the contract names", async () => {
    for (const g of await goals()) {
      expect(["active", "behind", "done", "dropped"]).toContain(g.status);
      expect(Array.isArray(g.taskIds)).toBe(true);
      expect(Array.isArray(g.deliverableIds)).toBe(true);
      expect(Array.isArray(g.history)).toBe(true);
      // resolution #47: a labelled record like every other
      expect(typeof g.labels?.silo).toBe("string");
      // D-1: no sentence with a clock in it. The status is an enum now.
      expect(g.status).not.toContain("·");
    }
  });

  it("the composite and the dedicated route agree about what 'the goals' are", async () => {
    // A rule that lives in a PAIR is tested on the pair (hard rule 14, qa A-2).
    // The Life card loads through `GET /life`, not `GET /goals`, so teaching
    // only the second one to filter left the archived goal on the card while
    // every unit test here was green — found by `life.spec.ts` counting four
    // rows where the fixture has three active goals.
    const res = await handle({ method: "GET", path: "/life" });
    expect(res.status).toBe(200);
    const composite = (res.json as { goals: Goal[] }).goals;
    expect(ids(composite)).toEqual(ids(await goals()));
    expect(ids(composite)).not.toContain("g4");
  });

  it("/goals/history resolves to the history and not to a goal whose id is 'history'", async () => {
    // the array-order hazard `/tasks/columns` records: a `{id}` pattern
    // declared first swallows the literal path
    const res = await handle({ method: "GET", path: "/goals/history" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json)).toBe(true);
    const single = await handle({ method: "GET", path: "/goals/g1" });
    expect(single.status).toBe(200);
    expect((single.json as GoalComposite).goal.id).toBe("g1");
  });
});

describe("LG-02 · one goal, with what hangs off it", () => {
  it("resolves the task and deliverable ids rather than making the client fetch them", async () => {
    const res = await handle({ method: "GET", path: "/goals/g2" });
    expect(res.status).toBe(200);
    const detail = res.json as GoalComposite;

    expect(detail.goal.id).toBe("g2");
    expect(detail.goal.taskIds.length).toBeGreaterThan(0);
    // the ids resolve to the records themselves, in the same order
    expect(detail.tasks.map((t) => t.id)).toEqual(detail.goal.taskIds);
    expect(detail.deliverables.map((f) => f.id)).toEqual(detail.goal.deliverableIds);
    expect(detail.goal.kpis?.length).toBeGreaterThan(0);
  });

  it("answers 404 for a goal that is not there", async () => {
    const res = await handle({ method: "GET", path: "/goals/nope" });
    expect(res.status).toBe(404);
  });
});

describe("LG-01 · PUT /goals replaces the set", () => {
  it("saves an edit and reads it back", async () => {
    const before = await goals();
    const next = before.map((g) => (g.id === "g1" ? { ...g, text: "decide on Bundaberg by October" } : g));
    const res = await handle({ method: "PUT", path: "/goals", body: { goals: next } });
    expect(res.status).toBe(200);
    expect((await goals()).find((g) => g.id === "g1")?.text).toBe("decide on Bundaberg by October");
  });

  it("refuses a body that is not a list of goals, naming the field", async () => {
    const res = await handle({ method: "PUT", path: "/goals", body: { goals: "all of them" } });
    expect(res.status).toBe(422);
    expect((res.json as { field?: string }).field).toBe("goals");
  });

  it("refuses a goal with no text rather than storing a blank row", async () => {
    const [first, ...rest] = await goals();
    const res = await handle({ method: "PUT", path: "/goals", body: { goals: [{ ...first, text: "  " }, ...rest] } });
    expect(res.status).toBe(422);
    // the positive half: the same body with the text restored is accepted
    const good = await handle({ method: "PUT", path: "/goals", body: { goals: [first, ...rest] } });
    expect(good.status).toBe(200);
  });
});

describe("LG-04 · Done and Drop archive with history, and say so in Brain", () => {
  async function archive(id: string, status: "done" | "dropped") {
    const next = (await goals()).map((g) => (g.id === id ? { ...g, status } : g));
    const res = await handle({ method: "PUT", path: "/goals", body: { goals: next } });
    expect(res.status).toBe(200);
    return res;
  }

  it("moves a done goal out of the active set and into history with an entry", async () => {
    const wasActive = ids(await goals());
    expect(wasActive).toContain("g3");

    await archive("g3", "done");

    expect(ids(await goals())).not.toContain("g3");
    const archived = (await history()).find((g) => g.id === "g3");
    expect(archived?.status).toBe("done");
    // the history GAINS an entry — the goal is not simply hidden
    expect(archived!.history.length).toBeGreaterThan(0);
    expect(archived!.history.at(-1)!.event).toBe("done");
    expect(archived!.history.at(-1)!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("writes a brain item naming the goal, so Latest in shows it happened", async () => {
    const before = await handle({ method: "GET", path: "/brain/latest" });
    const countBefore = (before.json as BrainItem[]).length;

    await archive("g3", "dropped");

    const after = await handle({ method: "GET", path: "/brain/latest" });
    const items = after.json as BrainItem[];
    expect(items.length).toBe(countBefore + 1);
    expect(items[0].text).toBe("Goal archived · three workouts a week");
    expect(items[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("a goal REMOVED from the set is archived too, not deleted", async () => {
    const next = (await goals()).filter((g) => g.id !== "g3");
    const res = await handle({ method: "PUT", path: "/goals", body: { goals: next } });
    expect(res.status).toBe(200);

    expect(ids(await goals())).not.toContain("g3");
    const archived = (await history()).find((g) => g.id === "g3");
    expect(archived).toBeDefined();
    expect(archived!.status).toBe("dropped");
  });

  it("A4R4-01: the archive a goal JOINS survives the write — every earlier one is still there", async () => {
    // The case above names the property "archived too, not deleted" and proves
    // half of it: the goal just removed reaches the history. It never asks
    // whether the archive it joined SURVIVED, and no other case did either,
    // because every one of them archives exactly one goal from a clean db.
    //
    // The client only ever holds the ACTIVE set (`GET /life` and `GET /goals`
    // both answer `goals.filter(isActive)`), so an already-archived goal is in
    // neither list, was in neither `submitted` nor `removed`, and was erased on
    // every save. The archive could never hold more than one record, silently,
    // against `CONTRACT_v22.md` §4.20's bolded "archives rather than deletes"
    // and the handler's own comment one line above the bug.
    const startArchived = ids(await history());
    expect(startArchived.length).toBeGreaterThan(0); // g4 ships archived — else this proves nothing

    // archive one goal the ordinary way: submit the active set without it
    const next = (await goals()).filter((g) => g.id !== "g3");
    expect((await handle({ method: "PUT", path: "/goals", body: { goals: next } })).status).toBe(200);

    const after = ids(await history());
    expect(after).toContain("g3");
    for (const earlier of startArchived) expect(after).toContain(earlier);

    // and again, so the archive grows rather than being replaced each time
    const next2 = (await goals()).filter((g) => g.id !== "g2");
    expect((await handle({ method: "PUT", path: "/goals", body: { goals: next2 } })).status).toBe(200);
    const after2 = ids(await history());
    for (const kept of [...startArchived, "g3", "g2"]) expect(after2).toContain(kept);
  });

  it("restoring an archived goal is a normal save, and it comes back", async () => {
    await archive("g3", "done");
    const restored = (await history()).map((g) => (g.id === "g3" ? { ...g, status: "active" as const } : g));
    const res = await handle({ method: "PUT", path: "/goals", body: { goals: [...(await goals()), ...restored.filter((g) => g.id === "g3")] } });
    expect(res.status).toBe(200);
    expect(ids(await goals())).toContain("g3");
  });
});

describe("LG-1 · day 2 advances a KPI from agent work (resolution #65, contract §4.20)", () => {
  it("moves the value and appends the goal's history, rather than leaving a number only Josh can change", async () => {
    db.reset();
    db.asUser("josh");
    const before = (await goals()).find((g) => g.id === "g2")!;
    const kpiBefore = before.kpis!.find((k) => k.label === "screens shipped")!;
    const historyBefore = before.history.length;

    // reset(clockOffsetMs, scenario) — the scenario is the SECOND argument
    db.reset(0, "day2");
    db.asUser("josh");
    const after = (await goals()).find((g) => g.id === "g2")!;
    const kpiAfter = after.kpis!.find((k) => k.label === "screens shipped")!;

    // the VALUE moved and the TARGET did not: progress, not a moved goalpost
    expect(kpiAfter.value).toBeGreaterThan(kpiBefore.value);
    expect(kpiAfter.target).toBe(kpiBefore.target);
    expect(after.history.length).toBe(historyBefore + 1);
    expect(after.history.at(-1)!.event).toBe("progress");
  });
});

describe("MU-04 · a goal is a labelled record, so clearance scopes it", () => {
  it("Joce does not see Josh's personal goal, and Josh does", async () => {
    db.asUser("josh");
    expect(ids(await goals())).toContain("g3");
    db.asUser("joce");
    expect(ids(await goals())).not.toContain("g3");
  });

  it("a focus narrows the set to the silos it names", async () => {
    expect(ids(await goals({ focus: "work" }))).not.toContain("g3");
    expect(ids(await goals({ focus: "personal" }))).toContain("g3");
  });
});

describe("A4R5-01/02 · absence archives only the goals the caller may read", () => {
  // `putGoals` judged "absent from the submitted list" against every active
  // goal in the household. A session can only submit what its silos let it
  // read (MU-02), so Joce's first goal archived all three of Josh's live goals,
  // wrote three "Goal archived" items into his silos, and filed hers in
  // `personal:josh`, where she could not see it.
  const put = (list: Goal[]) => handle({ method: "PUT", path: "/goals", body: { goals: list } });
  const newGoal = (id: string, silo: string): Goal =>
    ({
      id,
      area: "Family",
      text: "swim carnival costumes",
      status: "active",
      kpis: [],
      taskIds: [],
      deliverableIds: [],
      history: [],
      labels: { silo, types: ["open"], setBy: "josh" },
      setAt: "2026-09-11",
      focus: "personal",
    }) as Goal;

  it("as Joce, adding one goal archives nothing of Josh's, and hers is hers", async () => {
    const joshActive = ids(await goals());
    const joshArchive = ids(await history());
    expect(joshActive.length).toBeGreaterThan(1); // else "nothing archived" proves nothing
    const archiveNotes = () => (db.get().brainItems as BrainItem[]).filter((b) => b.text.startsWith("Goal archived")).length;
    const notesBefore = archiveNotes();

    db.asUser("joce");
    const hers = await goals();
    expect(hers.some((g) => joshActive.includes(g.id))).toBe(false); // she really cannot see his
    const res = await put([...hers, newGoal("goal-joce-1", "personal:joce")]);
    expect(res.status).toBe(200);
    expect(ids(await goals())).toContain("goal-joce-1");

    db.asUser("josh");
    expect(ids(await goals()).sort()).toEqual(joshActive.sort());
    expect(ids(await history()).sort()).toEqual(joshArchive.sort());
    expect(archiveNotes()).toBe(notesBefore);
  });

  it("refuses a new goal filed in a silo the caller cannot read, and accepts it in her own", async () => {
    db.asUser("joce");
    const refused = await put([newGoal("goal-joce-2", "personal:josh")]);
    expect(refused.status).toBe(403);
    expect(db.get().goals.some((g) => g.id === "goal-joce-2")).toBe(false);
    // the positive half: the same goal, in her own silo, is a normal save
    const accepted = await put([newGoal("goal-joce-2", "personal:joce")]);
    expect(accepted.status).toBe(200);
  });

  it("refuses a change to a goal the caller cannot read", async () => {
    const g1 = (await goals()).find((g) => g.id === "g1");
    expect(g1).toBeDefined();
    db.asUser("joce");
    const res = await put([{ ...(g1 as Goal), text: "renamed by someone who cannot see it" }]);
    expect(res.status).toBe(403);
    expect(db.get().goals.find((g) => g.id === "g1")?.text).toBe(g1?.text);
  });
});
