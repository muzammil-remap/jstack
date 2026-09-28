/**
 * layout/registry.tsx's visibleSections() (ADR-01, AR-01..07). Order/hide
 * are covered end to end by e2e/core/arrange.spec.ts against real registry
 * sections; this file covers the two things that need a synthetic section
 * instead: the `feed` gate (A-37 — no shipped section currently sets
 * `feed`, since Health's was removed for its ghost-card requirement,
 * B-20/LF-07) and column placement staying fixed regardless of `order`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { sectionsForTab, sectionsWithConfigs, visibleSections, type SectionDef } from "@/layout/registry";
import { TABS, tabForPath, tabLabel, tabPath } from "@/layout/tabRoutes";
import sectionsFixture from "@/data/mock/fixtures/sections.json";
import type { Layout, SectionConfig } from "@/data/types";
import { localCapabilitiesFallback } from "@/data/capabilities";

function section(overrides: Partial<SectionDef> & Pick<SectionDef, "id" | "column">): SectionDef {
  return { tab: "today", title: overrides.id, render: () => null as unknown as ReturnType<SectionDef["render"]>, ...overrides };
}

describe("AR-07 / A-37 the feed gate mechanism", () => {
  it("hides a section whose feed capability is off, and shows it once the capability is on", () => {
    const synthetic = section({ id: "test-feed-section", column: 1, feed: "healthFeed" });
    const off = visibleSections("today", null, { ...localCapabilitiesFallback(), healthFeed: false }, [synthetic]);
    expect(off.flat().some((s) => s.id === "test-feed-section")).toBe(false);

    const on = visibleSections("today", null, { ...localCapabilitiesFallback(), healthFeed: true }, [synthetic]);
    expect(on.flat().some((s) => s.id === "test-feed-section")).toBe(true);
  });

  it("a section with no feed flag always renders", () => {
    const synthetic = section({ id: "test-no-feed", column: 1 });
    const columns = visibleSections("today", null, localCapabilitiesFallback(), [synthetic]);
    expect(columns.flat().some((s) => s.id === "test-no-feed")).toBe(true);
  });
});

describe("AR-02 order stays within a section's fixed column", () => {
  it("order reorders survivors within their own column, not across columns", () => {
    const sections = [section({ id: "a", column: 1 }), section({ id: "b", column: 2 }), section({ id: "c", column: 1 })];
    const layout = { tab: "today", order: ["c", "a", "b"], hidden: [], managedBy: "josh" as const, changedAt: "" };
    const columns = visibleSections("today", layout, localCapabilitiesFallback(), sections);
    expect(columns[0].map((s) => s.id)).toEqual(["c", "a"]); // column 1 reordered by `order`
    expect(columns[1].map((s) => s.id)).toEqual(["b"]); // column 2 unaffected
  });

  it("hidden removes a section from every column", () => {
    const sections = [section({ id: "a", column: 1 }), section({ id: "b", column: 1 })];
    const layout = { tab: "today", order: ["a", "b"], hidden: ["b"], managedBy: "josh" as const, changedAt: "" };
    const columns = visibleSections("today", layout, localCapabilitiesFallback(), sections);
    expect(columns.flat().map((s) => s.id)).toEqual(["a"]);
  });
});

describe("CB-03 · configured sections merge in after the static ones", () => {
  const configs = sectionsFixture as SectionConfig[];

  it("Life's static sections come first, then its config records, by column", () => {
    const merged = sectionsWithConfigs("life", configs);
    expect(merged.map((s) => s.id)).toEqual(["goals", "habits", "people", "money", "learning", "health"]);

    const columns = visibleSections("life", null, localCapabilitiesFallback(), merged);
    expect(columns[0].map((s) => s.id)).toEqual(["goals", "habits"]);
    expect(columns[1].map((s) => s.id)).toEqual(["people", "money"]);
    expect(columns[2].map((s) => s.id)).toEqual(["learning", "health"]);
  });

  it("a config for another tab, or one that is not active, does not appear", () => {
    const elsewhere: SectionConfig = { ...configs[0], id: "elsewhere", tab: "agents" };
    const retired: SectionConfig = { ...configs[0], id: "retired-one", state: "retired" };
    const merged = sectionsWithConfigs("life", [...configs, elsewhere, retired]);
    expect(merged.map((s) => s.id)).not.toContain("elsewhere");
    expect(merged.map((s) => s.id)).not.toContain("retired-one");
  });

  it("Arrange can hide and reorder a configured section like any other", () => {
    // Arrange writes `order`/`hidden` by id; nothing about it knows whether a
    // section is a component or a record, which is the point of merging at
    // the registry rather than inside the Life screen.
    const merged = sectionsWithConfigs("life", configs);
    const layout: Layout = { tab: "life", order: ["money", "goals", "habits", "people", "learning", "health"], hidden: ["learning"], managedBy: "josh", changedAt: "2026-09-01T00:00:00.000Z" };
    const columns = visibleSections("life", layout, localCapabilitiesFallback(), merged);
    expect(columns[1].map((s) => s.id)).toEqual(["money", "people"]);
    expect(columns[2].map((s) => s.id)).toEqual(["health"]);
  });

  it("a section added after a layout was saved still renders, appended", () => {
    const merged = sectionsWithConfigs("life", configs);
    const layout: Layout = { tab: "life", order: ["goals", "habits"], hidden: [], managedBy: "josh", changedAt: "2026-09-01T00:00:00.000Z" };
    const columns = visibleSections("life", layout, localCapabilitiesFallback(), merged);
    expect(columns[1].map((s) => s.id)).toEqual(["people", "money"]);
  });

  it("a configured section never carries the registry's feed gate (LF-07)", () => {
    // the gate hides a whole section; Health has to stay VISIBLE as a ghost
    // while healthFeed is off, so the renderer branches instead (B-20).
    const health = sectionsWithConfigs("life", configs).find((s) => s.id === "health");
    expect(health?.feed).toBeUndefined();
    const off = visibleSections("life", null, { ...localCapabilitiesFallback(), healthFeed: false }, sectionsWithConfigs("life", configs));
    expect(off.flat().some((s) => s.id === "health")).toBe(true);
  });
});

/**
 * BN-01 (N-1) — Brain's order, and the registry as the only place it lives.
 *
 * Asserted as LITERAL COLUMNS rather than "the sections are all there",
 * because the order IS the claim: `BRAIN_PROPOSAL.md` describes a tab that
 * does three jobs top to bottom — capture, talk, recall — and a set that
 * happens to contain the right ids in the wrong columns is a different tab.
 * Josh approved this arrangement on 7 Sep; a row that rearranged it silently
 * would be undoing a decision, so this fails the day one is moved.
 */
describe("BN-01 · Brain is the tab Josh approved", () => {
  const configs = sectionsFixture as SectionConfig[];

  it("the three columns are the approved order, configured sections included", () => {
    const merged = sectionsWithConfigs("brain", configs);
    const columns = visibleSections("brain", null, localCapabilitiesFallback(), merged);

    // capture, then the app's one search surface — Find is its own section
    // now rather than something rendered inside the capture card
    // `visibleSections` returns the three columns 0-indexed
    expect(columns[0].map((s) => s.id)).toEqual(["entry", "find"]);
    // what came in, then what the EA answered
    expect(columns[1].map((s) => s.id)).toEqual(["latest", "replies"]);
    // recall: the memory and the files. Rules left at ST-1.
    expect(columns[2].map((s) => s.id)).toEqual(["memory", "files"]);
  });

  it("RULES HAS GONE FROM BRAIN, which is what resolution #40 asked for", () => {
    // This assertion was its own inverse from N-1 until ST-1, and that was the
    // design: resolution #40 says Brain has no Rules section "once ST-1 lands",
    // so N-1 kept the section and asserted the DEFERRAL, and this test went red
    // the moment ST-1 removed it — the reminder to finish the job, rather than
    // a note in a document nobody re-reads (02_ACCEPTANCE_TESTS_v22.md §4).
    //
    // It stays as the opposite claim rather than being deleted: "Brain has no
    // Rules section" is a promise Josh was made, and a promise with no gate is
    // a lie in waiting (hard rule 15). The rules live under Settings › Autonomy
    // now, beside the three-way defaults they qualify.
    const merged = sectionsWithConfigs("brain", configs);
    expect(merged.some((s) => s.id === "rules")).toBe(false);
  });
});

/**
 * P-6 (F-40, F-71, F-28, N2-02) — the tabs are declared ONCE, the registry
 * carries no scaffolding, and Brain's answer section is titled the way Josh
 * decided. The first case walks the source because the defect it guards is
 * a sixth copy of the table appearing in a file that never imports it.
 */
const root = join(__dirname, "..", "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(rel));
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

describe("P-6 · one tab table, and a registry that only registers", () => {
  it("the five tabs live in layout/tabRoutes.ts and nowhere else — no other source file spells a tab's path or icon (F-40)", () => {
    const files = [...walk("app"), ...walk("components"), ...walk("layout"), ...walk("lib"), ...walk("stores")];
    const paths = files.filter((rel) => readFileSync(join(root, rel), "utf8").includes('"/agents"'));
    expect(paths).toEqual(["layout/tabRoutes.ts"]);
    // the icon is the table's too — Rail carried its own copy of theme/tokens.ts `iconNames`
    const icons = files.filter((rel) => /"(wb_sunny|task_alt|neurology|explore|hub)"/.test(readFileSync(join(root, rel), "utf8")));
    expect(icons).toEqual([]);
  });

  it("TabId is the table's ids, and the helpers answer for a path, an id and a label", () => {
    expect(TABS.map((t) => t.id)).toEqual(["today", "tasks", "brain", "life", "agents"]);
    expect(tabForPath("/brain")).toBe("brain");
    expect(tabForPath("/nowhere")).toBeUndefined();
    expect(tabPath("agents")).toBe("/agents");
    // a search result's `tab` is a wire string: an unknown one goes home
    expect(tabPath("elsewhere")).toBe("/");
    expect(tabLabel("life")).toBe("Life");
    expect(tabLabel("elsewhere")).toBe("elsewhere");
  });

  it("the registry has no stub and no stale Rules paragraph (F-28)", () => {
    const src = readFileSync(join(root, "layout/registry.tsx"), "utf8");
    expect(src).not.toMatch(/SectionStub|RULES IS STILL HERE/);
  });

  it("Brain's answer section is titled Ask — the global search dialog is the only Find (N2-02, Josh 10 Sep)", () => {
    const answer = sectionsForTab("brain").find((s) => s.id === "find");
    // the id stays `find`: it is a key in every saved layout's `order` and `hidden`
    expect(answer?.title).toBe("Ask");
    expect(sectionsForTab("brain").filter((s) => s.title === "Find")).toEqual([]);
  });
});
