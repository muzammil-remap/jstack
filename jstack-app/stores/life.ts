/**
 * life.ts (ADR-04) — goals, habits and their logs, people, money, health,
 * learning, and section configs. The whole-set writes to goals and habits are
 * `stores/lifeEdits.ts`'s: they compose from the server's set, which this store
 * never holds (it is focused, silo-scoped, and lists only tracked habits).
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import { recordLoad } from "@/lib/loadError";
import { attempt, REFUSED } from "@/lib/optimistic";
import { isQueued } from "@/data/transport/outbox";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import type { Goal, Habit, HabitLog, HabitStats, LearningItem, LifeSectionConfig, MoneyDue, MoneyRow, Person } from "@/data/types";

type LifeState = {
  goals: Goal[];
  habits: Habit[];
  habitLogs: HabitLog[];
  people: Person[];
  money: MoneyRow[];
  moneyDue: MoneyDue[];
  learning: LearningItem[];
  habitStats: HabitStats | null;
  sectionConfigs: Record<string, LifeSectionConfig>;
  /** A-2: why the last load failed, or null once one gets through (`lib/loadError.ts`) */
  loadError: string | null;

  load: (focus?: string) => Promise<void>;
  loadArchivedHabits: () => Promise<void>;
  archivedHabits: Habit[];
  logHabit: (habitId: string, date: string, done: boolean) => Promise<void>;
  loadHabitStats: (period: HabitStats["period"], anchor?: string) => Promise<void>;
  actPerson: (id: string, action: "draft" | "nudge" | "done") => Promise<void>;
  loadSectionConfig: (id: string) => Promise<void>;
  saveSectionConfig: (id: string, config: Partial<LifeSectionConfig>) => Promise<void>;
  revertSectionConfig: (id: string) => Promise<void>;
};

/**
 * One day of one habit, changed in the stats the same way it is changed in the
 * logs (LH-05).
 *
 * `done` and `possible` move with it: a tick that left the caption at "17 of
 * 30" while an eighteenth cell filled would be the card disagreeing with
 * itself, and the caption is the number a person reads.
 */
function patchStats(stats: HabitStats | null, habitId: string, date: string, done: boolean): HabitStats | null {
  if (stats == null) return stats;
  return {
    ...stats,
    habits: stats.habits.map((h) => {
      if (h.id !== habitId) return h;
      const was = h.days[date] === true;
      return {
        ...h,
        days: { ...h.days, [date]: done },
        done: h.done + (done ? 1 : 0) - (was ? 1 : 0),
        // a day the window did not know about is a day it now counts
        possible: date in h.days ? h.possible : h.possible + 1,
      };
    }),
  };
}

export const useLifeStore = create<LifeState>((set, get) => ({
  goals: [],
  habits: [],
  habitLogs: [],
  people: [],
  money: [],
  moneyDue: [],
  learning: [],
  habitStats: null,
  archivedHabits: [],
  sectionConfigs: {},
  loadError: null,

  load: (focus) => recordLoad(set, async () => {
    // F-16 (P-10): the two reads go out together — they were awaited in series
    const [life, habits] = await Promise.all([getAdapter().getLife(focus), getAdapter().getHabits()]);
    set({ goals: life.goals, habitLogs: life.habitLogs, people: life.people, money: life.money, moneyDue: life.moneyDue, learning: life.learning, habits });
  }),

  /** The ones Josh has put away, for "Add habit" to offer back (LH-07). Its own
   * request rather than a flag on `load()`: nothing but that dialog wants them,
   * and a composite that carried them would put archived habits one careless
   * `.map` away from the Life card. */
  loadArchivedHabits: async () => {
    const all = await getAdapter().getHabits(true).catch(() => null); // unreadable: "Add habit" offers what it had
    if (all == null) return;
    set({ archivedHabits: all.filter((h) => h.archived === true) });
  },

  loadHabitStats: async (period, anchor) => {
    // LH-1: `anchor` says WHICH month or year, and it was declared on the
    // route and never read until this row — the `files.recentDays` shape.
    const habitStats = await getAdapter().getHabitStats(period, anchor).catch(() => null); // unreadable: the strip stays as it was
    if (habitStats != null) set({ habitStats });
  },

  logHabit: async (habitId, date, done) => {
    const adapter = getAdapter();
    // a tap nothing awaits: refused, nothing is ticked and the refusal is said
    if ((await attempt(() => adapter.postHabitLog(habitId, date, done))) === REFUSED) return;
    set((s) => {
      const idx = s.habitLogs.findIndex((l) => l.habitId === habitId && l.date === date);
      const log: HabitLog = { habitId, date, done };
      const habitLogs = idx === -1 ? [...s.habitLogs, log] : s.habitLogs.map((l, i) => (i === idx ? log : l));
      // LH-05: BOTH, because two surfaces read two different sources for one
      // fact — Today's Close-the-day chips read `habitLogs` (the composite
      // carries today's only) and Life's week strip reads `habitStats` (which
      // carries seven days). Patching one would put a tick on one screen and
      // not the other, which is the class of defect B-15 and B-23 are about.
      return { habitLogs, habitStats: patchStats(s.habitStats, habitId, date, done) };
    });
    // UN-03: habit toggle is one of the four undoable verbs — the caller
    // always passes the NEW value, so the prior one is simply its negation.
    useSessionStore.getState().pushUndo(done ? "Done" : "Undone", async () => {
      await adapter.postHabitLog(habitId, date, !done);
      set((s) => ({
        habitLogs: s.habitLogs.map((l) => (l.habitId === habitId && l.date === date ? { ...l, done: !done } : l)),
        habitStats: patchStats(s.habitStats, habitId, date, !done),
      }));
    });
  },

  actPerson: async (id, action) => {
    const result = await getAdapter().postPersonAct(id, action);
    // O-2: offline this was QUEUED, and reloading would fetch the server's
    // unchanged version straight back over the top of what the person just
    // did. The row shows its queued line from the queue instead (OF-03).
    if (isQueued(result)) {
      await useSyncStore.getState().refresh();
      return;
    }
    await get().load();
  },

  loadSectionConfig: async (id) => {
    // B-3: "this section has no per-section knobs" is a normal answer, not a
    // failure. Since §4.10 there are three kinds of id that reach here — a
    // section with V2 thresholds, a configured section without them, and a
    // decision card carrying a proposal — and only the first has a record at
    // this endpoint. A 404 used to become an unhandled rejection in the
    // dialog that asked.
    const config = await getAdapter().getLifeSectionConfig(id).catch(() => null);
    if (config == null) return;
    set((s) => ({ sectionConfigs: { ...s.sectionConfigs, [id]: config } }));
  },
  saveSectionConfig: async (id, config) => {
    const next = await getAdapter().putLifeSectionConfig(id, config);
    set((s) => ({ sectionConfigs: { ...s.sectionConfigs, [id]: next } }));
  },
  revertSectionConfig: async (id) => {
    const next = await getAdapter().revertLifeSectionConfig(id);
    set((s) => ({ sectionConfigs: { ...s.sectionConfigs, [id]: next } }));
  },
}));
