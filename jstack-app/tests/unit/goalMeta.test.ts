/**
 * `lib/goalMeta.ts` — the ONE composer for a goal's status line (LG-1, LG-02).
 *
 * `Goal.status` used to be a SENTENCE the server wrote — "on track · due
 * {{DATESHORT+8}}", "behind · 2 this week" — with a `statusTone` beside it
 * saying how to colour it. Three surfaces printed that sentence verbatim (the
 * Life card, the `goals.rows` bind and the search snippet), so the app had no
 * say in how a goal described itself, the due date was a literal the fixture
 * computed rather than the field it is describing, and the tone was a second
 * declaration of a fact the status already carried (hard rules 16 and 19).
 *
 * The wire now carries the enum the contract specifies and the KPI it is
 * measured against, and this composes the line: **status · progress · due**.
 */
import { goalKpiStat, goalMetaLine, goalStatusPhrase, goalStatusTone, GOAL_STATUS_LABELS } from "@/lib/goalMeta";
import { atTime } from "@/lib/time";
import type { Goal, GoalStatus } from "@/data/types";

const NOW = atTime("2026-09-09", 9, 0);

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    area: "Health",
    text: "three workouts a week",
    status: "active",
    taskIds: [],
    deliverableIds: [],
    history: [],
    labels: { silo: "personal:josh", types: ["health"], setBy: "josh" },
    setAt: "2026-08-01",
    focus: "personal",
    ...over,
  };
}

describe("LG-02 · every status has a phrase, and no wire enum reaches the screen", () => {
  // hard rule 21: one label map, and a test that EVERY member has a label —
  // a status added to the union later cannot reach a row as its raw name.
  const ALL: GoalStatus[] = ["active", "behind", "done", "dropped"];

  it("labels all four members and nothing else", () => {
    expect(Object.keys(GOAL_STATUS_LABELS).sort()).toEqual([...ALL].sort());
    for (const status of ALL) {
      expect(goalStatusPhrase(status).trim()).not.toBe("");
    }
    // "active" is the one member whose wire name is a FILTER STATE — the goals
    // still in play — rather than a description of how one is going, so it is
    // the one that must not reach a row as itself. "behind", "done" and
    // "dropped" are already the words a person would use, and translating them
    // to something else for the sake of a rule would be worse copy.
    expect(goalStatusPhrase("active")).not.toBe("active");
  });

  it("keeps the two words the pack already ships", () => {
    expect(goalStatusPhrase("active")).toBe("on track");
    expect(goalStatusPhrase("behind")).toBe("behind");
  });

  it("derives the tone from the status rather than carrying it beside it", () => {
    expect(goalStatusTone("behind")).toBe("behind");
    expect(goalStatusTone("active")).toBe("ok");
    expect(goalStatusTone("done")).toBe("ok");
    expect(goalStatusTone("dropped")).toBe("ok");
  });
});

describe("LG-02 · the composed line", () => {
  it("is status alone when there is nothing else to say", () => {
    expect(goalMetaLine(goal({ kpis: [], targetDate: undefined }), NOW)).toBe("on track");
  });

  it("puts the first KPI's progress between the status and the date", () => {
    const line = goalMetaLine(
      goal({
        status: "behind",
        kpis: [{ label: "this week", value: 2, target: 3, unit: "workouts" }],
      }),
      NOW,
    );
    // "2 of 3" and not "2": the old fixture sentence said how many had been
    // done and never what the goal was, so a reader could not tell 2 from
    // behind or 2 from nearly there.
    expect(line).toBe("behind · 2 of 3 this week");
  });

  it("formats the target date through formatDate, not as an instant (resolution #6)", () => {
    // a day key has no clock in it; `formatWhen` would invent a midnight
    const line = goalMetaLine(goal({ targetDate: "2026-09-17" }), NOW);
    expect(line).toBe("on track · due Thu 17 Sep");
    expect(line).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("carries all three parts in the fixed order", () => {
    const line = goalMetaLine(
      goal({
        status: "behind",
        kpis: [{ label: "this week", value: 2, target: 3 }],
        targetDate: "2026-09-17",
      }),
      NOW,
    );
    expect(line).toBe("behind · 2 of 3 this week · due Thu 17 Sep");
  });

  it("never prints an ISO instant, and never the word 'active'", () => {
    for (const status of ["active", "behind", "done", "dropped"] as GoalStatus[]) {
      const line = goalMetaLine(goal({ status, targetDate: "2026-09-17" }), NOW);
      // TD-05's rule on a line the app composes: a day key is a day, and an
      // ISO instant on screen is the defect D-1 exists to prevent
      expect(line).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(line).not.toMatch(/\d{1,2}:\d{2}/);
      expect(line).not.toContain("active");
    }
  });
});

describe("LG-02 · a KPI as a stat", () => {
  it("reads value of target with the unit when there is one", () => {
    expect(goalKpiStat({ label: "this week", value: 2, target: 3, unit: "workouts" })).toBe("2 of 3 workouts");
  });

  it("drops the unit rather than printing an empty one", () => {
    expect(goalKpiStat({ label: "screens shipped", value: 12, target: 18 })).toBe("12 of 18");
  });
});
