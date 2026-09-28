/**
 * lifeEdits.ts (A-4 round 5) — the whole-set writes on Life, composed from
 * the set the SERVER holds.
 *
 * `PUT /goals` and `PUT /habits` take the whole set, and absence means
 * something: a goal missing from the list is archived (contract §4.20), a
 * habit missing from it is refused. So the list a write sends has to be the
 * whole set — and `stores/life.ts` never holds it:
 *
 *  - its goals are loaded WITH THE FOCUS (`app/(tabs)/life.tsx`), so an editor
 *    that saved them archived every goal outside the focus (A4R5-01);
 *  - they are silo-scoped to the session, so the owner's "whole set" is not
 *    anyone else's (A4R5-02, the server half is `putGoals`'s);
 *  - its habits are the LISTED ones, so after one archive every save the
 *    editor built was missing a habit and was refused (A4R5-07);
 *  - and on a tab that never loaded Life they are empty (A4R4-02, B-196).
 *
 * So every write here reads the authoritative set first and changes only what
 * the person changed. The editor passes what it SHOWED and what the person made
 * of it; anything it did not show goes back exactly as the server had it.
 *
 * Its own store, beside `stores/life.ts` rather than inside it, for the reason
 * `stores/taskEdits.ts` sits beside `stores/tasks.ts`: the life store was at
 * 199 of its 200 lines, and these are EDITS, not the tab's state. A refusal
 * comes back to the caller (`lib/optimistic.ts`'s `Refusal`), so the dialog
 * can say it rather than dropping an unhandled rejection on the page.
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import type { Refusal } from "@/lib/optimistic";
import { useLifeStore } from "@/stores/life";
import type { Goal, Habit } from "@/data/types";

type LifeEditsState = {
  /** The raw write, for the two composers below and nothing else: the
   *  response is the ACTIVE set the server kept — archiving is its decision,
   *  so the store shows what it filed rather than what was sent. */
  putGoals: (goals: Goal[]) => Promise<void>;
  /** LG-01: `shown` is the list the editor displayed, `next` what the person
   *  made of it — edits, removals (archived) and additions. */
  saveGoals: (shown: Goal[], next: Goal[]) => Promise<Refusal | null>;
  /** LG-04: archive ONE goal, with the status the person pressed. */
  archiveGoal: (id: string, status: Goal["status"]) => Promise<Refusal | null>;
  /** LH-06/LH-07: the listed habits as the editor left them — archive,
   *  restore, rename, reorder, add. */
  saveHabits: (next: Habit[]) => Promise<Refusal | null>;
};

function refusalOf(e: unknown): Refusal {
  const err = e as { status?: number; field?: string; reason?: string };
  return { field: err.status === 422 ? err.field : undefined, reason: err.reason ?? "that could not be saved" };
}

/**
 * The whole active set, with the editor's changes applied to the goals it
 * showed and nothing else touched.
 *
 * A goal the editor showed that the server no longer holds as active (another
 * device archived it meanwhile) is NOT sent back: sending it would bring an
 * archived goal back to life. Only a goal nobody has seen before — a new one —
 * is added.
 */
function composeGoals(current: Goal[], shown: Goal[], next: Goal[]): Goal[] {
  const shownIds = new Set(shown.map((g) => g.id));
  const edited = new Map(next.map((g) => [g.id, g]));
  // A4R6-12: only what the editor EDITS travels — area, title, target date and
  // the measure's name and target — onto the server's copy, so a KPI value or
  // a history entry the server wrote while the editor was open is not
  // overwritten by the editor's older copy of the same goal
  const merge = (server: Goal, mine: Goal): Goal => ({
    ...server,
    area: mine.area,
    text: mine.text,
    status: mine.status,
    targetDate: mine.targetDate,
    kpis: mine.kpis?.map((k, i) => ({ ...k, value: server.kpis?.[i]?.value ?? k.value })),
  });
  const kept = current.flatMap((g) => (!shownIds.has(g.id) ? [g] : edited.has(g.id) ? [merge(g, edited.get(g.id) as Goal)] : []));
  const added = next.filter((g) => !shownIds.has(g.id) && !current.some((c) => c.id === g.id));
  return [...kept, ...added];
}

export const useLifeEditsStore = create<LifeEditsState>((_set, get) => ({
  putGoals: async (goals) => {
    const kept = await getAdapter().putGoals(goals);
    useLifeStore.setState({ goals: kept });
    await useLifeStore.getState().load();
  },

  saveGoals: async (shown, next) => {
    try {
      // no focus: every active goal this session may read — the set the
      // server judges absence against
      const current = await getAdapter().getGoals();
      await get().putGoals(composeGoals(current, shown, next));
      return null;
    } catch (e) {
      return refusalOf(e);
    }
  },

  archiveGoal: async (id, status) => {
    try {
      const current = await getAdapter().getGoals();
      await get().putGoals(current.map((g) => (g.id === id ? { ...g, status } : g)));
      return null;
    } catch (e) {
      return refusalOf(e);
    }
  },

  saveHabits: async (next) => {
    try {
      // the editor lists only the habits being tracked; the ones already put
      // away go back exactly as they are, because a list without them is a
      // list that has dropped a habit, and the route refuses that
      const all = await getAdapter().getHabits(true);
      const archived = all.filter((h) => h.archived === true && !next.some((n) => n.id === h.id));
      const habits = await getAdapter().putHabits([...next, ...archived]);
      useLifeStore.setState({ habits });
      // Today's glance counts habits and Close-the-day draws a chip per habit;
      // a habit just archived belongs in the restore list at once
      await Promise.all([useLifeStore.getState().load(), useLifeStore.getState().loadArchivedHabits()]);
      return null;
    } catch (e) {
      return refusalOf(e);
    }
  },
}));
