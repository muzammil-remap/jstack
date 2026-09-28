/**
 * The section registry (ADR-01): every tab is data, an ordered list of
 * section ids. One `SectionDef` per section; a tab file becomes
 * `<TabScreen tab="..." />` plus header props. `<Columns>` (row 6) owns
 * the three breakpoint rules; `visibleSections()` below applies Arrange
 * (order, hidden) and the feed flag in one place, before rendering.
 *
 * Column assignment and section ids are the mock's own (jstack-mock-v11.html
 * `today()`/`tasksTab()`/`brain()`/`life()`/`agents()`, their `cols([...])`
 * calls) — not reassignable by Arrange (ADR-01: "a section's column is
 * fixed by the registry; Arrange reorders within the tab's list and the
 * column keeps the relative order").
 *
 * Every entry renders the section's own component; the registry is the
 * ORDER and the COLUMN (ADR-01), and nothing else about a section lives here.
 */
import React from "react";
import { View } from "react-native";
import { CalendarGrid } from "@/components/today/CalendarGrid";
import { CalendarList } from "@/components/today/CalendarList";
import { CloseDay } from "@/components/today/CloseDay";
import { Glance } from "@/components/today/Glance";
import { Insight } from "@/components/today/Insight";
import { NeedsYou } from "@/components/today/NeedsYou";
import { YourTasks } from "@/components/today/YourTasks";
import { TaskViews } from "@/components/tasks/TaskViews";
import { WaitingOn } from "@/components/tasks/WaitingOn";
import { Entry } from "@/components/brain/Entry";
import { LatestIn } from "@/components/brain/LatestIn";
import { Find } from "@/components/brain/Find";
import { Memory } from "@/components/brain/Memory";
import { Goals } from "@/components/life/Goals";
import { Habits } from "@/components/life/Habits";
import { Checks } from "@/components/agents/Checks";
import { EmergencyLock } from "@/components/agents/EmergencyLock";
import { Feed } from "@/components/agents/Feed";
import { History } from "@/components/agents/History";
import { Issues } from "@/components/agents/Issues";
import { Portals } from "@/components/agents/Portals";
import { Spend } from "@/components/agents/Spend";
import { Stats } from "@/components/agents/Stats";
import { SectionRenderer } from "@/layout/SectionRenderer";
import type { Capabilities, SectionConfig } from "@/data/types";
import type { Layout } from "@/data/types";
import type { TabId } from "@/layout/tabRoutes";

export type SectionDef = {
  id: string;
  tab: TabId;
  title: string;
  hint?: string;
  column: 1 | 2 | 3;
  /** a column-1 section that spans columns 1+2 at 1180+ (handoff.md, Tasks:
   * "Task list card spans two columns at 1180+"). Only meaningful on column
   * 1, and only when column 2 is otherwise empty on that tab. */
  span?: 2;
  pinned?: boolean;
  feed?: keyof Capabilities;
  render: () => React.ReactElement;
};

export const SECTIONS: SectionDef[] = [
  // ── today ── needs·insights | allcal·calendar | tasks·glance·close
  { id: "needs", tab: "today", title: "Needs you", column: 1, pinned: true, render: () => <NeedsYou /> },
  { id: "insights", tab: "today", title: "From your EA", column: 1, render: () => <Insight /> },
  { id: "allcal", tab: "today", title: "All calendars", column: 2, render: () => <CalendarGrid /> },
  { id: "calendar", tab: "today", title: "Calendar", column: 2, render: () => <CalendarList /> },
  { id: "tasks", tab: "today", title: "Your tasks", column: 3, render: () => <YourTasks /> },
  { id: "glance", tab: "today", title: "At a glance", column: 3, render: () => <Glance /> },
  { id: "close", tab: "today", title: "Close the day", column: 3, render: () => <CloseDay /> },

  // ── tasks ── views (spans 1+2) | — | waiting+gantt   (handoff.md, Tasks)
  { id: "views", tab: "tasks", title: "Tasks", column: 1, span: 2, render: () => <TaskViews /> },
  { id: "waiting", tab: "tasks", title: "Waiting on", column: 3, render: () => <WaitingOn /> },

  // ── brain ── entry·find | latest·replies | memory·files
  // ST-1: Rules has GONE from here, to Settings › Autonomy, where the
  // three-way defaults it qualifies already live. It stayed on Brain
  // through N-1 because W-1 had built the wire and nothing yet rendered
  // the editor — removing it then would have left the rules Josh had
  // taught reachable from nowhere.
  //
  // N-1, BN-01: the order Josh approved in `BRAIN_PROPOSAL.md` on 7 Sep, and
  // the registry is the ONLY place it lives — the tab does three jobs top to
  // bottom, capture then talk then recall.
  //
  // ASK IS ITS OWN SECTION (N-1 lifted it out of the capture card, which gave
  // it no heading of its own and no collapse state). N2-02 (Josh, 10 Sep): it
  // is titled "Ask" — the answer card — because the global search dialog is
  // Find and nothing else is called Find. The id stays `find`: it is a key in
  // every saved layout's `order` and `hidden`.
  //
  // `Replies` (c2) and `Files` (c3) are CONFIG RECORDS from `GET /sections`,
  // merged in by `sectionsWithConfigs()` below — they are in the approved
  // order too, and `fixtures/sections.json` carries their columns.
  { id: "entry", tab: "brain", title: "Brain", column: 1, render: () => <Entry /> },
  { id: "find", tab: "brain", title: "Ask", column: 1, render: () => <Find /> },
  { id: "latest", tab: "brain", title: "Latest in", column: 2, render: () => <LatestIn /> },
  { id: "memory", tab: "brain", title: "Memory", column: 3, render: () => <Memory /> },

  // ── life ── goals·habits | people·money | health·learning
  //
  // Only two of Life's six sections are components. People, Money,
  // Learning and Health are CONFIG RECORDS now (B-2, §4.10) — they come
  // from `GET /sections` and render through `layout/SectionRenderer.tsx`,
  // merged in by `sectionsWithConfigs()` below. They earned that: each was
  // a list, some bars or a paragraph, which is exactly what the catalogue
  // is for. Goals and Habits stay components because they are not — Habits
  // owns a week grid, an optimistic toggle and a stats dialog.
  { id: "goals", tab: "life", title: "Goals", column: 1, render: () => <Goals /> },
  { id: "habits", tab: "life", title: "Habits", column: 1, render: () => <Habits /> },

  // ── agents ── stats·portals·history | needseyes·feed | checks·lock
  // "stats" is the mock's own single "Runs and spend" section — Stats
  // (AG-01) and Spend (AG-02) render together as one registry entry.
  {
    id: "stats",
    tab: "agents",
    title: "Stats",
    column: 1,
    render: () => (
      <>
        <Stats />
        <View style={{ height: 12 }} />
        <Spend />
      </>
    ),
  },
  { id: "portals", tab: "agents", title: "Portals", column: 1, render: () => <Portals /> },
  { id: "history", tab: "agents", title: "History", column: 1, render: () => <History /> },
  { id: "needseyes", tab: "agents", title: "Agent issues", column: 2, pinned: true, render: () => <Issues /> },
  { id: "feed", tab: "agents", title: "Feed", column: 2, render: () => <Feed /> },
  { id: "checks", tab: "agents", title: "Security checks", column: 3, pinned: true, render: () => <Checks /> },
  { id: "lock", tab: "agents", title: "Emergency lock", column: 3, pinned: true, render: () => <EmergencyLock /> },
];

export function sectionsForTab(tab: TabId): SectionDef[] {
  return SECTIONS.filter((s) => s.tab === tab);
}

/**
 * Applies Arrange (order within the tab, hidden) and the feed flag, in
 * that order, then groups the survivors by their fixed column —
 * preserving each column's registry-relative order, reordered only by
 * where `order` places its members relative to each other.
 *
 * `sections` defaults to the tab's registry entries; tests pass a
 * synthetic list to exercise the `feed` gate directly (BUGLOG_v2.md A-37:
 * no shipped section currently sets `feed` — Health's was removed, B-20 —
 * so this is the only way to prove the mechanism itself still works).
 */
/**
 * A configured section as a registry entry (B-2).
 *
 * `feed` is deliberately NOT carried across. The registry's feed flag hides
 * a whole section when its capability is off, and LF-07 needs the opposite
 * — Health VISIBLE as a ghost while `healthFeed` is off (B-20 removed that
 * gate from the static entry for the same reason). `SectionRenderer` does
 * the branching itself: ghost blocks while the flag is off, the rest when
 * it is on.
 */
function configToDef(config: SectionConfig): SectionDef {
  return {
    id: config.id,
    tab: config.tab as TabId,
    title: config.title,
    hint: config.hint,
    column: config.column,
    render: () => <SectionRenderer config={config} />,
  };
}

/**
 * The tab's static entries, then its active configured ones. Order matters
 * and the direction is the point: a config is an ADDITION, so it lands
 * after the hand-written sections in its column, and Arrange (which reads
 * this list) can then move it like any other. A layout saved before a
 * section existed still renders it — `visibleSections` appends anything
 * `order` does not name.
 */
export function sectionsWithConfigs(tab: TabId, configs: SectionConfig[]): SectionDef[] {
  const dynamic = configs.filter((c) => c.tab === tab && c.state === "active").map(configToDef);
  return [...sectionsForTab(tab), ...dynamic];
}

export function visibleSections(
  tab: TabId,
  layout: Layout | null | undefined,
  capabilities: Capabilities,
  sections: SectionDef[] = sectionsForTab(tab),
): SectionDef[][] {
  const all = sections;
  const hidden = new Set(layout?.hidden ?? []);
  const order = layout?.order ?? all.map((s) => s.id);

  const survivors = all.filter((s) => !hidden.has(s.id) && (s.feed == null || capabilities[s.feed] === true));
  const byId = new Map(survivors.map((s) => [s.id, s] as const));
  const ordered = order.map((id) => byId.get(id)).filter((s): s is SectionDef => s != null);
  // any survivor not named in `order` (a section added to the registry
  // after this layout was saved) still renders, appended in registry order
  for (const s of survivors) if (!order.includes(s.id)) ordered.push(s);

  const columns: SectionDef[][] = [[], [], []];
  for (const s of ordered) columns[s.column - 1].push(s);
  return columns;
}
