/**
 * The published data bindings for configured sections (B-1, §4.10).
 *
 * A `SectionConfig` block says WHAT it is; a `bind` name says WHERE its
 * rows come from. Both halves are closed lists: the block types live in
 * `layout/catalogue.tsx`, the bind names live here, and `GET
 * /sections/catalogue` is generated from the two so the EA can only pick
 * from what exists (CB-09 asserts the server's copy equals the app's).
 *
 * The alternative — a field path, a filter expression, a URL in the
 * config — is a small language written by a model and evaluated by the
 * app. There is no safe version of that, and there is no feature in the
 * brief that needs it: every section any V2 tab renders is a list, a set
 * of bars, some chips or a paragraph.
 *
 * Each bind is a HOOK. It reads from the store that owns the endpoint —
 * the renderer never calls `ApiAdapter` itself, because the store is
 * where loading, focus, silo filtering, optimistic outbox rows and the
 * server-event refetch already live, and a second path to the same data
 * would have none of them.
 *
 * SELECTOR RULE (B-19): a selector returns a stored reference and nothing
 * else. Shape mapping happens in `useMemo` AFTER the selector, never
 * inside it — a selector that builds an array returns a new identity every
 * time zustand compares, and the component re-renders forever.
 */
import { useMemo } from "react";
import { goalMetaLine } from "@/lib/goalMeta";
import { useLifeStore } from "@/stores/life";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useTaskCardStore } from "@/stores/taskCard";
import { useUsageStore } from "@/stores/usage";
import { formatShort } from "@/lib/time";
import { usageRows, usageStats } from "@/lib/usage";
import { BRAIN_BINDS } from "@/layout/sourcesBrain";
import { useFilesStore } from "@/stores/files";
import { useRepliesStore } from "@/stores/replies";
import type { BindDef } from "@/layout/bindKit";
import type { BlockBar, BlockChip, BlockLine, BlockRow, BlockStat, BlockVerbAction } from "@/data/types";

/** Endpoints a config may name. A bind's endpoint must be one of these
 * (`tests/unit/sections.test.ts`), and a section with only literal blocks
 * still names one — the record says where it belongs. */
export const ENDPOINTS = ["/life", "/people", "/money", "/learning", "/health", "/goals", "/habits", "/usage", "/brain/replies", "/files"] as const;

export const BINDS: Record<string, BindDef> = {
  ...BRAIN_BINDS,

  "people.rows": {
    endpoint: "/people",
    block: "rows",
    label: "People you owe something",
    use: () => {
      const people = useLifeStore((s) => s.people);
      const actPerson = useLifeStore((s) => s.actPerson);
      const items = useMemo<BlockRow[]>(
        () => people.map((p) => ({ id: p.id, name: p.name, item: p.item, meta: p.meta, verb: { label: p.verb.label, action: p.verb.action } })),
        [people],
      );
      return { items, act: (id, action) => actPerson(id, action as "draft" | "nudge" | "done") };
    },
  },

  "learning.rows": {
    endpoint: "/learning",
    block: "rows",
    label: "What you're reading and watching",
    use: () => {
      const learning = useLifeStore((s) => s.learning);
      const openModal = useSessionStore((s) => s.openModal);
      /**
       * OP-06: the rows carry `open` as their verb — a BINDS change, not a
       * component one, because the published binding is what decides whether
       * a configured section offers an action at all. Before this, Learning
       * was the one list in the app whose rows were plainly things you would
       * want to open and had no way to.
       */
      const items = useMemo<BlockRow[]>(
        () => learning.map((l) => ({ id: l.id, name: l.title, meta: l.meta, verb: { label: "open", action: "open" as const } })),
        [learning],
      );
      return {
        items,
        act: async (id) => {
          openModal("learning", id);
        },
      };
    },
  },

  "money.bars": {
    endpoint: "/money",
    block: "bars",
    label: "Budget tracks against their limits",
    use: () => {
      const money = useLifeStore((s) => s.money);
      const items = useMemo<BlockBar[]>(
        () => money.map((m) => ({ id: m.id, label: m.category, value: m.pct, max: 100, amount: `$${m.spent.toLocaleString()}`, over: m.over })),
        [money],
      );
      return { items };
    },
  },

  "money.due": {
    endpoint: "/money",
    block: "text",
    label: "Bills with a date and the feed they came from",
    use: () => {
      const due = useLifeStore((s) => s.moneyDue);
      const items = useMemo<BlockLine[]>(
        // the accented half is the bill and its date; the rest is provenance,
        // and `feed` is read off the wire rather than written here because
        // that field exists precisely to carry it (LF-06, "Redbark, V2.1").
        () => due.map((d, i) => ({ id: `d${i}`, accent: `${d.text} due ${formatShort(d.date.slice(0, 10))}`, text: ` · feed: ${d.feed}` })),
        [due],
      );
      return { items };
    },
  },

  "habits.chips": {
    endpoint: "/habits",
    block: "chips",
    label: "Today's habits as tappable chips",
    use: () => {
      const habits = useLifeStore((s) => s.habits);
      const logs = useLifeStore((s) => s.habitLogs);
      const items = useMemo<BlockChip[]>(
        () => habits.map((h) => ({ id: h.id, label: h.name, on: logs.some((l) => l.habitId === h.id && l.done) })),
        [habits, logs],
      );
      return { items };
    },
  },

  "goals.rows": {
    endpoint: "/goals",
    block: "rows",
    label: "Goals with their progress line",
    use: () => {
      const goals = useLifeStore((s) => s.goals);
      // LG-1: the same line the card shows (`g.status` is an enum now).
      const items = useMemo<BlockRow[]>(() => goals.map((g) => ({ id: g.id, name: g.text, item: g.area, meta: goalMetaLine(g) })), [goals]);
      return { items };
    },
  },

  /**
   * T-4, US-03: the month's spend, its tokens, then one stat per agent and one
   * per model — grouped from the rows the summary already carries rather than
   * asked for a second time on the wire. The server groups by model because
   * that is a cross-task question; who spent it is a sum over the same rows,
   * and a `groupBy=agent` round trip would be the server computing what the
   * caller is already holding. `lib/usage.ts` does the shaping, because the
   * task card renders the same numbers.
   */
  "usage.totals": {
    endpoint: "/usage",
    block: "stats",
    label: "What the agents spent this month, by agent and by model",
    use: () => {
      const summary = useUsageStore((s) => s.summary);
      return { items: useMemo<BlockStat[]>(() => (summary == null ? [] : usageStats(summary)), [summary]) };
    },
  },

  /** the log itself: one row per task, newest first, opening the task card
   * (resolution #51 — there is no `usage-task` dialog, because the card is
   * already where a task's runs are listed). */
  "usage.tasks": {
    endpoint: "/usage",
    block: "rows",
    label: "Tasks the agents worked on, newest first",
    use: () => {
      const summary = useUsageStore((s) => s.summary);
      const titles = useUsageStore((s) => s.taskTitles);
      const items = useMemo<BlockRow[]>(() => (summary == null ? [] : usageRows(summary, titles)), [summary, titles]);
      return { items, act: async (id) => useTaskCardStore.getState().openTask(id) };
    },
  },

  "capabilities.list": {
    endpoint: "/health",
    block: "rows",
    label: "Sources that are gated in",
    use: () => {
      const caps = useSettingsStore((s) => s.capabilities);
      const items = useMemo<BlockRow[]>(
        () =>
          Object.entries(caps)
            .filter(([, v]) => typeof v === "boolean")
            .map(([k, v]) => ({ id: k, name: k, meta: v ? "on" : "off" })),
        [caps],
      );
      return { items };
    },
  },
};

// Section-level verbs (T-4) split into their own file at the 250-line limit
// (SM-03), the way `sourcesBrain.ts`'s `BRAIN_BINDS` already is — re-exported
// here so every caller keeps importing `@/layout/sources`.
export { SECTION_VERBS } from "@/layout/sourcesVerbs";

/**
 * The store loader each endpoint needs, for the case a configured section
 * lands on a tab that has not loaded its own data.
 *
 * The focus is passed, and that is not decoration: the tab screen loads with
 * `activeFocus` and this would otherwise load without one, so two calls would
 * be in flight for the same store asking different questions and the answer
 * would be whichever resolved last. Today both say "all" on a first mount, so
 * nothing is visibly wrong — which is exactly the kind of race that is found
 * later, by someone else, on a slower connection.
 */
const life = () => useLifeStore.getState().load(useSettingsStore.getState().activeFocus);

export const LOADERS: Record<string, () => Promise<void>> = {
  "/life": life,
  "/people": life,
  "/money": life,
  "/learning": life,
  "/goals": life,
  "/habits": life,
  "/health": () => useSettingsStore.getState().load(),
  "/usage": () => useUsageStore.getState().load(),
  "/brain/replies": () => useRepliesStore.getState().load(),
  "/files": () => useFilesStore.getState().loadRecent(),
};
