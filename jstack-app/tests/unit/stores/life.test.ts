/** stores/life.ts — load() populates goals/habits/people/money;
 * logHabit() mutates through the adapter and updates local state. */
import { reset as resetDb } from "@/data/mock/db";
import { useLifeStore } from "@/stores/life";
import { useLifeEditsStore } from "@/stores/lifeEdits";
import { getAdapter } from "@/data/provider";
import { loadWhileUnreachable } from "./failingLoad";

beforeEach(() => {
  resetDb();
  useLifeStore.setState({ goals: [], habits: [], habitLogs: [], people: [], money: [], moneyDue: [], sectionConfigs: {} });
});

describe("stores/life.ts", () => {
  it("load() populates goals, habits, people and money", async () => {
    await useLifeStore.getState().load();
    const s = useLifeStore.getState();
    expect(s.goals.length).toBeGreaterThan(0);
    expect(s.habits.length).toBeGreaterThan(0);
    expect(s.people.length).toBeGreaterThan(0);
    expect(s.money.length).toBeGreaterThan(0);
  });

  it("logHabit() records a new log entry", async () => {
    await useLifeStore.getState().logHabit("h2", "2026-01-01", true);
    expect(useLifeStore.getState().habitLogs).toContainEqual({ habitId: "h2", date: "2026-01-01", done: true });
  });

  it("actPerson() reloads people with the new verb action", async () => {
    await useLifeStore.getState().load();
    await useLifeStore.getState().actPerson("pe4", "done");
    expect(useLifeStore.getState().people.find((p) => p.id === "pe4")?.verb.action).toBe("done");
  });
});

describe("load() asks for life and habits together (P-10, F-16)", () => {
  it("getHabits is on the wire before getLife has answered", async () => {
    const habits = jest.spyOn(getAdapter(), "getHabits");
    try {
      const pending = useLifeStore.getState().load();
      expect(habits).toHaveBeenCalledTimes(1);
      await pending;
      expect(useLifeStore.getState().habits.length).toBeGreaterThan(0);
    } finally {
      habits.mockRestore();
    }
  });
});

describe("A4R4-02 · archiveGoal, on a store nothing has loaded", () => {
  it("archives ONLY the goal it was given, and records the status it was given", async () => {
    // `GoalDetail` composed the whole-set write itself, from
    // `useLifeStore.goals`. That array is filled by `load()`, which the TODAY
    // tab calls and nothing else does at boot — and `GoalDetail` gets its own
    // record from `useDetail`, straight off the adapter, never touching the
    // store. So a goal opened from any other tab (the shipped push deep link
    // `/<tab>?ref=goal:g1` is the real path) mapped over an EMPTY array and
    // sent `PUT /goals { goals: [] }`, which the contract reads as "the editor
    // dropped every goal": every goal archived, and the one the person pressed
    // "Done" on recorded as "dropped", because it fell into `removed`.
    //
    // The store owns the composition now and reads the authoritative set from
    // the adapter rather than trusting whatever happens to be loaded.
    const before = await getAdapter().getGoals();
    expect(before.length).toBeGreaterThan(1); // else "only one" proves nothing
    useLifeStore.setState({ goals: [] }); // a cold store: no tab has loaded it

    // A-4 round 5 moved the action to `stores/lifeEdits.ts` (the life store was
    // at its cap); the assertions below are unchanged
    expect(await useLifeEditsStore.getState().archiveGoal("g1", "done")).toBeNull();

    const active = await getAdapter().getGoals();
    // every other goal is untouched and still active
    expect(active.map((g) => g.id).sort()).toEqual(before.filter((g) => g.id !== "g1").map((g) => g.id).sort());
    // and the one that was archived is recorded as DONE, not dropped
    const archived = (await getAdapter().getGoalsHistory()).find((g) => g.id === "g1");
    expect(archived?.status).toBe("done");
  });
});

describe("A4R5-01 · the goal editor under a focus", () => {
  // `GoalEditDialog` saved `useLifeStore.goals` — the list the Life tab loads
  // WITH THE FOCUS — as the whole set. Renaming one goal under Work archived
  // every goal outside Work, each with a "Goal archived" item, and the toast
  // said "Goal saved". The save composes from the server's set now.
  const ids = (rows: { id: string }[]) => rows.map((g) => g.id).sort();

  it("an edit under a focus archives nothing outside it", async () => {
    const everything = await getAdapter().getGoals();
    await useLifeStore.getState().load("work");
    const shown = useLifeStore.getState().goals;
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(everything.length); // the focus really narrowed it

    const target = shown[0];
    const edited = shown.map((g) => (g.id === target.id ? { ...g, text: `${g.text} by October` } : g));
    expect(await useLifeEditsStore.getState().saveGoals(shown, edited)).toBeNull();

    const after = await getAdapter().getGoals();
    expect(ids(after)).toEqual(ids(everything));
    expect(after.find((g) => g.id === target.id)?.text).toBe(`${target.text} by October`);
  });

  it("an ADD under a focus archives nothing, and a removal archives exactly the one removed", async () => {
    const everything = await getAdapter().getGoals();
    await useLifeStore.getState().load("personal");
    const shown = useLifeStore.getState().goals;
    expect(shown.length).toBeLessThan(everything.length);

    const added = { ...everything[0], id: "goal-new-1", text: "sleep by ten", history: [], taskIds: [], deliverableIds: [] };
    expect(await useLifeEditsStore.getState().saveGoals(shown, [...shown, added])).toBeNull();
    expect(ids(await getAdapter().getGoals())).toEqual(ids([...everything, added]));

    // a removal is the editor's other whole-set gesture: only the removed one leaves
    const gone = shown[0];
    expect(await useLifeEditsStore.getState().saveGoals(shown, shown.filter((g) => g.id !== gone.id))).toBeNull();
    expect(ids(await getAdapter().getGoals())).toEqual(ids([...everything, added].filter((g) => g.id !== gone.id)));
  });
});

describe("A4R5-07 · the habit editor after one archive", () => {
  // `HabitEditDialog` built every save from `useLifeStore.habits` — the LISTED
  // habits — and `PUT /habits` refuses a list with a habit missing. So after
  // one archive, every later save (a second archive, an add, a rename, a
  // reorder) was refused with a 422 nobody saw.
  it("a second archive lands, and so does an add after it", async () => {
    await useLifeStore.getState().load();
    const listed = useLifeStore.getState().habits;
    expect(listed.length).toBeGreaterThan(2);

    const first = listed[0];
    expect(await useLifeEditsStore.getState().saveHabits(listed.map((h) => (h.id === first.id ? { ...h, archived: true } : h)))).toBeNull();
    const now = useLifeStore.getState().habits;
    expect(now.some((h) => h.id === first.id)).toBe(false); // the editor no longer lists it

    const second = now[0];
    expect(await useLifeEditsStore.getState().saveHabits(now.map((h) => (h.id === second.id ? { ...h, archived: true } : h)))).toBeNull();
    const after = useLifeStore.getState().habits;
    expect(await useLifeEditsStore.getState().saveHabits([...after, { id: "habit-new-1", name: "Stretch", sort: after.length + 1 }])).toBeNull();

    const all = await getAdapter().getHabits(true);
    expect(all.filter((h) => h.archived === true).map((h) => h.id).sort()).toEqual([first.id, second.id].sort());
    expect(all.some((h) => h.id === "habit-new-1")).toBe(true);
    expect(all.length).toBe(listed.length + 1); // nothing lost on the way
  });
});

/**
 * A-2 (WP-A, v2.3) — Life's load, failing, is recorded rather than thrown at
 * a tab that cannot catch it. The tab calls it fire-and-forget, so offline with
 * nothing cached the rejection went nowhere and the tab rendered an empty shell.
 */
describe("A-2 · a failed load is recorded, not thrown at the tab", () => {
  it("a rejecting read leaves loadError set, goals as it was, and a load that resolves, so nothing is thrown at the tab", async () => {
    const { settled } = await loadWhileUnreachable("getLife", () => useLifeStore.getState().load());
    const s = useLifeStore.getState();
    expect({ loadError: s.loadError, goals: s.goals, settled }).toEqual({ loadError: "Network request failed", goals: [], settled: "resolved" });
  });

  it("the next load that gets through clears it", async () => {
    await loadWhileUnreachable("getLife", () => useLifeStore.getState().load());
    await useLifeStore.getState().load();
    const s = useLifeStore.getState();
    expect({ loadError: s.loadError, loaded: s.goals.length > 0 }).toEqual({ loadError: null, loaded: true });
  });
});
