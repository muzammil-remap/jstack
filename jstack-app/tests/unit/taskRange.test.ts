/**
 * TF-01, TF-02, TF-09 — the date range every task view now shares (F-1,
 * ADR-44).
 *
 * The range is the one filter that is ALWAYS on. That is what makes it worth
 * its own file: a group nobody selected filters nothing, but a range nobody
 * selected still decides which tasks exist on the screen, so "what does
 * `default` mean here" has to be answerable in one place rather than per view.
 *
 * `resolveRange` is that place, and both halves of the app read it — the chip
 * composes its label from the same window the mock filters by, so the label
 * cannot say "Next 90 days" over a list that is showing thirty.
 */
import { EMPTY_FILTERS, isDefaultRange, rangeLabel, resolveRange, serializeFilters, type RangePreset, type TaskFilters } from "@/data/taskFilters";

const TODAY = "2026-09-08"; // a Tuesday
const DAYS = 90;

describe("TF-01 · `default` resolves per view, and nowhere else", () => {
  it("is the next N days on the open views", () => {
    for (const view of ["list", "board", "gantt"] as const) {
      expect(resolveRange({ preset: "default" }, view, DAYS, TODAY)).toEqual({ from: TODAY, to: "2026-12-07" });
    }
  });

  it("is ALL TIME on Done — Josh, 7 Sep: Done shows everything", () => {
    expect(resolveRange({ preset: "default" }, "done", DAYS, TODAY)).toEqual({});
  });

  it("an EXPLICIT choice is the same on every view — one state, four screens", () => {
    const chosen = { preset: "thisWeek" } as const;
    const open = resolveRange(chosen, "list", DAYS, TODAY);
    expect(resolveRange(chosen, "done", DAYS, TODAY)).toEqual(open);
    expect(resolveRange(chosen, "board", DAYS, TODAY)).toEqual(open);
  });
});

describe("TF-02 · the presets", () => {
  it("thisWeek is Monday to Sunday, not seven days from now", () => {
    expect(resolveRange({ preset: "thisWeek" }, "list", DAYS, TODAY)).toEqual({ from: "2026-09-07", to: "2026-09-13" });
  });

  it("next spans `tasks.rangeDays` forward, last spans it backward", () => {
    expect(resolveRange({ preset: "next" }, "list", 30, TODAY)).toEqual({ from: TODAY, to: "2026-10-08" });
    expect(resolveRange({ preset: "last" }, "list", 30, TODAY)).toEqual({ from: "2026-08-09", to: TODAY });
  });

  it("the window follows the parameter, which is the whole reason it is one", () => {
    expect(resolveRange({ preset: "next" }, "list", 7, TODAY).to).toBe("2026-09-15");
    expect(resolveRange({ preset: "next" }, "list", 365, TODAY).to).toBe("2027-09-08");
  });

  it("all is no window at all", () => {
    expect(resolveRange({ preset: "all" }, "list", DAYS, TODAY)).toEqual({});
  });

  it("custom is exactly what was typed — and a custom with nothing typed is not a window", () => {
    expect(resolveRange({ preset: "custom", from: "2026-09-11", to: "2026-11-30" }, "list", DAYS, TODAY)).toEqual({ from: "2026-09-11", to: "2026-11-30" });
    expect(resolveRange({ preset: "custom" }, "list", DAYS, TODAY)).toEqual({});
  });

  it("a custom half-window is honoured on the side that was given", () => {
    expect(resolveRange({ preset: "custom", from: "2026-09-11" }, "list", DAYS, TODAY)).toEqual({ from: "2026-09-11" });
    expect(resolveRange({ preset: "custom", to: "2026-11-30" }, "list", DAYS, TODAY)).toEqual({ to: "2026-11-30" });
  });
});

describe("TF-02 · what the chip says", () => {
  it("reads the window back in the parameter's own words", () => {
    expect(rangeLabel({ preset: "default" }, "list", DAYS, TODAY)).toBe("Next 90 days");
    expect(rangeLabel({ preset: "default" }, "done", DAYS, TODAY)).toBe("All time");
    expect(rangeLabel({ preset: "next" }, "list", 30, TODAY)).toBe("Next 30 days");
    expect(rangeLabel({ preset: "last" }, "list", 30, TODAY)).toBe("Last 30 days");
    expect(rangeLabel({ preset: "thisWeek" }, "list", DAYS, TODAY)).toBe("This week");
    expect(rangeLabel({ preset: "all" }, "list", DAYS, TODAY)).toBe("All time");
  });

  it("a custom range says its dates, because that is the only thing that describes it", () => {
    expect(rangeLabel({ preset: "custom", from: "2026-09-11", to: "2026-11-30" }, "list", DAYS, TODAY)).toBe("11 Sep – 30 Nov");
    expect(rangeLabel({ preset: "custom", from: "2026-09-11" }, "list", DAYS, TODAY)).toBe("From 11 Sep");
    expect(rangeLabel({ preset: "custom", to: "2026-11-30" }, "list", DAYS, TODAY)).toBe("Until 30 Nov");
    // JQ-5 (A-66, via §4): an unbounded custom range is an invitation, not a
    // window. It read "All time" here, which put that label on two chips.
    expect(rangeLabel({ preset: "custom" }, "list", DAYS, TODAY)).toBe("Select date range");
  });
});

describe("TF-07 · what counts as default, for the Clear control", () => {
  it("`default` is, and every explicit preset is not — including one that happens to match", () => {
    expect(isDefaultRange({ preset: "default" })).toBe(true);
    expect(isDefaultRange({ preset: "next" })).toBe(false);
    expect(isDefaultRange({ preset: "all" })).toBe(false);
  });
});

describe("TF-09 · what goes on the wire", () => {
  it("nothing at all when nothing is chosen — an unfiltered request carries no query", () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBeUndefined();
  });

  it("carries the range once it is not the default", () => {
    const raw = serializeFilters({ ...EMPTY_FILTERS, range: { preset: "thisWeek" } });
    expect(raw).toBeDefined();
    expect((JSON.parse(raw!) as TaskFilters).range).toEqual({ preset: "thisWeek" });
  });

  it("carries `columns`, which is the board's half of the same state (ADR-45)", () => {
    const raw = serializeFilters({ ...EMPTY_FILTERS, columns: ["now", "next"] });
    expect(raw).toBeDefined();
    expect((JSON.parse(raw!) as TaskFilters).columns).toEqual(["now", "next"]);
  });

  it("carries the range beside a group, not instead of it", () => {
    const raw = serializeFilters({ ...EMPTY_FILTERS, priority: ["high"], range: { preset: "all" } })!;
    const parsed = JSON.parse(raw) as TaskFilters;
    expect(parsed.priority).toEqual(["high"]);
    expect(parsed.range.preset).toBe("all");
  });
});

/**
 * JQ-05 (Josh, 8 Sep) — "the date range presets are labelled incorrectly. The
 * second 'All time' should say 'Select date range'."
 *
 * `rangeLabel` fell through to "All time" for a custom range with no bounds
 * yet, and the preset row labels each chip by calling it with the bare preset —
 * so the chip that OPENS the two date fields wore the name of the chip beside
 * it. Two chips, one label, and the one that did something looked like the one
 * that did nothing.
 */
describe("JQ-05 · the custom preset invites, it does not duplicate", () => {
  it("an unbounded custom range reads 'Select date range'", () => {
    expect(rangeLabel({ preset: "custom" }, "list", 90, "2026-09-08")).toBe("Select date range");
  });

  it("and still names the window once there is one", () => {
    expect(rangeLabel({ preset: "custom", from: "2026-09-11", to: "2026-11-30" }, "list", 90, "2026-09-08")).toBe("11 Sep – 30 Nov");
    expect(rangeLabel({ preset: "custom", from: "2026-09-11" }, "list", 90, "2026-09-08")).toBe("From 11 Sep");
  });

  it("every preset the dialog shows has a DIFFERENT label — the complaint, as a guard", () => {
    for (const view of ["list", "done"] as const) {
      const presets: RangePreset[] = view === "done" ? ["all", "thisWeek", "last", "custom"] : ["thisWeek", "next", "last", "all", "custom"];
      const labels = presets.map((preset) => rangeLabel({ preset }, view, 90, "2026-09-08"));
      expect(labels.length).toBe(new Set(labels).size);
    }
  });
});
